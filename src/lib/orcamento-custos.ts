// ============================================================
// Custos lançados no orçamento
// ------------------------------------------------------------
// Não confundir com `custos`, que é do projeto. Aqui é o custo
// montado ainda no orçamento, antes de virar obra.
//
// `subtotal` é coluna GERADA no banco e `orcamentos.custo_total` é
// mantido por trigger — nenhum dos dois é escrito daqui. O número
// que a tela mostra enquanto a pessoa digita é uma PRÉVIA; o valor
// que vale é o que volta do banco depois de salvar.
// ============================================================
import { supabase } from "@/integrations/supabase/client";

export type CategoriaCusto = "MAO_DE_OBRA" | "MATERIAL" | "EQUIPAMENTO" | "SERVICO" | "OUTRO";

export const CATEGORIAS_CUSTO: CategoriaCusto[] = [
  "MAO_DE_OBRA", "MATERIAL", "EQUIPAMENTO", "SERVICO", "OUTRO",
];

export const CATEGORIA_LABEL: Record<CategoriaCusto, string> = {
  MAO_DE_OBRA: "Mão de obra",
  MATERIAL: "Material",
  EQUIPAMENTO: "Equipamento",
  SERVICO: "Serviço",
  OUTRO: "Outro",
};

/** Unidade sugerida ao trocar de categoria. */
export const UNIDADE_PADRAO: Record<CategoriaCusto, string> = {
  MAO_DE_OBRA: "diária",
  MATERIAL: "un",
  EQUIPAMENTO: "diária",
  SERVICO: "un",
  OUTRO: "un",
};

/**
 * Em mão de obra as colunas mudam de nome na tela: quantidade vira
 * "Diárias" e valor unitário vira "Valor da diária". É só rótulo — a
 * coluna do banco é a mesma.
 */
export function rotulosDaCategoria(categoria: CategoriaCusto): { quantidade: string; valorUnitario: string } {
  return categoria === "MAO_DE_OBRA"
    ? { quantidade: "Diárias", valorUnitario: "Valor da diária" }
    : { quantidade: "Qtd.", valorUnitario: "Valor unitário" };
}

export type OrcamentoCusto = {
  id: string;
  orcamentoId: string;
  categoria: CategoriaCusto;
  descricao: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  /** Vem do banco (coluna gerada). Somente leitura. */
  subtotal: number;
  observacao: string;
  ordem: number;
  autorId: string | null;
  autorNome: string;
  criadoEm: string;
  atualizadoEm: string;
};

type CustoRow = {
  id: string;
  orcamento_id: string;
  categoria: string | null;
  descricao: string | null;
  unidade: string | null;
  quantidade: number | string | null;
  valor_unitario: number | string | null;
  subtotal: number | string | null;
  observacao: string | null;
  ordem: number | null;
  autor_id: string | null;
  autor_nome: string | null;
  created_at: string;
  updated_at: string;
};

/** Colunas numeric do Postgres chegam como string. */
function pnum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fromRow(r: CustoRow): OrcamentoCusto {
  return {
    id: r.id,
    orcamentoId: r.orcamento_id,
    categoria: (r.categoria as CategoriaCusto) ?? "OUTRO",
    descricao: r.descricao ?? "",
    unidade: r.unidade ?? "",
    quantidade: pnum(r.quantidade),
    valorUnitario: pnum(r.valor_unitario),
    subtotal: pnum(r.subtotal),
    observacao: r.observacao ?? "",
    ordem: Number(r.ordem ?? 0) || 0,
    autorId: r.autor_id,
    autorNome: r.autor_nome ?? "",
    criadoEm: r.created_at,
    atualizadoEm: r.updated_at,
  };
}

/**
 * Prévia do subtotal enquanto a pessoa digita. Arredonda igual ao
 * `round(..., 2)` da coluna gerada, para o número da tela não piscar
 * quando o valor do banco chegar.
 */
export function subtotalPrevisto(quantidade: number, valorUnitario: number): number {
  const q = Number.isFinite(quantidade) ? quantidade : 0;
  const v = Number.isFinite(valorUnitario) ? valorUnitario : 0;
  return Math.round(q * v * 100) / 100;
}

