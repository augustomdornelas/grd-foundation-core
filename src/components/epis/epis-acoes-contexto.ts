// Contexto das ações compartilhadas de EPIs. Separado do provider para
// que o arquivo do componente exporte só componentes — é o que o
// fast refresh pede, e evita recarregar a página inteira ao editar.
import { createContext, useContext } from "react";

export type AlvoExclusao = {
  kind: "epi" | "func" | "entrega" | "compra";
  id: string;
  label: string;
};

export type EpisAcoes = {
  /** Abre a entrega. Com funcionarioId, já vem escolhido. */
  abrirEntrega: (funcionarioId?: string) => void;
  abrirCompra: () => void;
  pedirExclusao: (alvo: AlvoExclusao) => void;
};

export const EpisAcoesCtx = createContext<EpisAcoes | null>(null);

export function useEpisAcoes(): EpisAcoes {
  const ctx = useContext(EpisAcoesCtx);
  if (!ctx) throw new Error("useEpisAcoes precisa estar dentro de <EpisAcoesProvider>");
  return ctx;
}
