// ============================================================
// Store de Projetos — integração real com Supabase
// ============================================================
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { upperizePayload } from "@/lib/utils";

function toastErr(msg: string, err: { message?: string } | null | undefined) {
  if (err) toast.error(`${msg}: ${err.message ?? "erro desconhecido"}`);
}

export type ProjetoStatus = "PLANEJAMENTO" | "EM ANDAMENTO" | "PARALISADO" | "CONCLUÍDO";

/**
 * Colunas de planejamento vindas do sistema antigo (todas numeric no banco;
 * as terminadas em Pct são percentuais, as outras são valor/medida absoluta).
 * Ficam num tipo próprio para que `criarProjeto` possa recebê-las como
 * opcionais sem quebrar quem já chama a action.
 */
export type PlanejamentoProjeto = {
  planejadoLucroPct: number;
  planejadoImpostoPct: number;
  planejadoMoPct: number;
  planejadoMtPct: number;
  planejadoTerceirizadoPct: number;
  planejadoAdministrativoPct: number;
  /** Valor em R$ (não é percentual). */
  planejadoCustos: number;
  metragem: number;
};

export type Projeto = {
  id: string;
  nome: string;
  cliente: string;
  clienteId: string | null;
  orcamentoId: string | null;
  valorContrato: number;
  local: string;
  descricao: string;
  /** Campo de texto livre antigo — mantido como fallback dos projetos
   *  lançados antes do pré-cadastro `responsaveis` existir. */
  responsavel: string;
  responsavelTecnicoId: string | null;
  responsavelComercialId: string | null;
  dataInicio: string;
  prazo: string;
  status: ProjetoStatus;
  progresso: number;
  orcado: number;
} & PlanejamentoProjeto;

const PLANEJAMENTO_ZERADO: PlanejamentoProjeto = {
  planejadoLucroPct: 0, planejadoImpostoPct: 0, planejadoMoPct: 0, planejadoMtPct: 0,
  planejadoTerceirizadoPct: 0, planejadoAdministrativoPct: 0, planejadoCustos: 0, metragem: 0,
};

const num = (v: unknown) => Number(v ?? 0) || 0;

export type Custo = {
  id: string;
  projetoId: string;
  data: string;
  descricao: string;
  categoria: "Insumo" | "Serviço" | "Locação" | "Mão de obra" | "Outro";
  valor: number;
};

export type NotaFiscal = {
  id: string;
  projetoId: string;
  /** Opcional: nem toda entrada de material chega com nota emitida. */
  numero: string;
  fornecedor: string;
  descricao: string;
  data: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  /**
   * Sempre quantidade × valorUnitario para notas novas.
   *
   * Continua sendo coluna gravada, e não calculada na leitura, porque
   * as notas lançadas antes desta mudança têm quantidade 1 e valor
   * unitário 0 — recalcular na leitura zeraria todas elas.
   */
  valor: number;
  funcionarioId: string | null;
};

export type Medicao = {
  id: string;
  projetoId: string;
  numero: number;
  periodo: string;
  data: string;
  pct: number;
  valor: number;
  status: "APROVADA" | "EM ANÁLISE" | "ENVIADA";
};

type State = {
  projetos: Projeto[];
  custos: Custo[];
  notas: NotaFiscal[];
  medicoes: Medicao[];
  /**
   * false enquanto o primeiro fetchAll não voltou. Existe porque lista
   * vazia aqui tem dois significados opostos — "não há obra nenhuma" e
   * "ainda não perguntei" — e quem decide CRIAR obra a partir da
   * ausência precisa saber qual dos dois é.
   */
  carregado: boolean;
};

