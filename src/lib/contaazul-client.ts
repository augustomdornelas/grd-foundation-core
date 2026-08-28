// ============================================================
// Cliente da API v1 da Conta Azul — SÓ SERVIDOR
// ------------------------------------------------------------
// Nenhuma chamada à Conta Azul sai do navegador. O front fala com as
// server functions de contaazul-server.ts; elas falam com este
// arquivo; este arquivo fala com a Conta Azul. Token e client_secret
// nunca chegam ao cliente.
//
// A divisão com contaazul-tokens.ts é de propósito e vale de mão
// única: aquele arquivo é dono do token (banco, troca, renovação);
// este só pede um token válido e faz a requisição. Este arquivo não
// conhece a tabela e não sabe renovar — se soubesse, existiriam dois
// lugares gravando o refresh_token rotativo, que é exatamente o que
// quebra a integração.
//
// TRÊS COISAS QUE ELE RESOLVE DE UMA VEZ, para não serem repetidas em
// cada chamada:
//
//   1. O Bearer, sempre válido. `obterAccessTokenValido()` renova
//      quando falta menos de 5 min — a renovação acontece antes da
//      requisição, e não como conserto depois de um 401.
//   2. O teto de chamadas. A API aceita 600 por minuto e 10 por
//      segundo. Quem estoura leva 429, e um job que estoura em rajada
//      leva 429 em todas as chamadas seguintes. A fila abaixo segura
//      antes de sair, em vez de descobrir depois.
//   3. Retry só onde faz sentido: 429 e 5xx, com espera crescente. Em
//      4xx NÃO há retry — o servidor recusou o conteúdo, e repetir um
//      POST recusado só multiplica o erro, ou duplica lançamento.
//
// NADA AQUI ESPELHA DADO AINDA. As etapas 1 e 2 param no encanamento;
// as chamadas de contas a pagar e a receber entram na etapa seguinte,
// e entram como funções finas em cima de `contaAzulFetch`.
// ============================================================

import { ContaAzulErro, obterAccessTokenValido } from "@/lib/contaazul-tokens";

// Guarda de segurança: se este módulo algum dia for importado por
// código de tela, a falha precisa ser barulhenta e imediata, e não um
// vazamento silencioso de credencial para o bundle.
if (typeof window !== "undefined") {
  throw new Error(
    "contaazul-client.ts é código de servidor e foi importado no navegador. " +
      "Use as server functions de contaazul-server.ts.",
  );
}

/** Base da API de negócio. O /oauth/token mora em contaazul-tokens.ts. */
const API = "https://api-v2.contaazul.com/v1/";

const TIMEOUT_MS = 30_000;
const TENTATIVAS = 3;

/** Limites publicados por eles. Ver a fila logo abaixo. */
const TETO_POR_SEGUNDO = 10;
const TETO_POR_MINUTO = 600;

export { ContaAzulErro };

// ------------------------------------------------------------
// Fila: o teto de chamadas, respeitado antes de sair
// ------------------------------------------------------------
// Duas janelas deslizantes, uma de 1s e uma de 60s. Guardam só os
// instantes das chamadas já feitas; antes de cada requisição, quem
// está sobrando espera o suficiente para a janela abrir.
//
// A alternativa — mandar tudo e tratar o 429 — funciona pior do que
// parece: o 429 já custou uma requisição, e numa rajada ele chega em
// série, atrasando mais do que a espera teria atrasado.
//
// A trava é DESTE PROCESSO. Com duas instâncias do servidor, o teto
// efetivo dobra e o 429 volta a ser possível — por isso o retry de 429
// continua existindo, mesmo com a fila.
const janelaSegundo: number[] = [];
const janelaMinuto: number[] = [];

/** Fila serializada: sem isto, dez chamadas simultâneas calculam a
 *  mesma espera e saem todas juntas depois dela. */
let vezDaProxima: Promise<void> = Promise.resolve();

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function podarJanelas(agora: number): void {
  while (janelaSegundo.length && agora - janelaSegundo[0] >= 1_000) janelaSegundo.shift();
  while (janelaMinuto.length && agora - janelaMinuto[0] >= 60_000) janelaMinuto.shift();
}

async function pegarVaga(): Promise<void> {
  const minhaVez = vezDaProxima.then(async () => {
    for (;;) {
      const agora = Date.now();
      podarJanelas(agora);

      const esperaSegundo =
        janelaSegundo.length >= TETO_POR_SEGUNDO ? 1_000 - (agora - janelaSegundo[0]) : 0;
      const esperaMinuto =
        janelaMinuto.length >= TETO_POR_MINUTO ? 60_000 - (agora - janelaMinuto[0]) : 0;
      const espera = Math.max(esperaSegundo, esperaMinuto);

      if (espera <= 0) {
        janelaSegundo.push(agora);
        janelaMinuto.push(agora);
        return;
      }
      await esperar(espera);
    }
  });

  // A próxima só é liberada depois desta pegar a vaga, mesmo que esta
  // falhe — daí o catch vazio, que não engole erro nenhum: quem espera
  // o resultado é `minhaVez`, devolvido logo abaixo.
  vezDaProxima = minhaVez.catch(() => {});
  return minhaVez;
}

