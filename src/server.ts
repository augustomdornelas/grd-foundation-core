import "./lib/error-capture";

import { AsyncLocalStorage } from "node:async_hooks";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { instalarLeitorDeNonce } from "./lib/csp-nonce";
import { cabecalhosDeSeguranca, gerarNonce } from "./lib/security-headers";

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

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const nonce = gerarNonce();
    const url = new URL(request.url);
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
