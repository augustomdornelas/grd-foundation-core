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

// O Supabase devolve no máximo 1000 linhas por requisição, e um projeto
// grande passa disso — sem paginar, os totais sairiam truncados.
const PAGE_SIZE = 1000;

async function buscarLancamentos(projetoId: string, colunas: string, ordenarPor?: string) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const q = supabase.from("lancamentos").select(colunas).eq("projeto_id", projetoId);
    // "id" sempre como último critério: sem desempate estável, linhas podem
    // repetir ou desaparecer entre lotes.
    const { data, error } = await (ordenarPor
      ? q.order(ordenarPor, { ascending: true, nullsFirst: false }).order("id", { ascending: true })
      : q.order("id", { ascending: true })
    ).range(offset, offset + PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    const lote = (data ?? []) as any[];
    rows.push(...lote);
    if (lote.length < PAGE_SIZE) return { data: rows, error: null };
  }
}

/** Busca (uma vez) os lançamentos de um projeto, com o nome do fornecedor. */
export function useLancamentosProjeto(projetoId: string) {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    void buscarLancamentos(projetoId, "*, fornecedores(nome)", "data_executada").then(({ data, error }) => {
      if (!vivo) return;
      if (error) toast.error(`Falha ao carregar lançamentos: ${error.message}`);
      setLancamentos(data.map(normaliza));
      setCarregando(false);
    });
    return () => { vivo = false; };
  }, [projetoId]);

  return { lancamentos, carregando };
}

// ------------------------------------------------------------
// Execução real por categoria_grupo — insumo do quadro
// Planejamento × Execução. Consulta enxuta (3 colunas) e soma no
// cliente, porque o PostgREST não agrega sem view/rpc.
// Grupos vistos na migração: MO, MT, TX, ST, CP e MA.
// ------------------------------------------------------------
export type ExecucaoProjeto = {
  /** Soma de valor_total das SAÍDAS, por categoria_grupo. */
  saidasPorGrupo: Record<string, number>;
  totalSaidas: number;
  /** Entradas = medições/receita. */
  totalEntradas: number;
  qtdLinhas: number;
};

const EXECUCAO_VAZIA: ExecucaoProjeto = { saidasPorGrupo: {}, totalSaidas: 0, totalEntradas: 0, qtdLinhas: 0 };

export function agregaExecucao(rows: any[]): ExecucaoProjeto {
  const saidasPorGrupo: Record<string, number> = {};
  let totalSaidas = 0, totalEntradas = 0;
  for (const r of rows) {
    const valor = Number(r.valor_total ?? 0) || 0;
    if (r.fluxo === "entrada") {
      totalEntradas += valor;
    } else {
      const grupo = String(r.categoria_grupo ?? "").trim().toUpperCase();
      saidasPorGrupo[grupo] = (saidasPorGrupo[grupo] ?? 0) + valor;
      totalSaidas += valor;
    }
  }
  return { saidasPorGrupo, totalSaidas, totalEntradas, qtdLinhas: rows.length };
}

/** Totais executados do projeto, agrupados por categoria_grupo e fluxo. */
export function useExecucaoProjeto(projetoId: string) {
  const [execucao, setExecucao] = useState<ExecucaoProjeto>(EXECUCAO_VAZIA);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    void buscarLancamentos(projetoId, "categoria_grupo, fluxo, valor_total").then(({ data, error }) => {
      if (!vivo) return;
      if (error) toast.error(`Falha ao carregar execução: ${error.message}`);
      setExecucao(agregaExecucao(data));
      setCarregando(false);
    });
    return () => { vivo = false; };
  }, [projetoId]);

  return { execucao, carregando };
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
