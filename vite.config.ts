import { defineConfig, type Plugin } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

/**
 * Falha o build quando a chave do Supabase não está no ambiente.
 *
 * Sem isso o build passa e gera um bundle que quebra no navegador: o
 * `createClient` lança no import e a página inteira morre em silêncio.
 * Erro no log do deploy é muito mais barato de achar do que site fora
 * do ar. Só vale para `vite build` — em dev o .env local resolve.
 */
function exigirChaveSupabase(): Plugin {
  return {
    name: "exigir-chave-supabase",
    apply: "build",
    configResolved(config) {
      const chave = config.env.VITE_SUPABASE_ANON_KEY;
      if (typeof chave !== "string" || chave.trim() === "") {
        throw new Error(
          "VITE_SUPABASE_ANON_KEY ausente ou vazia no ambiente de build.\n" +
          "Cadastre a variável no painel da hospedagem (ela precisa existir " +
          "no momento do build, não só na execução) e refaça o deploy.\n" +
          "Localmente, o valor fica no arquivo .env, que não é versionado.",
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [
    exigirChaveSupabase(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      // Redireciona o entry do servidor para nosso wrapper de erro SSR
      server: { entry: "./server.ts" },
    }),
    viteReact(),
  ],
});