const SSR: State = { projetos: [], custos: [], notas: [], medicoes: [], carregado: false };
let state: State = SSR;
const listeners = new Set<() => void>();
function emit() { listeners.forEach(l => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }

// O Supabase limita cada resposta a 1000 linhas. Tabelas grandes (custos tem
// mais de 11 mil registros) precisam ser lidas em lotes, senão a maior parte
// dos dados nunca chega e as telas de projeto aparecem vazias.
const PAGE_SIZE = 1000;

async function fetchPaginado(
  tabela: "custos" | "notas_fiscais" | "medicoes",
  ordenarPor: string,
): Promise<{ data: any[]; error: { message?: string } | null }> {
  const rows: any[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(tabela)
      .select("*")
      .order(ordenarPor, { ascending: false })
      // desempate estável: sem ele linhas com a mesma data podem repetir ou
      // desaparecer entre lotes
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    const lote = data ?? [];
    rows.push(...lote);
    if (lote.length < PAGE_SIZE) return { data: rows, error: null };
  }
}

async function fetchAll() {
  const [p, c, n, m] = await Promise.all([
    supabase.from("projetos").select("*").order("created_at", { ascending: false }),
    fetchPaginado("custos", "data"),
    fetchPaginado("notas_fiscais", "data"),
    fetchPaginado("medicoes", "data"),
  ]);
  toastErr("Falha ao carregar projetos", p.error);
  toastErr("Falha ao carregar custos", c.error);
  toastErr("Falha ao carregar notas fiscais", n.error);
  toastErr("Falha ao carregar medições", m.error);
  state = {
    projetos: (p.data ?? []).map((r: any) => ({
      id: r.id, nome: r.nome ?? "", cliente: r.cliente ?? "",
      clienteId: r.cliente_id ?? null,
      orcamentoId: r.orcamento_id ?? null,
      valorContrato: num(r.valor_contrato),
      local: r.local ?? "", descricao: r.descricao ?? "",
      responsavel: r.responsavel ?? "",
      responsavelTecnicoId: r.responsavel_tecnico_id ?? null,
      responsavelComercialId: r.responsavel_comercial_id ?? null,
      dataInicio: r.data_inicio ?? "",
      prazo: r.prazo ?? "", status: r.status ?? "PLANEJAMENTO",
      // num() em tudo que entra em conta: colunas numeric podem chegar
      // como string e "10" - 5 daria NaN na tela.
      progresso: num(r.progresso), orcado: num(r.orcado),
      planejadoLucroPct: num(r.planejado_lucro_pct),
      planejadoImpostoPct: num(r.planejado_imposto_pct),
      planejadoMoPct: num(r.planejado_mo_pct),
      planejadoMtPct: num(r.planejado_mt_pct),
      planejadoTerceirizadoPct: num(r.planejado_terceirizado_pct),
      planejadoAdministrativoPct: num(r.planejado_administrativo_pct),
      planejadoCustos: num(r.planejado_custos),
      metragem: num(r.metragem),
    })),
    custos: (c.data ?? []).map((r: any) => ({
      id: r.id, projetoId: r.projeto_id ?? "", data: r.data ?? "",
      descricao: r.descricao ?? "", categoria: r.categoria ?? "Outro",
      valor: num(r.valor),
    })),
    notas: (n.data ?? []).map((r: any) => ({
      id: r.id, projetoId: r.projeto_id ?? "", numero: r.numero ?? "",
      fornecedor: r.fornecedor ?? "", descricao: r.descricao ?? "",
      data: r.data ?? "", unidade: r.unidade ?? "",
      quantidade: num(r.quantidade) || 1, valorUnitario: num(r.valor_unitario),
      valor: num(r.valor), funcionarioId: r.funcionario_id ?? null,
    })),
    medicoes: (m.data ?? []).map((r: any) => ({
      id: r.id, projetoId: r.projeto_id ?? "", numero: num(r.numero),
      periodo: r.periodo ?? "", data: r.data ?? "",
      pct: num(r.pct), valor: num(r.valor), status: r.status ?? "EM ANÁLISE",
    })),
    carregado: true,
  };
  emit();
}

if (typeof window !== "undefined") void fetchAll();

/**
 * Relê tudo do banco. Quem cria projeto por fora das actions daqui — a
 * carga inicial da Secullum cria obra a partir do departamento — chama
 * isto depois; senão o store fica sem a obra recém-criada e a próxima
 * execução a cria de novo, porque projetos não tem unique em nome.
 */
export async function recarregarProjetos(): Promise<void> {
  await fetchAll();
}

export function useProjetosStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(SSR));
}

/**
 * Valor da nota a partir de quantidade e valor unitário.
 *
 * Arredonda em duas casas: 3 × 10.335 daria 31.005000000000003 em
 * ponto flutuante, e esse resto apareceria no total do projeto.
 */
export function calcularValorNota(quantidade: number, valorUnitario: number): number {
  const q = Number.isFinite(quantidade) ? quantidade : 0;
  const v = Number.isFinite(valorUnitario) ? valorUnitario : 0;
  return Math.round(q * v * 100) / 100;
}

