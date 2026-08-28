import "./lib/error-capture";

import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { instalarLeitorDeNonce } from "./lib/csp-nonce";
import { cabecalhosDeSeguranca, gerarNonce } from "./lib/security-headers";
import {
  identificarUsuario,
  PERFIS_INTEGRACAO,
  PERFIS_SYNC,
  recusaDeIntegracao,
  recusaDeSync,
} from "./lib/identificar-usuario";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// Cabeçalhos de segurança
// ------------------------------------------------------------
// Ficam AQUI, e não em server-node.mjs, por um motivo concreto: o
// wrangler.toml aponta `main = "dist/server/server.js"`, ou seja, no
// Cloudflare o server-node.mjs nunca é executado. Este arquivo é o
// único ponto por onde passam os três caminhos — Vite em
// desenvolvimento, Node na Hostinger e worker no Cloudflare. Posto
// aqui, o header existe nos três; posto lá, existiria em um.
//
// Continua sendo header de resposta (e não meta tag), que é o que
// permite `frame-ancestors`.
const contextoDoNonce = new AsyncLocalStorage<string>();
instalarLeitorDeNonce(() => contextoDoNonce.getStore());

/** Só documento HTML recebe CSP; imagem e JS não têm o que executar. */
function ehDocumentoHtml(response: Response): boolean {
  return (response.headers.get("content-type") ?? "").includes("text/html");
}

