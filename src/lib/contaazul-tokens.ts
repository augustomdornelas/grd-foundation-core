// ============================================================
// O token da Conta Azul: onde mora, como nasce, como se renova
// — SÓ SERVIDOR
// ------------------------------------------------------------
// Este é o ÚNICO arquivo do sistema que conhece a tabela
// `integracao_contaazul`. Ler, gravar e renovar passam todos por aqui,
// atrás de meia dúzia de funções. O cliente HTTP (contaazul-client.ts)
// pede um access_token válido e não sabe se ele veio do banco ou de
// uma renovação; a tela (contaazul-server.ts) pede o status e recebe
// datas, nunca o segredo.
//
// A REGRA QUE MANDA NESTE ARQUIVO: o refresh_token ROTACIONA.
//
// A cada renovação a Conta Azul devolve um refresh_token NOVO e
// invalida o anterior. Um código que persistisse só o access_token
// funcionaria por uma hora e morreria na primeira renovação — e o erro
// apareceria longe daqui, como um "invalid_grant" no meio de uma
// sincronização de madrugada. Por isso `gravar()` é a única porta de
// escrita e ela grava o par inteiro, sempre. Não existe caminho neste
// arquivo que atualize um dos dois sozinho.
//
// Validade: access_token 3600s; refresh_token 5 anos ou até a próxima
// renovação, o que vier primeiro.
// ============================================================

// Guarda de segurança: client_secret e refresh_token não têm nenhuma
// desculpa para existir no navegador. Se este módulo cair num bundle
// de tela, a falha tem que ser barulhenta e imediata.
if (typeof window !== "undefined") {
  throw new Error(
    "contaazul-tokens.ts é código de servidor e foi importado no navegador. " +
      "Isto exporia o client_secret e o refresh_token da Conta Azul.",
  );
}

// ------------------------------------------------------------
// Endereços oficiais (conferidos na documentação em 28/08/2026)
// ------------------------------------------------------------
/**
 * O "#/" no meio NÃO é engano de digitação: o autorizador da Conta
 * Azul é uma SPA, e a rota de autorização vive no fragmento. Os
 * parâmetros vêm depois dele. Montar essa URL com `new URL()` ou
 * `URLSearchParams` colocaria a query ANTES do "#", que é o formato
 * que a Conta Azul não reconhece — daí a concatenação manual em
 * `montarUrlDeAutorizacao()`.
 */
const AUTORIZAR = "https://login.contaazul.com/#/oauth/authorize";

/** Troca e renovação. POST, form-urlencoded, credencial em Basic. */
const TOKEN = "https://api-v2.contaazul.com/oauth/token";

/**
 * Escopo fixo, separado por "+" — é o formato que eles esperam na URL
 * de autorização. É outro motivo para não usar `URLSearchParams` lá:
 * ela escaparia o "+" para "%2B" e o escopo chegaria com o nome
 * errado.
 */
const ESCOPO = "openid+profile+aws.cognito.signin.user.admin";

const TIMEOUT_MS = 20_000;

/**
 * Folga de renovação. Um token que vence no meio do caminho da
 * requisição vira 401 na cara de quem está usando; cinco minutos
 * cobrem uma sincronização inteira sem virar renovação a toda hora.
 */
export const MARGEM_MS = 5 * 60_000;

// ------------------------------------------------------------
// Erro
// ------------------------------------------------------------
export class ContaAzulErro extends Error {
  readonly status: number;
  readonly corpo: string;
  /** true quando a autorização morreu de vez e só reconectar resolve. */
  readonly precisaReconectar: boolean;

  constructor(mensagem: string, status = 0, corpo = "", precisaReconectar = false) {
    super(mensagem);
    this.name = "ContaAzulErro";
    this.status = status;
    this.corpo = corpo;
    this.precisaReconectar = precisaReconectar;
  }
}

// ------------------------------------------------------------
// Credenciais, vindas do ambiente
// ------------------------------------------------------------
// NUNCA com prefixo VITE_ e nunca no .env versionado: os dois caminhos
// publicariam o client_secret no bundle do navegador.
export type CredenciaisContaAzul = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
};

export function lerCredenciais(): CredenciaisContaAzul | null {
  const clientId = process.env.CONTAAZUL_CLIENT_ID?.trim();
  const clientSecret = process.env.CONTAAZUL_CLIENT_SECRET?.trim();
  const redirectUri = process.env.CONTAAZUL_REDIRECT_URI?.trim();
  const stateSecret = process.env.CONTAAZUL_STATE_SECRET?.trim();
  if (!clientId || !clientSecret || !redirectUri || !stateSecret) return null;
  return { clientId, clientSecret, redirectUri, stateSecret };
}

