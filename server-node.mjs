// Entry point para rodar em servidor Node (Hostinger Node.js Web App).
// O build do TanStack Start gera um handler no formato fetch (Cloudflare Worker).
// Aqui envolvemos esse handler num servidor Node e servimos os assets estáticos.
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import worker from "./dist/server/server.js";

const app = new Hono();

// PWA: o service worker, o manifest e a página offline não podem ficar
// presos em cache (navegador ou CDN da Hostinger) — é por eles que um
// deploy novo chega ao app instalado. "no-cache" = pode guardar, mas
// sempre confere com o servidor antes de usar. O Content-Type do
// .webmanifest (application/manifest+json) já sai certo do serveStatic.
const SEM_CACHE_LONGO = new Set(["/sw.js", "/manifest.webmanifest", "/offline.html"]);

// Assets estáticos gerados pelo build do client
app.use(
  "/*",
  serveStatic({
    root: "./dist/client",
    onFound: (_path, c) => {
      if (SEM_CACHE_LONGO.has(new URL(c.req.url).pathname)) {
        c.header("Cache-Control", "no-cache");
      }
    },
  }),
);

// Tudo que não for arquivo estático cai no SSR
app.all("*", (c) => worker.fetch(c.req.raw, process.env, {}));

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`Servidor rodando na porta ${info.port}`);
});
