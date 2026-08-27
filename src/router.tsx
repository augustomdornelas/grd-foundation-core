import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { nonceAtual } from "./lib/csp-nonce";

export const getRouter = () => {
  const queryClient = new QueryClient();

  // O TanStack Start emite dois <script> inline na hidratação. Com o
  // nonce definido aqui, ele carimba os dois — e a CSP pode recusar
  // script inline sem 'unsafe-inline'.
  //
  // No navegador `nonceAtual()` devolve undefined, e está certo: lá o
  // próprio framework lê o nonce da meta tag `csp-nonce`.
  const nonce = nonceAtual();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    ...(nonce ? { ssr: { nonce } } : {}),
  });

  return router;
};