const NOMES_DAS_CREDENCIAIS = [
  "CONTAAZUL_CLIENT_ID",
  "CONTAAZUL_CLIENT_SECRET",
  "CONTAAZUL_REDIRECT_URI",
  "CONTAAZUL_STATE_SECRET",
] as const;

export function credenciaisFaltando(): string {
  return NOMES_DAS_CREDENCIAIS.filter((nome) => !process.env[nome]?.trim()).join(", ");
}

/**
 * A URL para onde o usuário é mandado. O `state` vem de fora porque
 * quem o assina é o endpoint /api/contaazul/conectar — este arquivo
 * cuida de token, não de CSRF.
 */
export function montarUrlDeAutorizacao(credenciais: CredenciaisContaAzul, state: string): string {
  const parametros = [
    "response_type=code",
    `client_id=${encodeURIComponent(credenciais.clientId)}`,
    `redirect_uri=${encodeURIComponent(credenciais.redirectUri)}`,
    `state=${encodeURIComponent(state)}`,
    // Sem encodeURIComponent: o "+" aqui é separador, não caractere.
    `scope=${ESCOPO}`,
  ];
  return `${AUTORIZAR}?${parametros.join("&")}`;
}

// ------------------------------------------------------------
// O que a tela pode ver
// ------------------------------------------------------------
// Repare no que NÃO está aqui: access_token e refresh_token. A tela
// mostra se está ligado e desde quando; o segredo não atravessa a
// fronteira do servidor em nenhuma direção.
export type StatusContaAzul = {
  conectado: boolean;
  /** ISO. Quando alguém autorizou pela primeira vez. */
  conectadoEm: string | null;
  /** ISO. Última troca de tokens — o sinal de vida da integração. */
  renovadoEm: string | null;
  /** ISO. Quando o access_token atual vence. */
  expiraEm: string | null;
  /** true quando já venceu e a próxima chamada vai renovar. */
  vencido: boolean;
  conectadoPor: string;
  escopo: string;
};

// ------------------------------------------------------------
// A linha do banco
// ------------------------------------------------------------
type LinhaTokens = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  escopo: string;
  expira_em: string;
  conectado_em: string;
  renovado_em: string;
  conectado_por: string;
};

const TABELA = "integracao_contaazul";

async function db() {
  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  return supabaseAdmin();
}

async function lerLinha(): Promise<LinhaTokens | null> {
  const cliente = await db();
  const { data, error } = await cliente
    .from(TABELA)
    .select(
      "access_token, refresh_token, token_type, escopo, expira_em, conectado_em, renovado_em, conectado_por",
    )
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    throw new ContaAzulErro(`Falha ao ler o token da Conta Azul no banco: ${error.message}`);
  }
  return (data as LinhaTokens | null) ?? null;
}

type RespostaDeToken = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

/**
 * A ÚNICA porta de escrita, e ela grava o par inteiro.
 *
 * `conectado_em` e `conectado_por` só entram na primeira autorização —
 * numa renovação são preservados, porque a pergunta que respondem
 * ("desde quando, e quem autorizou") não muda quando o token é
 * trocado.
 */
async function gravar(
  resposta: RespostaDeToken,
  refreshAnterior: string | null,
  primeiraConexao: { conectadoPor: string } | null,
): Promise<void> {
  // A Conta Azul devolve um refresh_token novo a cada renovação. Se um
  // dia vier sem, manter o anterior é a única saída segura: gravar
  // vazio quebraria a próxima renovação e exigiria reconectar à mão.
  const refresh = resposta.refresh_token || refreshAnterior;
  if (!refresh) {
    throw new ContaAzulErro(
      "A Conta Azul respondeu sem refresh_token e não havia um anterior guardado. " +
        "A conexão precisa ser refeita.",
      0,
      "",
      true,
    );
  }
  if (!resposta.refresh_token) {
    console.warn(
      "[contaazul] renovação veio sem refresh_token; mantido o anterior. " +
        "Se repetir, o comportamento da API mudou e este arquivo precisa de revisão.",
    );
  }

  const agora = new Date();
  const expiraEm = new Date(agora.getTime() + (resposta.expires_in ?? 3600) * 1000);

  const linha: Record<string, unknown> = {
    id: 1,
    access_token: resposta.access_token,
    refresh_token: refresh,
    token_type: resposta.token_type || "bearer",
    escopo: resposta.scope || ESCOPO.replace(/\+/g, " "),
    expira_em: expiraEm.toISOString(),
    renovado_em: agora.toISOString(),
  };
  if (primeiraConexao) {
    linha.conectado_em = agora.toISOString();
    linha.conectado_por = primeiraConexao.conectadoPor;
  }

  const cliente = await db();
  const { error } = await cliente.from(TABELA).upsert(linha, { onConflict: "id" });
  if (error) {
    throw new ContaAzulErro(`Falha ao gravar o token da Conta Azul: ${error.message}`);
  }
}

