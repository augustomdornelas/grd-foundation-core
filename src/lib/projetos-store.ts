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

export type ProjetoStatus = "Planejamento" | "Em andamento" | "Paralisado" | "Concluído";

export type Projeto = {
  id: string;
  nome: string;
  cliente: string;
  local: string;
  descricao: string;
  responsavel: string;
  dataInicio: string;
  prazo: string;
  status: ProjetoStatus;
  progresso: number;
  orcado: number;
};

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
  numero: string;
  fornecedor: string;
  descricao: string;
  data: string;
  valor: number;
  status: "Pendente" | "Pago" | "Cancelado";
};

export type Medicao = {
  id: string;
  projetoId: string;
  numero: number;
  periodo: string;
  data: string;
  pct: number;
  valor: number;
  status: "Aprovada" | "Em análise" | "Enviada";
};

type State = {
  projetos: Projeto[];
  custos: Custo[];
  notas: NotaFiscal[];
  medicoes: Medicao[];
};

const SSR: State = { projetos: [], custos: [], notas: [], medicoes: [] };
let state: State = SSR;
const listeners = new Set<() => void>();
function emit() { listeners.forEach(l => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }

async function fetchAll() {
  const [p, c, n, m] = await Promise.all([
    supabase.from("projetos").select("*").order("created_at", { ascending: false }),
    supabase.from("custos").select("*").order("data", { ascending: false }),
    supabase.from("notas_fiscais").select("*").order("data", { ascending: false }),
    supabase.from("medicoes").select("*").order("data", { ascending: false }),
  ]);
  toastErr("Falha ao carregar projetos", p.error);
  toastErr("Falha ao carregar custos", c.error);
  toastErr("Falha ao carregar notas fiscais", n.error);
  toastErr("Falha ao carregar medições", m.error);
  state = {
    projetos: (p.data ?? []).map((r: any) => ({
      id: r.id, nome: r.nome ?? "", cliente: r.cliente ?? "",
      local: r.local ?? "", descricao: r.descricao ?? "",
      responsavel: r.responsavel ?? "", dataInicio: r.data_inicio ?? "",
      prazo: r.prazo ?? "", status: r.status ?? "Planejamento",
      progresso: r.progresso ?? 0, orcado: r.orcado ?? 0,
    })),
    custos: (c.data ?? []).map((r: any) => ({
      id: r.id, projetoId: r.projeto_id ?? "", data: r.data ?? "",
      descricao: r.descricao ?? "", categoria: r.categoria ?? "Outro",
      valor: r.valor ?? 0,
    })),
    notas: (n.data ?? []).map((r: any) => ({
      id: r.id, projetoId: r.projeto_id ?? "", numero: r.numero ?? "",
      fornecedor: r.fornecedor ?? "", descricao: r.descricao ?? "",
      data: r.data ?? "", valor: r.valor ?? 0, status: r.status ?? "Pendente",
    })),
    medicoes: (m.data ?? []).map((r: any) => ({
      id: r.id, projetoId: r.projeto_id ?? "", numero: r.numero ?? 0,
      periodo: r.periodo ?? "", data: r.data ?? "",
      pct: r.pct ?? 0, valor: r.valor ?? 0, status: r.status ?? "Em análise",
    })),
  };
  emit();
}

if (typeof window !== "undefined") void fetchAll();

export function useProjetosStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(SSR));
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
}

export const projetosActions = {
  criarProjeto(input: Omit<Projeto, "id"> & { id?: string }) {
    const id = input.id || uid("P");
    state = { ...state, projetos: [...state.projetos, { ...input, id }] };
    emit();
    void supabase.from("projetos").insert(upperizePayload({
      id, nome: input.nome, cliente: input.cliente, local: input.local,
      descricao: input.descricao, responsavel: input.responsavel,
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
    if (patch.local !== undefined) row.local = patch.local;
    if (patch.descricao !== undefined) row.descricao = patch.descricao;
    if (patch.responsavel !== undefined) row.responsavel = patch.responsavel;
    if (patch.dataInicio !== undefined) row.data_inicio = patch.dataInicio;
    if (patch.prazo !== undefined) row.prazo = patch.prazo;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.progresso !== undefined) row.progresso = patch.progresso;
    if (patch.orcado !== undefined) row.orcado = patch.orcado;
    void supabase.from("projetos").update(upperizePayload(row)).eq("id", id).then(({ error }) => toastErr("Erro ao salvar no banco", error));
  },
  excluirProjeto(id: string) {
    state = {
      projetos: state.projetos.filter(p => p.id !== id),
      custos: state.custos.filter(c => c.projetoId !== id),
      notas: state.notas.filter(n => n.projetoId !== id),
      medicoes: state.medicoes.filter(m => m.projetoId !== id),
    };
    emit();
    void supabase.from("projetos").delete().eq("id", id).then(({ error }) => toastErr("Erro ao salvar no banco", error));
  },
  adicionarCusto(c: Omit<Custo, "id">) {
    const id = uid("C");
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
  adicionarNota(n: Omit<NotaFiscal, "id">) {
    const id = uid("N");
    state = { ...state, notas: [...state.notas, { ...n, id }] };
    emit();
    void supabase.from("notas_fiscais").insert(upperizePayload({
      id, projeto_id: n.projetoId, numero: n.numero, fornecedor: n.fornecedor,
      descricao: n.descricao, data: n.data, valor: n.valor, status: n.status,
    })).then(({ error }) => toastErr("Erro ao salvar no banco", error));
  },
  excluirNota(id: string) {
    state = { ...state, notas: state.notas.filter(n => n.id !== id) };
    emit();
    void supabase.from("notas_fiscais").delete().eq("id", id).then(({ error }) => toastErr("Erro ao salvar no banco", error));
  },
  adicionarMedicao(m: Omit<Medicao, "id">) {
    const id = uid("M");
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
