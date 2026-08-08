import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

export default defineConfig({
  // ------------------------------------------------------------
  // Saída para Cloudflare Pages (advanced mode).
  //
  // Esta versão do TanStack Start (@tanstack/react-start 1.168.x /
  // start-plugin-core 1.171.x) NÃO tem opção de deploy target: o schema
  // do plugin só aceita srcDirectory/start/router/client/server/serverFns/
  // pages/sitemap/prerender/dev/spa/importProtection. O `target` que
  // existe ali é o framework (react|solid), não o provedor.
  //
  // O caminho suportado é redirecionar o outDir do ambiente de servidor:
  // start-plugin-core lê `environments.ssr.build.outDir` do config do
  // usuário (vite/output-directory.ts) e o usa como serverOutputDirectory.
  // O ambiente de servidor se chama "ssr" (constants.ts), não "server".
  //
  // O Pages trata `_worker.js/` como worker (directory format) e não
  // serve seu conteúdo como estático, então o bundle SSR fica dentro de
  // dist/client sem vazar arquivo. O entry precisa ser index.js.
  //
  // Ordem de build (vite/planning.ts): client primeiro, ssr depois —
  // logo o emptyOutDir do client não apaga o _worker.js.
  // ------------------------------------------------------------
  environments: {
    ssr: {
      build: {
        outDir: "dist/client/_worker.js",
        rollupOptions: {
          output: {
            entryFileNames: "index.js",
            // Chunks achatados ao lado do index.js, sem subpasta assets/.
            // Com assets/ aninhado, um chunk importa o entry como
            // "../index.js" e o bundler do Pages não resolve caminho que
            // sai da pasta do worker ("Could not resolve ../index.js").
            chunkFileNames: "[name]-[hash].js",
            // src/lib/error-page é usado pelo entry (src/server.ts) e por
            // src/start.ts. Sem isto o Rollup embute o módulo no entry e o
            // chunk do start passa a importar "./index.js" — o bundler do
            // Pages não consegue resolver o próprio entrypoint como módulo
            // ("Could not resolve ./index.js"). Em chunk separado, os dois
            // lados importam o chunk, e nada aponta para o entry.
            manualChunks(id) {
              if (/[\\/]src[\\/]lib[\\/]error-(page|capture)/.test(id)) return "ssr-error-page";
              return undefined;
            },
          },
        },
      },
    },
  },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      // Redireciona o entry do servidor para nosso wrapper de erro SSR
      server: { entry: "./server.ts" },
    }),
    viteReact(),
  ],
});