// ------------------------------------------------------------
// A conversa com o /oauth/token
// ------------------------------------------------------------
/** Basic base64(client_id:client_secret) — é assim que eles querem. */
function autorizacaoBasica(c: CredenciaisContaAzul): string {
  return `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}`;
}

function exigirCredenciais(): CredenciaisContaAzul {
  const credenciais = lerCredenciais();
  if (!credenciais) {
    throw new ContaAzulErro(
      `Faltam credenciais no ambiente do servidor: ${credenciaisFaltando()}. ` +
        "Cadastre no painel do host (nunca no .env versionado, nunca com prefixo VITE_).",
    );
  }
  return credenciais;
}

/**
 * Lê o corpo de erro do /oauth/token.
 *
 * Tolerante de propósito: a resposta vem com quebras de linha e recuo
 * em volta do JSON, e um dia pode vir sem JSON nenhum. Falhar a
 * leitura do erro não pode virar um segundo erro que esconde o
 * primeiro — sem os campos, quem chama cai na mensagem genérica.
 */
function lerErroDeles(texto: string): { codigo: string; descricao: string } {
  try {
    const corpo = JSON.parse(texto) as { error?: unknown; error_description?: unknown };
    return {
      codigo: typeof corpo.error === "string" ? corpo.error : "",
      descricao: typeof corpo.error_description === "string" ? corpo.error_description.trim() : "",
    };
  } catch {
    return { codigo: "", descricao: "" };
  }
}

async function pedirToken(
  credenciais: CredenciaisContaAzul,
  corpo: URLSearchParams,
): Promise<RespostaDeToken> {
  let resposta: Response;
  try {
    resposta = await fetch(TOKEN, {
      method: "POST",
      headers: {
        Authorization: autorizacaoBasica(credenciais),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: corpo.toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const motivo =
      e instanceof DOMException && e.name === "TimeoutError"
        ? `a Conta Azul não respondeu em ${TIMEOUT_MS / 1000}s`
        : e instanceof Error
          ? e.message
          : String(e);
    throw new ContaAzulErro(`Falha ao falar com o /oauth/token da Conta Azul: ${motivo}`);
  }

  const texto = await resposta.text();

  if (!resposta.ok) {
    const { codigo, descricao } = lerErroDeles(texto);

    // MEDIDO CONTRA A API EM 28/08/2026, e não deduzido do padrão
    // OAuth: para um code expirado ou já usado, a Conta Azul devolve
    // `invalid_request`, e não o `invalid_grant` que a especificação
    // reserva para esse caso. Reconhecer só `invalid_grant` deixaria o
    // erro mais comum do fluxo cair no genérico "HTTP 400".
    //
    // Os dois significam a mesma coisa aqui: a autorização não vale
    // mais e a saída é começar de novo, não tentar de novo.
    const morreu =
      codigo === "invalid_grant" || (resposta.status === 400 && codigo === "invalid_request");

    // A descrição deles é longa, mas é a melhor que existe: diz code
    // expirado, redirect_uri diferente ou Basic errado, que são
    // exatamente as três causas. Repassar em vez de resumir.
    throw new ContaAzulErro(
      descricao
        ? `A Conta Azul recusou o pedido de token (HTTP ${resposta.status}${codigo ? `, ${codigo}` : ""}): ${descricao}`
        : `A Conta Azul recusou o pedido de token (HTTP ${resposta.status}).`,
      resposta.status,
      texto.slice(0, 500),
      morreu,
    );
  }

  let dados: RespostaDeToken;
  try {
    dados = JSON.parse(texto) as RespostaDeToken;
  } catch {
    throw new ContaAzulErro(
      "A Conta Azul devolveu uma resposta de token ilegível.",
      resposta.status,
      texto.slice(0, 300),
    );
  }
  if (!dados.access_token) {
    throw new ContaAzulErro("A Conta Azul respondeu sem access_token.", resposta.status);
  }
  return dados;
}

// ------------------------------------------------------------
// Conectar: o code vira o par de tokens
// ------------------------------------------------------------
/**
 * Usado pelos dois caminhos que existem hoje: o /api/contaazul/callback
 * (que é o que vale em produção) e a troca manual da tela, que existe
 * porque a redirect_uri deste App aponta para fora do Portal.
 */
export async function conectarComCodigo(code: string, quem: string): Promise<StatusContaAzul> {
  const credenciais = exigirCredenciais();

  const resposta = await pedirToken(
    credenciais,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      // Vai de novo, e igual à da autorização: a Conta Azul compara as
      // duas. Uma barra a mais no fim já derruba a troca.
      redirect_uri: credenciais.redirectUri,
    }),
  );

  await gravar(resposta, null, { conectadoPor: quem });
  return lerStatus();
}

// ------------------------------------------------------------
// Renovar
// ------------------------------------------------------------
/**
 * Renovação em voo, para que dez chamadas simultâneas não gastem dez
 * refresh_tokens — e, pior, não apresentem à Conta Azul um token que a
 * chamada vizinha acabou de invalidar.
 *
 * ISTO VALE DENTRO DE UM PROCESSO SÓ. Com duas instâncias do servidor
 * renovando no mesmo segundo, a segunda leva `invalid_grant`. Hoje o
 * Portal roda em processo único; no dia em que não rodar, o lugar de
 * resolver é aqui, com um lock na própria linha do banco.
 */
let renovacaoEmCurso: Promise<string> | null = null;

async function renovar(linha: LinhaTokens): Promise<string> {
  const credenciais = exigirCredenciais();

  const resposta = await pedirToken(
    credenciais,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: linha.refresh_token,
    }),
  );

  // O par inteiro, no mesmo UPDATE. Ver o cabeçalho do arquivo.
  await gravar(resposta, linha.refresh_token, null);
  return resposta.access_token;
}

