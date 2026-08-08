// ============================================================
// Lançamentos — livro-caixa migrado do sistema antigo
// ------------------------------------------------------------
// A tabela `lancamentos` tem ~11,4 mil linhas cobrindo todos os
// projetos, então aqui NÃO carregamos tudo num store global como
// o projetos-store faz: buscamos sob demanda apenas os lançamentos
// do projeto aberto (.eq("projeto_id", id)), já com o nome do
// fornecedor via join do PostgREST.
// ============================================================
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type FluxoLancamento = "entrada" | "saida";

export type Lancamento = {
  id: string;
  projetoId: string | null;
  fornecedorId: string | null;
  fornecedorNome: string;
  funcionarioOldId: number | null;
  tipo: string;
  categoria: string;
  categoriaGrupo: string;
  fluxo: FluxoLancamento;
  unidade: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  dataPlanejada: string;
  dataExecutada: string;
  numeroNota: number | null;
  numeroMedicao: number | null;
  createdAt: string;
};

/** Data que a tela mostra: a executada quando existe, senão a planejada. */
export function dataDoLancamento(l: Lancamento): string {
  return l.dataExecutada || l.dataPlanejada || "";
}

function normaliza(r: any): Lancamento {
  // O join vem como objeto ({nome}) ou array ([{nome}]) dependendo da
  // cardinalidade que o PostgREST infere — tratamos os dois casos.
  const forn = Array.isArray(r.fornecedores) ? r.fornecedores[0] : r.fornecedores;
  return {
    id: r.id,
    projetoId: r.projeto_id ?? null,
    fornecedorId: r.fornecedor_id ?? null,
    fornecedorNome: forn?.nome ?? "",
    funcionarioOldId: r.funcionario_old_id ?? null,
    tipo: r.tipo ?? "",
    categoria: r.categoria ?? "",
    categoriaGrupo: r.categoria_grupo ?? "",
    fluxo: r.fluxo === "entrada" ? "entrada" : "saida",
    unidade: r.unidade ?? "",
    descricao: r.descricao ?? "",
    quantidade: Number(r.quantidade ?? 0) || 0,
    valorUnitario: Number(r.valor_unitario ?? 0) || 0,
    valorTotal: Number(r.valor_total ?? 0) || 0,
    dataPlanejada: r.data_planejada ?? "",
    dataExecutada: r.data_executada ?? "",
    numeroNota: r.numero_nota ?? null,
    numeroMedicao: r.numero_medicao ?? null,
    createdAt: r.created_at ?? "",
  };
}

/** Busca (uma vez) os lançamentos de um projeto, com o nome do fornecedor. */
export function useLancamentosProjeto(projetoId: string) {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    supabase
      .from("lancamentos")
      .select("*, fornecedores(nome)")
      .eq("projeto_id", projetoId)
      .order("data_executada", { ascending: true, nullsFirst: false })
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) toast.error(`Falha ao carregar lançamentos: ${error.message}`);
        setLancamentos((data ?? []).map(normaliza));
        setCarregando(false);
      });
    return () => { vivo = false; };
  }, [projetoId]);

  return { lancamentos, carregando };
}

export type ResumoLancamentos = {
  entradas: number;
  saidas: number;
  saldo: number;
  qtdEntradas: number;
  qtdSaidas: number;
};

/** Totaliza entradas x saídas pela coluna `fluxo`. */
export function resumoLancamentos(lancamentos: Lancamento[]): ResumoLancamentos {
  let entradas = 0, saidas = 0, qtdEntradas = 0, qtdSaidas = 0;
  for (const l of lancamentos) {
    if (l.fluxo === "entrada") { entradas += l.valorTotal; qtdEntradas++; }
    else { saidas += l.valorTotal; qtdSaidas++; }
  }
  return { entradas, saidas, saldo: entradas - saidas, qtdEntradas, qtdSaidas };
}