function aplicarCabecalhos(response: Response, nonce: string, url: URL): Response {
  if (!ehDocumentoHtml(response)) return response;
  // Response.headers de uma resposta já construída pode ser imutável;
  // clonar é o caminho seguro e preserva o corpo em streaming.
  const headers = new Headers(response.headers);
  for (const [nome, valor] of Object.entries(cabecalhosDeSeguranca(nonce, url))) {
    headers.set(nome, valor);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ------------------------------------------------------------
// Gatilho dos jobs da Secullum
// ------------------------------------------------------------
// Esta versão do TanStack Start não tem rota de API baseada em
// arquivo, e um agendador externo (cron da Hostinger, cron-job.org)
// precisa de uma URL simples para chamar. Então o gatilho fica aqui,
// no mesmo ponto por onde já passam os três ambientes.
//
// Duas entradas: o segredo compartilhado no header, para o agendador
// das 5h da manhã, e a sessão do Supabase, para o botão "Sincronizar
// agora" do dashboard. A segunda exige perfil de Diretoria ou RH —
// disparar job gasta cota da API deles.
const ROTA_SYNC = "/api/secullum/sync";

// `identificarUsuario()` morava aqui. Mudou para
// ./lib/identificar-usuario quando o OAuth da Conta Azul passou a
// precisar da mesma resposta em contaazul-server.ts — que é código de
// server function e não pode importar este entry de SSR.

function responderJson(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * DUAS PORTAS, e as duas precisam existir.
 *
 * 1. x-sync-token: é por onde o agendador entra. Máquina não tem sessão
 *    de usuário.
 * 2. Authorization: Bearer <jwt do Supabase>: é por onde entra o botão
 *    "Sincronizar agora" da tela. O navegador NÃO pode ter o segredo do
 *    agendador — publicá-lo no bundle entregaria o gatilho dos jobs para
 *    a internet inteira.
 *
 * A segunda porta é sempre mais estreita que "estar logado": disparar um
 * job gasta cota de API de terceiro, e o perfil exigido vem de fora
 * porque não é o mesmo em toda integração — a Secullum aceita RH, o
 * OneDrive não.
 *
 * Nasceu dentro de `tratarSync()` e saiu de lá quando o OneDrive passou
 * a precisar exatamente do mesmo par de portas. Duas cópias disto seriam
 * dois lugares para a autorização do gatilho divergir em silêncio.
 */
type Portaria = { ok: true; comoEntrou: string } | { ok: false; resposta: Response };

async function conferirDuasPortas(
  request: Request,
  opcoes: {
    /** O segredo do agendador, do ambiente. Ausente = a porta 1 não existe. */
    segredo: string | undefined;
    /** O nome da variável, para a mensagem quando ela falta. */
    nomeDoSegredo?: string;
    /**
     * Rotas que NUNCA terão agendador passam `true`.
     *
     * Sem isto, a ausência do segredo é lida como configuração faltando
     * e o 503 acusa uma variável de ambiente que não existe e não
     * deveria existir. Numa rota só de gente, não estar logado é 401 —
     * e o recado tem que ser "entre com sessão", não "avise o infra".
     */
    semAgendador?: boolean;
    perfis: readonly string[];
    recusa: (perfil: string) => string;
    /** Como descrever quem pode entrar pela porta 2, na frase do 401. */
    quemPodeEntrar: string;
  },
): Promise<Portaria> {
  const tokenDeMaquina = request.headers.get("x-sync-token");
  const autorizacao = request.headers.get("authorization") ?? "";

  if (opcoes.segredo && tokenDeMaquina) {
    if (tokenDeMaquina !== opcoes.segredo) {
      return {
        ok: false,
        resposta: responderJson({ ok: false, erro: "Token de sincronização inválido." }, 401),
      };
    }
    return { ok: true, comoEntrou: "agendador" };
  }

  if (autorizacao.toLowerCase().startsWith("bearer ")) {
    const quem = await identificarUsuario(
      autorizacao.slice(7).trim(),
      opcoes.perfis,
      opcoes.recusa,
    );
    if (!quem.ok) {
      return { ok: false, resposta: responderJson({ ok: false, erro: quem.erro }, quem.status) };
    }
    return { ok: true, comoEntrou: `${quem.perfil} (${quem.email})` };
  }

  if (opcoes.semAgendador) {
    return {
      ok: false,
      resposta: responderJson(
        {
          ok: false,
          erro: `Envie Authorization: Bearer com sessão de ${opcoes.quemPodeEntrar}.`,
        },
        401,
      ),
    };
  }

  return {
    ok: false,
    resposta: responderJson(
      {
        ok: false,
        erro: opcoes.segredo
          ? `Envie x-sync-token (agendador) ou Authorization: Bearer com sessão de ${opcoes.quemPodeEntrar}.`
          : `${opcoes.nomeDoSegredo} não está no ambiente do servidor e nenhuma sessão foi enviada. ` +
            "Sem uma das duas o gatilho fica desligado — é o que impede a internet inteira de disparar os jobs.",
      },
      opcoes.segredo ? 401 : 503,
    ),
  };
}

async function tratarSync(request: Request, url: URL): Promise<Response> {
  const responder = responderJson;

  const portaria = await conferirDuasPortas(request, {
    segredo: process.env.SECULLUM_SYNC_TOKEN,
    nomeDoSegredo: "SECULLUM_SYNC_TOKEN",
    perfis: PERFIS_SYNC,
    recusa: recusaDeSync,
    quemPodeEntrar: "Diretoria/RH",
  });
  if (!portaria.ok) return portaria.resposta;
  console.log(`[secullum] sync disparado por: ${portaria.comoEntrou}`);

  const tipo = url.searchParams.get("tipo") ?? "funcionarios";
  const { JOBS, syncBatidas, syncTotais } = await import("./lib/secullum-sync");

  try {
    if (tipo === "batidas") {
      return responder(await syncBatidas(url.searchParams.get("dia") ?? undefined), 200);
    }
    if (tipo === "totais") {
      return responder(await syncTotais(url.searchParams.get("competencia") ?? undefined), 200);
    }
    const job = JOBS[tipo as keyof typeof JOBS];
    if (!job) {
      return responder(
        {
          ok: false,
          erro:
            `tipo inválido: ${tipo}. ` +
            "Use funcionarios, batidas, totais, catalogos, afastamentos ou pendencias.",
        },
        400,
      );
    }
    return responder(await job(), 200);
  } catch (error) {
    // Job que falha devolve 200 com ok:false pelo caminho normal; cair
    // aqui é falha antes de abrir o diário — configuração ausente, em
    // geral. 500 para o agendador tratar como falha de verdade.
    console.error(error);
    return responder(
      { ok: false, tipo, erro: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
}

// ------------------------------------------------------------
// Gatilho do sync do OneDrive (orçamentos do Comercial)
// ------------------------------------------------------------
// Mora aqui pelo mesmo motivo do gatilho da Secullum logo acima: esta
// versão do TanStack Start não tem rota de API baseada em arquivo, e um
// agendador externo precisa de uma URL simples para chamar.
//
// AS MESMAS DUAS PORTAS, com uma diferença deliberada no perfil: a
// Secullum aceita RH/DP, este não. Importar orçamento cria linha no
// Comercial, e quem manda no Comercial é a Diretoria — daí
// PERFIS_INTEGRACAO, a mesma lista que autoriza conectar a Conta Azul.
//
// PARÂMETROS
//   ?ano=2026    qual ano de pastas varrer. Sem ele, o ano corrente.
//                Existe porque a pasta de 2025 tem o mesmo padrão de
//                nome e um dia alguém vai querer trazê-la.
//   ?completo=1  ignora o delta guardado e varre a pasta inteira. É o
//                que se usa quando há suspeita de pasta perdida; o
//                índice único cuida de não duplicar nada.
const ROTA_ONEDRIVE_SYNC = "/api/onedrive/sync";

async function tratarOnedriveSync(request: Request, url: URL): Promise<Response> {
  const portaria = await conferirDuasPortas(request, {
    segredo: process.env.ONEDRIVE_SYNC_TOKEN,
    nomeDoSegredo: "ONEDRIVE_SYNC_TOKEN",
    perfis: PERFIS_INTEGRACAO,
    recusa: recusaDeIntegracao,
    quemPodeEntrar: "Diretoria/Administrador",
  });
  if (!portaria.ok) return portaria.resposta;
  console.log(`[onedrive] sync disparado por: ${portaria.comoEntrou}`);

  const anoBruto = url.searchParams.get("ano");
  const ano = anoBruto ? Number(anoBruto) : undefined;
  if (anoBruto && (!Number.isInteger(ano) || ano! < 2000 || ano! > 2100)) {
    return responderJson({ ok: false, erro: `ano inválido: ${anoBruto}.` }, 400);
  }

  const { sincronizarOnedrive } = await import("./lib/onedrive-sync");

  try {
    return responderJson(
      await sincronizarOnedrive({
        ano,
        completo: url.searchParams.get("completo") === "1",
        disparadoPor: portaria.comoEntrou,
      }),
      200,
    );
  } catch (error) {
    // O job que falha devolve 200 com ok:false pelo caminho normal, com
    // o motivo já gravado no diário. Cair aqui é falha ANTES de o diário
    // abrir — chave de serviço ausente, em geral. 500 para o agendador
    // tratar como falha de verdade.
    console.error(error);
    return responderJson(
      { ok: false, erro: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
}

// ------------------------------------------------------------
// OAuth da Conta Azul
// ------------------------------------------------------------
// Os dois endpoints ficam aqui pelo mesmo motivo do gatilho da
// Secullum logo acima: esta versão do TanStack Start não tem rota de
// API baseada em arquivo, e o autorizador da Conta Azul precisa
// devolver o usuário para uma URL simples, sem passar por roteador de
// tela. Este arquivo é o único ponto por onde passam os três
// caminhos — Vite em desenvolvimento, Node na Hostinger e worker no
// Cloudflare.
//
// /conectar  gera o state anti-CSRF, assina em cookie e manda para o
//            autorizador.
// /callback  confere o state, troca o code por tokens e devolve o
//            usuário para a tela.
//
// O /callback É O QUE VALE EM PRODUÇÃO e está implementado inteiro,
// mesmo não fechando o ciclo hoje: a redirect_uri deste App é
// https://contaazul.com/ e não pode ser alterada, então em
// desenvolvimento o navegador para lá, e o code é colado à mão na
// tela. No dia em que a redirect_uri apontar para o Portal, este
// endpoint passa a rodar sem nenhuma mudança.
const ROTA_CONECTAR = "/api/contaazul/conectar";
const ROTA_CALLBACK = "/api/contaazul/callback";

/** Para onde o usuário volta, com ou sem sucesso. */
const TELA_CONTAAZUL = "/app/integracoes/contaazul";

const COOKIE_STATE = "ca_oauth_state";

/**
 * Dez minutos. O state existe para provar que o retorno pertence a
 * uma ida que o próprio Portal iniciou; ele não precisa durar mais que
 * a tela de login da Conta Azul, e um prazo curto reduz a janela em
 * que um valor vazado ainda serviria.
 */
const VALIDADE_STATE_MS = 10 * 60_000;

function assinar(conteudo: string, segredo: string): string {
  return createHmac("sha256", segredo).update(conteudo).digest("hex");
}

/**
 * O cookie guarda o state, o prazo e QUEM começou o fluxo — tudo sob
 * uma assinatura só. Levar o e-mail junto é o que permite ao callback
 * registrar quem autorizou: naquele momento não há mais sessão para
 * consultar, porque a requisição chega vinda do site da Conta Azul.
 *
 * O cookie é HttpOnly: o valor assinado nunca é lido por JavaScript de
 * tela, só pelo servidor.
 */
function criarState(segredo: string, email: string): { state: string; cookie: string } {
  const state = randomBytes(16).toString("hex");
  const conteudo = `${state}.${Date.now() + VALIDADE_STATE_MS}.${Buffer.from(email).toString("base64url")}`;
  return { state, cookie: `${conteudo}.${assinar(conteudo, segredo)}` };
}

function conferirState(
  valorDoCookie: string,
  stateRecebido: string,
  segredo: string,
): { ok: true; email: string } | { ok: false; erro: string } {
  const partes = valorDoCookie.split(".");
  if (partes.length !== 4) return { ok: false, erro: "Cookie de state malformado." };

  const [state, prazo, quem, assinatura] = partes;
  const esperada = assinar(`${state}.${prazo}.${quem}`, segredo);

  // Comparação em tempo constante. Um `===` aqui vazaria, pelo tempo
  // de resposta, quantos caracteres da assinatura já estão certos.
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, erro: "Assinatura do state não confere." };
  }

  if (!Number.isFinite(Number(prazo)) || Date.now() > Number(prazo)) {
    return { ok: false, erro: "A autorização demorou mais de 10 minutos. Comece de novo." };
  }
  if (state !== stateRecebido) {
    return { ok: false, erro: "O state devolvido não é o que este navegador enviou." };
  }

  return { ok: true, email: Buffer.from(quem, "base64url").toString("utf8") };
}

function lerCookie(request: Request, nome: string): string {
  const bruto = request.headers.get("cookie") ?? "";
  for (const pedaco of bruto.split(";")) {
    const [chave, ...resto] = pedaco.trim().split("=");
    if (chave === nome) return decodeURIComponent(resto.join("="));
  }
  return "";
}

/** `Secure` só em https: em `vite dev` o cookie viria com Secure e o
 *  navegador o descartaria calado, derrubando o fluxo inteiro. */
function cookieDeState(valor: string, url: URL, segundos: number): string {
  const atributos = [
    `${COOKIE_STATE}=${valor}`,
    "Path=/",
    "HttpOnly",
    // Lax, e não Strict: o retorno do autorizador é uma navegação de
    // primeiro nível vinda de outro site, e Strict não mandaria o
    // cookie justamente nessa requisição.
    "SameSite=Lax",
    `Max-Age=${segundos}`,
  ];
  if (url.protocol === "https:") atributos.push("Secure");
  return atributos.join("; ");
}

function jsonContaAzul(corpo: unknown, status: number, cookie?: string): Response {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  if (cookie) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(corpo, null, 2), { status, headers });
}

function voltarParaTela(resultado: string, motivo: string, url: URL): Response {
  const destino = new URL(TELA_CONTAAZUL, url.origin);
  destino.searchParams.set("contaazul", resultado);
  if (motivo) destino.searchParams.set("motivo", motivo);
  return new Response(null, {
    status: 302,
    headers: {
      location: destino.toString(),
      // Some com o cookie de state: ele já cumpriu o papel, e um state
      // usado que sobrevive é um state que pode ser reapresentado.
      "set-cookie": cookieDeState("", url, 0),
    },
  });
}

/**
 * Início do fluxo. Exige sessão de Administrador ou Diretoria —
 * autorizar dá ao Portal acesso ao financeiro da empresa.
 *
 * Responde JSON quando quem pede aceita JSON, e 302 quando não. A tela
 * usa o primeiro caminho por necessidade: a sessão do Supabase vive no
 * localStorage, então o botão precisa de um `fetch` com o header
 * Authorization e navega em seguida com a URL que recebe. O `Set-Cookie`
 * de uma resposta a `fetch` de mesma origem é gravado normalmente, que
 * é o que mantém o state válido nos dois caminhos.
 */
async function tratarConectar(request: Request, url: URL): Promise<Response> {
  const autorizacao = request.headers.get("authorization") ?? "";
  if (!autorizacao.toLowerCase().startsWith("bearer ")) {
    return jsonContaAzul(
      {
        ok: false,
        erro: "Envie Authorization: Bearer com a sessão de um Administrador ou da Diretoria.",
      },
      401,
    );
  }

  const quem = await identificarUsuario(
    autorizacao.slice(7).trim(),
    PERFIS_INTEGRACAO,
    recusaDeIntegracao,
  );
  if (!quem.ok) return jsonContaAzul({ ok: false, erro: quem.erro }, quem.status);

  const { lerCredenciais, credenciaisFaltando, montarUrlDeAutorizacao } =
    await import("./lib/contaazul-tokens");
  const credenciais = lerCredenciais();
  if (!credenciais) {
    return jsonContaAzul(
      {
        ok: false,
        erro:
          `Faltam credenciais no ambiente do servidor: ${credenciaisFaltando()}. ` +
          "Sem elas o fluxo de autorização não pode nem começar.",
      },
      503,
    );
  }

  const { state, cookie } = criarState(credenciais.stateSecret, quem.email);
  const destino = montarUrlDeAutorizacao(credenciais, state);
  const setCookie = cookieDeState(cookie, url, VALIDADE_STATE_MS / 1000);
  console.log(`[contaazul] autorização iniciada por ${quem.email}`);

  if ((request.headers.get("accept") ?? "").includes("application/json")) {
    return jsonContaAzul({ ok: true, url: destino }, 200, setCookie);
  }
  return new Response(null, {
    status: 302,
    headers: { location: destino, "set-cookie": setCookie },
  });
}

/**
 * Volta do autorizador. Nunca responde JSON: quem chega aqui é um
 * navegador que veio de outro site, e o que ele precisa é voltar para
 * a tela com o recado — sucesso ou motivo da falha.
 */
async function tratarCallback(request: Request, url: URL): Promise<Response> {
  // A Conta Azul recusou (usuário cancelou, escopo negado). O erro dela
  // é mais útil que qualquer frase nossa.
  const erroDeles = url.searchParams.get("error");
  if (erroDeles) {
    const detalhe = url.searchParams.get("error_description") ?? "";
    return voltarParaTela("erro", `${erroDeles}${detalhe ? `: ${detalhe}` : ""}`, url);
  }

  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!code) return voltarParaTela("erro", "A Conta Azul voltou sem o code.", url);

  const { lerCredenciais, credenciaisFaltando, conectarComCodigo } =
    await import("./lib/contaazul-tokens");
  const credenciais = lerCredenciais();
  if (!credenciais) {
    return voltarParaTela(
      "erro",
      `Faltam credenciais no ambiente do servidor: ${credenciaisFaltando()}.`,
      url,
    );
  }

  // O state é conferido ANTES de qualquer chamada à Conta Azul: é ele
  // que separa um retorno legítimo de um code plantado por terceiro na
  // sessão de quem estava logado.
  const guardado = lerCookie(request, COOKIE_STATE);
  if (!guardado) {
    return voltarParaTela(
      "erro",
      "O cookie de segurança do fluxo não veio. Comece de novo pelo botão Conectar.",
      url,
    );
  }
  const conferencia = conferirState(guardado, state, credenciais.stateSecret);
  if (!conferencia.ok) return voltarParaTela("erro", conferencia.erro, url);

  try {
    await conectarComCodigo(code, conferencia.email);
    console.log(`[contaazul] conectado pelo callback, autorizado por ${conferencia.email}`);
    return voltarParaTela("ok", "", url);
  } catch (e) {
    console.error(e);
    return voltarParaTela("erro", e instanceof Error ? e.message : String(e), url);
  }
}

// ------------------------------------------------------------
// TEMPORÁRIA — o IP público de saída do servidor
// ------------------------------------------------------------
// PODE SAIR ASSIM QUE O IP ESTIVER CADASTRADO NA CONTA AZUL.
// Nada depende dela: apagar este bloco e a linha correspondente no
// roteador de `fetch()` abaixo remove a rota inteira.
//
// POR QUE EXISTE: a Conta Azul pediu o IP de saída para liberar o
// acesso à API, e esse endereço não é o do nosso navegador — é o da
// máquina que faz a chamada. A única forma honesta de descobri-lo é
// perguntar de dentro do servidor, que é o que esta rota faz.
//
// PRECISA RODAR EM PRODUÇÃO. Chamada em `vite dev` ela devolve o IP da
// sua conexão de casa, que não é o que a Conta Azul vê e não serve para
// cadastrar.
//
// CUIDADO AO CADASTRAR: uma resposta é UMA saída. Se a hospedagem usar
// pool de IPs ou mais de um nó, chamadas diferentes podem devolver
// endereços diferentes — vale repetir algumas vezes antes de mandar o
// endereço para eles, e perguntar ao suporte da hospedagem qual é a
// faixa, em vez de confiar num único resultado.
//
// Sem porta de agendador: isto não é gatilho de job, é uma pergunta que
// uma pessoa faz uma vez.
const ROTA_DIAGNOSTICO_IP = "/api/diagnostico/ip";

const CONSULTA_DE_IP = "https://api.ipify.org?format=json";

async function tratarDiagnosticoIp(request: Request): Promise<Response> {
  const portaria = await conferirDuasPortas(request, {
    segredo: undefined,
    semAgendador: true,
    perfis: PERFIS_INTEGRACAO,
    recusa: recusaDeIntegracao,
    quemPodeEntrar: "Diretoria/Administrador",
  });
  if (!portaria.ok) return portaria.resposta;

  try {
    const resposta = await fetch(CONSULTA_DE_IP, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    const texto = await resposta.text();

    if (!resposta.ok) {
      return responderJson(
        {
          ok: false,
          erro: `O serviço de consulta respondeu HTTP ${resposta.status}.`,
          corpo: texto.slice(0, 300),
        },
        502,
      );
    }

    let dados: { ip?: string };
    try {
      dados = JSON.parse(texto) as { ip?: string };
    } catch {
      return responderJson(
        {
          ok: false,
          erro: "O serviço de consulta devolveu algo que não é JSON.",
          corpo: texto.slice(0, 300),
        },
        502,
      );
    }

    console.log(`[diagnostico] IP de saída consultado por: ${portaria.comoEntrou}`);
    return responderJson(
      {
        ok: true,
        ip: dados.ip ?? null,
        fonte: "api.ipify.org",
        consultadoEm: new Date().toISOString(),
        aviso:
          "Uma resposta é uma saída. Se o host tiver pool de IPs, repita a chamada algumas " +
          "vezes antes de cadastrar, e confirme a faixa com o suporte da hospedagem.",
      },
      200,
    );
  } catch (e) {
    // 502 e não 500: quem falhou foi o serviço de fora, não nós.
    const motivo =
      e instanceof DOMException && e.name === "TimeoutError"
        ? "o serviço de consulta não respondeu em 10s"
        : e instanceof Error
          ? e.message
          : String(e);
    console.error(e);
    return responderJson({ ok: false, erro: `Falha ao consultar o IP de saída: ${motivo}` }, 502);
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const nonce = gerarNonce();
    const url = new URL(request.url);

    if (url.pathname === ROTA_SYNC) {
      return tratarSync(request, url);
    }
    if (url.pathname === ROTA_ONEDRIVE_SYNC) {
      return tratarOnedriveSync(request, url);
    }
    if (url.pathname === ROTA_CONECTAR) {
      return tratarConectar(request, url);
    }
    if (url.pathname === ROTA_CALLBACK) {
      return tratarCallback(request, url);
    }
    // TEMPORÁRIA: sai junto com o bloco de tratarDiagnosticoIp.
    if (url.pathname === ROTA_DIAGNOSTICO_IP) {
      return tratarDiagnosticoIp(request);
    }

    try {
      const handler = await getServerEntry();
      // O render acontece dentro do contexto: é assim que getRouter()
      // enxerga o nonce desta requisição, e não o de outra em paralelo.
      const response = await contextoDoNonce.run(nonce, () => handler.fetch(request, env, ctx));
      const normalizada = await normalizeCatastrophicSsrResponse(response);
      return aplicarCabecalhos(normalizada, nonce, url);
    } catch (error) {
      console.error(error);
      return aplicarCabecalhos(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
        nonce,
        url,
      );
    }
  },
};