export const projetosActions = {
  criarProjeto(
    input: Omit<Projeto,
      "id" | "orcamentoId" | "valorContrato" | "responsavelTecnicoId" | "responsavelComercialId"
      | keyof PlanejamentoProjeto>
      & {
        id?: string; orcamentoId?: string | null; valorContrato?: number;
        responsavelTecnicoId?: string | null; responsavelComercialId?: string | null;
      }
      & Partial<PlanejamentoProjeto>,
  ) {
    const id = input.id || crypto.randomUUID();
    const completo: Projeto = {
      ...PLANEJAMENTO_ZERADO,
      ...input, id,
      orcamentoId: input.orcamentoId ?? null,
      valorContrato: input.valorContrato ?? 0,
      responsavelTecnicoId: input.responsavelTecnicoId ?? null,
      responsavelComercialId: input.responsavelComercialId ?? null,
      // repetidos explicitamente: o spread acima sobrescreveria os zeros
      // com undefined se o chamador passar a chave sem valor.
      planejadoLucroPct: input.planejadoLucroPct ?? 0,
      planejadoImpostoPct: input.planejadoImpostoPct ?? 0,
      planejadoMoPct: input.planejadoMoPct ?? 0,
      planejadoMtPct: input.planejadoMtPct ?? 0,
      planejadoTerceirizadoPct: input.planejadoTerceirizadoPct ?? 0,
      planejadoAdministrativoPct: input.planejadoAdministrativoPct ?? 0,
      planejadoCustos: input.planejadoCustos ?? 0,
      metragem: input.metragem ?? 0,
    };
    state = { ...state, projetos: [...state.projetos, completo] };
    emit();
    void supabase.from("projetos").insert(upperizePayload({
      id, nome: input.nome, cliente: input.cliente, cliente_id: input.clienteId ?? null,
      orcamento_id: input.orcamentoId ?? null, valor_contrato: input.valorContrato ?? 0,
      local: input.local, descricao: input.descricao, responsavel: input.responsavel,
      responsavel_tecnico_id: input.responsavelTecnicoId ?? null,
      responsavel_comercial_id: input.responsavelComercialId ?? null,
      data_inicio: input.dataInicio, prazo: input.prazo,
      status: input.status, progresso: input.progresso, orcado: input.orcado,
    })).then(({ error }) => toastErr("Erro ao salvar no banco", error));
    return id;
  },
  atualizarProjeto(id: string, patch: Partial<Projeto>) {
    state = { ...state, projetos: state.projetos.map(p => p.id === id ? { ...p, ...patch } : p) };
    emit();
    const row: Record<string, unknown> = {};
    if (patch.nome !== undefined) row.nome = patch.nome;
    if (patch.cliente !== undefined) row.cliente = patch.cliente;
    if (patch.clienteId !== undefined) row.cliente_id = patch.clienteId;
    if (patch.local !== undefined) row.local = patch.local;
    if (patch.descricao !== undefined) row.descricao = patch.descricao;
    if (patch.responsavel !== undefined) row.responsavel = patch.responsavel;
    if (patch.responsavelTecnicoId !== undefined) row.responsavel_tecnico_id = patch.responsavelTecnicoId;
    if (patch.responsavelComercialId !== undefined) row.responsavel_comercial_id = patch.responsavelComercialId;
    if (patch.dataInicio !== undefined) row.data_inicio = patch.dataInicio;
    if (patch.prazo !== undefined) row.prazo = patch.prazo;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.progresso !== undefined) row.progresso = patch.progresso;
    if (patch.orcado !== undefined) row.orcado = patch.orcado;
    // planejamento: mapeado aqui para que um patch nessas chaves não seja
    // silenciosamente descartado (hoje nenhuma tela edita esses campos).
    if (patch.planejadoLucroPct !== undefined) row.planejado_lucro_pct = patch.planejadoLucroPct;
    if (patch.planejadoImpostoPct !== undefined) row.planejado_imposto_pct = patch.planejadoImpostoPct;
    if (patch.planejadoMoPct !== undefined) row.planejado_mo_pct = patch.planejadoMoPct;
    if (patch.planejadoMtPct !== undefined) row.planejado_mt_pct = patch.planejadoMtPct;
    if (patch.planejadoTerceirizadoPct !== undefined) row.planejado_terceirizado_pct = patch.planejadoTerceirizadoPct;
    if (patch.planejadoAdministrativoPct !== undefined) row.planejado_administrativo_pct = patch.planejadoAdministrativoPct;
    if (patch.planejadoCustos !== undefined) row.planejado_custos = patch.planejadoCustos;
    if (patch.metragem !== undefined) row.metragem = patch.metragem;
    void supabase.from("projetos").update(upperizePayload(row)).eq("id", id).then(({ error }) => toastErr("Erro ao salvar no banco", error));
  },
  excluirProjeto(id: string) {
    state = {
      projetos: state.projetos.filter(p => p.id !== id),
      custos: state.custos.filter(c => c.projetoId !== id),
      notas: state.notas.filter(n => n.projetoId !== id),
      medicoes: state.medicoes.filter(m => m.projetoId !== id),
      carregado: state.carregado,
    };
    emit();
    void supabase.from("projetos").delete().eq("id", id).then(({ error }) => toastErr("Erro ao salvar no banco", error));
  },
  adicionarCusto(c: Omit<Custo, "id">) {
    const id = crypto.randomUUID();
    state = { ...state, custos: [...state.custos, { ...c, id }] };
    emit();
    void supabase.from("custos").insert(upperizePayload({
      id, projeto_id: c.projetoId, data: c.data,
      descricao: c.descricao, categoria: c.categoria, valor: c.valor,
    })).then(({ error }) => toastErr("Erro ao salvar no banco", error));
  },
  excluirCusto(id: string) {
    state = { ...state, custos: state.custos.filter(c => c.id !== id) };
    emit();
    void supabase.from("custos").delete().eq("id", id).then(({ error }) => toastErr("Erro ao salvar no banco", error));
  },
  adicionarNota(n: Omit<NotaFiscal, "id" | "valor"> & { valor?: number }) {
    const id = crypto.randomUUID();
    // O valor é derivado aqui, e não no formulário, para que qualquer
    // chamador chegue ao mesmo número.
    const valor = calcularValorNota(n.quantidade, n.valorUnitario);
    const nova: NotaFiscal = { ...n, id, valor };
    state = { ...state, notas: [...state.notas, nova] };
    emit();
    void supabase.from("notas_fiscais").insert(upperizePayload({
      id, projeto_id: n.projetoId,
      // Número em branco vira NULL: a coluna deixou de ser obrigatória,
      // e string vazia poluiria a listagem.
      numero: n.numero.trim() || null,
      fornecedor: n.fornecedor, descricao: n.descricao, data: n.data,
      unidade: n.unidade, quantidade: n.quantidade,
      valor_unitario: n.valorUnitario, valor,
      funcionario_id: n.funcionarioId,
    })).then(({ error }) => toastErr("Erro ao salvar no banco", error));
  },
  excluirNota(id: string) {
    state = { ...state, notas: state.notas.filter(n => n.id !== id) };
    emit();
    void supabase.from("notas_fiscais").delete().eq("id", id).then(({ error }) => toastErr("Erro ao salvar no banco", error));
  },
  adicionarMedicao(m: Omit<Medicao, "id">) {
    const id = crypto.randomUUID();
    const nova = { ...m, id };
    state = { ...state, medicoes: [...state.medicoes, nova] };
    const proj = state.projetos.find(p => p.id === m.projetoId);
    if (proj && m.pct > proj.progresso) {
      state = { ...state, projetos: state.projetos.map(p => p.id === m.projetoId ? { ...p, progresso: m.pct } : p) };
      void supabase.from("projetos").update({ progresso: m.pct }).eq("id", m.projetoId).then(({ error }) => toastErr("Erro ao salvar no banco", error));
    }
    emit();
    void supabase.from("medicoes").insert(upperizePayload({
      id, projeto_id: m.projetoId, numero: m.numero, periodo: m.periodo,
      data: m.data, pct: m.pct, valor: m.valor, status: m.status,
    })).then(({ error }) => toastErr("Erro ao salvar no banco", error));
  },
  excluirMedicao(id: string) {
    state = { ...state, medicoes: state.medicoes.filter(m => m.id !== id) };
    emit();
    void supabase.from("medicoes").delete().eq("id", id).then(({ error }) => toastErr("Erro ao salvar no banco", error));
  },
};

export function resumoProjeto(id: string, s: State) {
  const custos = s.custos.filter(c => c.projetoId === id);
  const notas = s.notas.filter(n => n.projetoId === id);
  const medicoes = s.medicoes.filter(m => m.projetoId === id);
  const gastoCustos = custos.reduce((a, c) => a + c.valor, 0);
  const gastoNotas = notas.reduce((a, n) => a + n.valor, 0);
  const gasto = gastoCustos + gastoNotas;
  const medido = medicoes.reduce((a, m) => a + m.valor, 0);
  const proj = s.projetos.find(p => p.id === id);
  const orcado = proj?.orcado ?? 0;
  const financeiro = orcado > 0 ? Math.min(100, Math.round((gasto / orcado) * 100)) : 0;
  return { custos, notas, medicoes, gasto, medido, orcado, financeiro, saldo: orcado - gasto };
}
