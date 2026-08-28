// Resolve os imports "@/..." quando um script de src/scripts roda direto
// no Node, fora do Vite. O tsconfig tem o alias; o Node não lê tsconfig.
//
// Uso: node --import ./src/scripts/_alias.mjs src/scripts/<script>.ts
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const raizSrc = pathToFileURL(`${process.cwd().replace(/\\/g, "/")}/src/`).href;

registerHooks({
  resolve(especificador, contexto, proximo) {
    if (!especificador.startsWith("@/")) return proximo(especificador, contexto);

    const base = new URL(especificador.slice(2), raizSrc).href;
    for (const candidato of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
      if (existsSync(fileURLToPath(candidato))) {
        return { url: candidato, shortCircuit: true };
      }
    }
    return proximo(especificador, contexto);
  },
});
