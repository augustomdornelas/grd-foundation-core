import { defineConfig, loadEnv } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

/**
 * Leva as variáveis SEM prefixo VITE_ do .env.local para o process.env
 * do servidor de desenvolvimento.
 *
 * POR QUE ISTO PRECISA EXISTIR: o Vite lê os arquivos .env, mas só
 * publica no bundle o que começa com VITE_ — e NÃO escreve nada em
 * `process.env`. O código de servidor (secullum-client.ts,
 * contaazul-tokens.ts, supabase-admin.ts) lê justamente de
 * `process.env`, porque em produção quem entrega essas variáveis é o
 * painel do host. Resultado, antes disto: em `vite dev` o servidor via
 * `undefined` em todas elas e cada integração se dava por não
 * configurada, sem que nada no código apontasse o motivo.
 *
 * SÓ NO SERVIDOR DE DESENVOLVIMENTO (`command === "serve"`). No build
 * as variáveis vêm do ambiente do host, e nada aqui as injeta no
 * bundle: elas não passam por `define`, então continuam invisíveis
 * para o navegador — que é o ponto inteiro de não usar o prefixo
 * VITE_ nelas.
 *
 * Quem já está no ambiente do shell vence o arquivo: exportar uma
 * variável na mão para um teste pontual tem que continuar funcionando.
 */
function carregarEnvDoServidor(mode: string): void {
  const doArquivo = loadEnv(mode, process.cwd(), "");
  for (const [chave, valor] of Object.entries(doArquivo)) {
    if (chave.startsWith("VITE_")) continue;
    if (process.env[chave] !== undefined) continue;
    process.env[chave] = valor;
  }
}

export default defineConfig(({ command, mode }) => {
  if (command === "serve") carregarEnvDoServidor(mode);

  return {
    plugins: [
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tailwindcss(),
      tanstackStart({
        // Redireciona o entry do servidor para nosso wrapper de erro SSR
        server: { entry: "./server.ts" },
      }),
      viteReact(),
    ],
  };
});