// ------------------------------------------------------------
// Erros de rede, em português
// ------------------------------------------------------------
function mensagemDeRede(e: unknown): string {
  if (e instanceof DOMException && e.name === "TimeoutError") {
    return `a Conta Azul não respondeu em ${TIMEOUT_MS / 1000}s`;
  }
  if (e instanceof Error) {
    const causa = (e as { cause?: { code?: string } }).cause;
    if (causa?.code === "ENOTFOUND") return "não foi possível resolver o endereço da Conta Azul";
    if (causa?.code === "ECONNREFUSED") return "a Conta Azul recusou a conexão";
    return e.message;
  }
  return String(e);
}

function descreverStatus(status: number, caminho: string): string {
  if (status === 401) {
    return (
      "A Conta Azul recusou o token (HTTP 401). Se repetir depois de uma renovação, " +
      "a autorização foi revogada e é preciso conectar de novo em Integrações > Conta Azul."
    );
  }
  if (status === 403) {
    return `A Conta Azul negou o acesso a ${caminho} (HTTP 403). O escopo autorizado não cobre este recurso.`;
  }
  if (status === 404) return `Recurso não encontrado na Conta Azul: ${caminho}.`;
  if (status === 429) {
    return "A Conta Azul recusou por excesso de requisições (429). O teto é 600 por minuto e 10 por segundo.";
  }
  return `A Conta Azul recusou a requisição (HTTP ${status}) em ${caminho}.`;
}

/**
 * Quanto esperar antes da próxima tentativa. `Retry-After` manda
 * quando vem — o servidor sabe melhor que a nossa conta de padeiro.
 */
function esperaDaTentativa(tentativa: number, resposta: Response | null): number {
  const cabecalho = resposta?.headers.get("retry-after");
  if (cabecalho) {
    const segundos = Number(cabecalho);
    if (Number.isFinite(segundos) && segundos >= 0) return Math.min(segundos * 1_000, 30_000);
  }
  return 500 * 2 ** (tentativa - 1);
}

// ------------------------------------------------------------
// A requisição
// ------------------------------------------------------------
export type OpcoesContaAzul = {
  metodo?: string;
  corpo?: unknown;
  /** Vira query string. Valores nulos ou vazios são descartados. */
  query?: Record<string, string | number | undefined | null>;
};

function montarUrl(caminho: string, query: OpcoesContaAzul["query"]): string {
  // O caminho vem sem barra inicial ("sales", "financial-events") para
  // que a base termine em "/v1/" e a junção não perca o "/v1".
  const url = new URL(caminho.replace(/^\/+/, ""), API);
  for (const [chave, valor] of Object.entries(query ?? {})) {
    if (valor === undefined || valor === null || valor === "") continue;
    url.searchParams.set(chave, String(valor));
  }
  return url.toString();
}

/**
 * Uma chamada à API v1, com Bearer válido, fila de teto e retry.
 *
 * Devolve `undefined` para 204 e para corpo vazio — quem chama declara
 * o tipo esperado e trata isso, em vez de este arquivo inventar um
 * objeto que a API não mandou.
 */
export async function contaAzulFetch<T>(caminho: string, opcoes: OpcoesContaAzul = {}): Promise<T> {
  const url = montarUrl(caminho, opcoes.query);
  let ultimoErro: ContaAzulErro | null = null;

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    // Antes da fila, e não depois: uma renovação pendente não deve
    // consumir a vaga do teto, que é de chamada à API de negócio.
    const token = await obterAccessTokenValido();
    await pegarVaga();

    let resposta: Response;
    try {
      resposta = await fetch(url, {
        method: opcoes.metodo ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(opcoes.corpo !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      // Falha de rede: nada chegou do outro lado, então repetir é
      // seguro mesmo em POST.
      ultimoErro = new ContaAzulErro(`Falha ao chamar ${caminho}: ${mensagemDeRede(e)}`);
      if (tentativa < TENTATIVAS) {
        await esperar(esperaDaTentativa(tentativa, null));
        continue;
      }
      throw ultimoErro;
    }

    if (resposta.ok) {
      const texto = await resposta.text();
      if (!texto) return undefined as T;
      try {
        return JSON.parse(texto) as T;
      } catch {
        throw new ContaAzulErro(
          `Resposta ilegível de ${caminho}.`,
          resposta.status,
          texto.slice(0, 300),
        );
      }
    }

    const texto = await resposta.text();

    // 429 e 5xx: o servidor não recusou o CONTEÚDO, recusou o momento.
    // São os dois únicos casos em que repetir a mesma requisição pode
    // dar outro resultado.
    if (resposta.status === 429 || resposta.status >= 500) {
      ultimoErro = new ContaAzulErro(
        descreverStatus(resposta.status, caminho),
        resposta.status,
        texto.slice(0, 500),
      );
      if (tentativa < TENTATIVAS) {
        await esperar(esperaDaTentativa(tentativa, resposta));
        continue;
      }
      throw ultimoErro;
    }

    // Todo o resto do 4xx: sem retry, nunca. Ver o cabeçalho.
    throw new ContaAzulErro(
      descreverStatus(resposta.status, caminho),
      resposta.status,
      texto.slice(0, 500),
      // 401 aqui já é com token renovado: a autorização morreu.
      resposta.status === 401,
    );
  }

  throw ultimoErro ?? new ContaAzulErro(`Falha desconhecida em ${caminho}.`);
}