/** Ordenado por `ordem` e, no empate, por data de criação. */
export async function listarCustos(orcamentoId: string): Promise<{ custos: OrcamentoCusto[]; error: { message?: string } | null }> {
  const { data, error } = await supabase
    .from("orcamento_custos")
    .select("*")
    .eq("orcamento_id", orcamentoId)
    .order("ordem", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return { custos: [], error };
  return { custos: (data as CustoRow[] ?? []).map(fromRow), error: null };
}

export type NovoCusto = {
  categoria: CategoriaCusto;
  descricao: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  observacao?: string;
  ordem: number;
};

export async function criarCusto(
  orcamentoId: string,
  input: NovoCusto,
  autor: { id: string; nome: string },
): Promise<{ custo: OrcamentoCusto | null; error: { message?: string } | null }> {
  const { data, error } = await supabase
    .from("orcamento_custos")
    .insert({
      orcamento_id: orcamentoId,
      categoria: input.categoria,
      descricao: input.descricao.trim(),
      unidade: input.unidade.trim(),
      quantidade: input.quantidade,
      valor_unitario: input.valorUnitario,
      observacao: input.observacao?.trim() || null,
      ordem: input.ordem,
      autor_id: autor.id || null,
      autor_nome: autor.nome,
    })
    .select()
    .single();
  if (error) return { custo: null, error };
  return { custo: fromRow(data as CustoRow), error: null };
}

/**
 * O retorno de `.select().single()` é a fonte da verdade: traz o
 * subtotal recalculado pelo banco.
 */
export async function atualizarCusto(
  id: string,
  patch: Partial<NovoCusto>,
): Promise<{ custo: OrcamentoCusto | null; error: { message?: string } | null }> {
  const row: Record<string, unknown> = {};
  if (patch.categoria !== undefined) row.categoria = patch.categoria;
  if (patch.descricao !== undefined) row.descricao = patch.descricao.trim();
  if (patch.unidade !== undefined) row.unidade = patch.unidade.trim();
  if (patch.quantidade !== undefined) row.quantidade = patch.quantidade;
  if (patch.valorUnitario !== undefined) row.valor_unitario = patch.valorUnitario;
  if (patch.observacao !== undefined) row.observacao = patch.observacao.trim() || null;
  if (patch.ordem !== undefined) row.ordem = patch.ordem;

  const { data, error } = await supabase
    .from("orcamento_custos")
    .update(row)
    .eq("id", id)
    .select()
    .single();
  if (error) return { custo: null, error };
  return { custo: fromRow(data as CustoRow), error: null };
}

export async function excluirCusto(id: string): Promise<{ error: { message?: string } | null }> {
  const { error } = await supabase.from("orcamento_custos").delete().eq("id", id);
  return { error: error ?? null };
}


// -----------------------------------------------------------
// Totais
// -----------------------------------------------------------
/**
 * Só precisa de categoria e subtotal — assim a tela pode somar as linhas
 * que ainda estão sendo digitadas, sem fingir que são registros do banco.
 */
export type LinhaSomavel = { categoria: CategoriaCusto; subtotal: number };

export function totalDosCustos(custos: LinhaSomavel[]): number {
  return Math.round(custos.reduce((a, c) => a + c.subtotal, 0) * 100) / 100;
}

export function totaisPorCategoria(custos: LinhaSomavel[]): { categoria: CategoriaCusto; total: number }[] {
  const mapa = new Map<CategoriaCusto, number>();
  for (const c of custos) mapa.set(c.categoria, (mapa.get(c.categoria) ?? 0) + c.subtotal);
  return CATEGORIAS_CUSTO
    .filter(cat => mapa.has(cat))
    .map(cat => ({ categoria: cat, total: Math.round((mapa.get(cat) ?? 0) * 100) / 100 }));
}

export type Margem = {
  valor: number;
  /** Percentual sobre o valor de venda. null quando não há venda para comparar. */
  pct: number | null;
  negativa: boolean;
};

/** Margem do orçamento: valor de venda − custo. */
export function calcularMargem(valorVenda: number, custoTotal: number): Margem {
  const valor = Math.round((valorVenda - custoTotal) * 100) / 100;
  return {
    valor,
    pct: valorVenda > 0 ? (valor / valorVenda) * 100 : null,
    negativa: valor < 0,
  };
}