/**
 * O que o cliente HTTP consome: um access_token que ainda vale pelos
 * próximos 5 minutos, renovado por baixo se preciso.
 */
export async function obterAccessTokenValido(): Promise<string> {
  const linha = await lerLinha();
  if (!linha) {
    throw new ContaAzulErro(
      "A Conta Azul não está conectada. Autorize em Integrações > Conta Azul.",
      0,
      "",
      true,
    );
  }

  const vence = Date.parse(linha.expira_em);
  if (Number.isFinite(vence) && Date.now() < vence - MARGEM_MS) {
    return linha.access_token;
  }

  if (renovacaoEmCurso) return renovacaoEmCurso;
  renovacaoEmCurso = renovar(linha);
  try {
    return await renovacaoEmCurso;
  } finally {
    renovacaoEmCurso = null;
  }
}

// ------------------------------------------------------------
// Status e desconexão
// ------------------------------------------------------------
export async function lerStatus(): Promise<StatusContaAzul> {
  const linha = await lerLinha();
  if (!linha) {
    return {
      conectado: false,
      conectadoEm: null,
      renovadoEm: null,
      expiraEm: null,
      vencido: false,
      conectadoPor: "",
      escopo: "",
    };
  }

  const vence = Date.parse(linha.expira_em);
  return {
    conectado: true,
    conectadoEm: linha.conectado_em,
    renovadoEm: linha.renovado_em,
    expiraEm: linha.expira_em,
    // Vencido não é o mesmo que quebrado: com refresh_token válido, a
    // próxima chamada renova sozinha. A tela mostra os dois estados
    // separados para que ninguém reconecte à toa.
    vencido: Number.isFinite(vence) ? Date.now() >= vence : false,
    conectadoPor: linha.conectado_por,
    escopo: linha.escopo,
  };
}

/**
 * Apaga a linha. NÃO avisa a Conta Azul: eles não publicam endpoint de
 * revogação, então o que dá para fazer é esquecer o par aqui. O
 * refresh_token continua tecnicamente válido do lado deles até uma
 * nova autorização substituí-lo — dito em voz alta porque
 * "desconectar" sugere mais do que acontece.
 */
export async function desconectar(): Promise<void> {
  const cliente = await db();
  const { error } = await cliente.from(TABELA).delete().eq("id", 1);
  if (error) {
    throw new ContaAzulErro(`Falha ao apagar o token da Conta Azul: ${error.message}`);
  }
  renovacaoEmCurso = null;
}
