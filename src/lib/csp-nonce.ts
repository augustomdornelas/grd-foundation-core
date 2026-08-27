// ============================================================
// O nonce da requisição, sem importar módulo de servidor no cliente
// ------------------------------------------------------------
// Problema: `getRouter()` (src/router.tsx) roda nos DOIS lados — ele é
// o mesmo arquivo no bundle do navegador. Precisamos do nonce lá para
// entregá-lo ao TanStack Start (`router.options.ssr.nonce`), que é
// quem carimba os scripts inline da hidratação. Mas importar
// `node:async_hooks` ou `@tanstack/react-start/server` no router
// quebraria o build do cliente.
//
// Solução: o servidor pendura uma função em globalThis; o router só
// pergunta se ela existe. Nada de import cruzado, e no navegador a
// função simplesmente não está lá — o cliente lê o nonce da meta tag
// `csp-nonce`, que é o caminho que o próprio framework usa.
//
// Por que uma função e não um valor: o valor mudaria a cada requisição
// e duas requisições simultâneas se sobrescreveriam. A função consulta
// o AsyncLocalStorage da requisição corrente, que é isolado por
// natureza.
// ============================================================

const CHAVE = "__grdCspNonce" as const;

type PortadorDeNonce = {
  [CHAVE]?: () => string | undefined;
};

/** Chamado pelo servidor (src/server.ts) uma vez, na inicialização. */
export function instalarLeitorDeNonce(leitor: () => string | undefined): void {
  (globalThis as PortadorDeNonce)[CHAVE] = leitor;
}

/**
 * Devolve o nonce da requisição corrente no servidor, e `undefined` no
 * navegador. Nunca lança: se o mecanismo não estiver montado, a página
 * continua funcionando — o que se perde é a proteção, não o site.
 */
export function nonceAtual(): string | undefined {
  try {
    return (globalThis as PortadorDeNonce)[CHAVE]?.();
  } catch {
    return undefined;
  }
}
