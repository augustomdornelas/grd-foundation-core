// ============================================================
// Store de Equipamentos — integração real com Supabase
// ============================================================
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

function toastErr(msg: string, err: { message?: string } | null | undefined) {
  if (err) toast.error(`${msg}: ${err.message ?? "erro desconhecido"}`);
}

export type EquipStatus = "Disponível" | "Emprestado" | "Manutenção";
export type UnidadePeriodo = "dia" | "semana" | "mês";

export type Equipamento = {
  id: string;
  nome: string;
  codigo: string;
  categoria: string;
  descricao: string;
  valor: number;
  custoPeriodo: number;
  unidade: UnidadePeriodo;
  status: EquipStatus;
  localBase: string;
  localAtual: string;
  responsavelAtual?: string;
};

export type Emprestimo = {
  id: string;
  equipamentoId: string;
  destino: string;
  responsavel: string;
  dataInicio: string;
  dataDevolucaoPrevista: string;
  dataDevolucaoReal?: string;
  custoPeriodo: number;
  unidade: UnidadePeriodo;
  observacoes?: string;
  custoTotal: number;
  ativo: boolean;
};

export type ManutencaoTipo = "Preventiva" | "Corretiva" | "Emergencial";
export type ManutencaoStatus = "Aberta" | "Em andamento" | "Concluída";

export type Manutencao = {
  id: string;
  equipamentoId: string;
  tipo: ManutencaoTipo;
  data: string;
  
  dataFim?: string;
  descricao: string;
  oficina: string;
  custoPecas: number;
  custoMaoObra: number;
  custo: number; // total = peças + mão de obra
  statusManut: ManutencaoStatus;
  observacoes?: string;
  aberta: boolean; // derivado: status !== "Concluída"
};

type State = {
  equipamentos: Equipamento[];
  emprestimos: Emprestimo[];
  manutencoes: Manutencao[];
};

const SSR: State = { equipamentos: [], emprestimos: [], manutencoes: [] };
let state: State = SSR;
const listeners = new Set<() => void>();
function emit() { listeners.forEach(l => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }

const DIA_MS = 24 * 60 * 60 * 1000;

export function periodos(inicio: string, fim: string, unidade: UnidadePeriodo): number {
  if (!inicio || !fim) return 0;
  const dias = Math.max(1, Math.ceil((new Date(fim).getTime() - new Date(inicio).getTime()) / DIA_MS));
  if (unidade === "dia") return dias;
  if (unidade === "semana") return Math.max(1, Math.ceil(dias / 7));
  return Math.max(1, Math.ceil(dias / 30));
}

export function custoAtivoTotal(s: State): number {
  return s.emprestimos
    .filter(e => e.ativo)
    .reduce((a, e) => a + e.custoTotal, 0);
}

async function fetchAll() {
  const [eq, emp, man] = await Promise.all([
    supabase.from("equipamentos").select("*").order("created_at", { ascending: false }),
    supabase.from("emprestimos").select("*").order("data_inicio", { ascending: false }),
    supabase.from("manutencoes").select("*").order("data", { ascending: false }),
  ]);
  toastErr("Falha ao carregar equipamentos", eq.error);
  toastErr("Falha ao carregar empréstimos", emp.error);
  toastErr("Falha ao carregar manutenções", man.error);
  state = {
    equipamentos: (eq.data ?? []).map((r: any) => ({
      id: r.id, nome: r.nome ?? "", codigo: r.codigo ?? "",
      categoria: r.categoria ?? "", descricao: r.descricao ?? "",
      valor: r.valor ?? 0, custoPeriodo: r.custo_periodo ?? 0,
      unidade: (r.unidade_periodo ?? r.unidade ?? "dia") as UnidadePeriodo,
      status: (r.status ?? "Disponível") as EquipStatus,
      localBase: r.local_base ?? "", localAtual: r.local_atual ?? "",
      responsavelAtual: r.responsavel_atual ?? undefined,
    })),
    emprestimos: (emp.data ?? []).map((r: any) => ({
      id: r.id, equipamentoId: r.equipamento_id ?? "",
      destino: r.destino ?? "", responsavel: r.responsavel ?? "",
      dataInicio: r.data_inicio ?? "",
      dataDevolucaoPrevista: r.data_devolucao_prevista ?? r.data_prevista ?? "",
      dataDevolucaoReal: r.data_devolucao_real ?? r.data_real ?? undefined,
      custoPeriodo: r.custo_periodo ?? 0,
      unidade: (r.unidade ?? "dia") as UnidadePeriodo,
      observacoes: r.observacoes ?? undefined,
      custoTotal: r.custo_total ?? 0, ativo: r.ativo ?? true,
    })),
    manutencoes: (man.data ?? []).map((r: any) => {
      const pecas = Number(r.custo_pecas ?? 0);
      const mo = Number(r.custo_mao_obra ?? 0);
      const total = Number(r.custo ?? pecas + mo);
      const status = (r.status ?? (r.aberta === false ? "Concluída" : "Aberta")) as ManutencaoStatus;
      return {
        id: r.id,
        equipamentoId: r.equipamento_id ?? "",
        tipo: (r.tipo ?? "Preventiva") as ManutencaoTipo,
        data: r.data ?? "",
        dataFim: r.data_fim ?? undefined,
        descricao: r.descricao ?? "",
        oficina: r.oficina ?? "",
        custoPecas: pecas,
        custoMaoObra: mo,
        custo: total,
        statusManut: status,
        observacoes: r.observacoes ?? undefined,
        aberta: r.aberta ?? (status !== "Concluída"),
      };
    }),
  };
  emit();
}

if (typeof window !== "undefined") void fetchAll();

export function useEquipStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(SSR));
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
}

export const equipActions = {
  criarEquipamento(input: Omit<Equipamento, "id">) {
    const id = uid("E");
    state = { ...state, equipamentos: [...state.equipamentos, { ...input, id }] };
    emit();
    void supabase.from("equipamentos").insert({
      id, nome: input.nome, codigo: input.codigo, categoria: input.categoria,
      descricao: input.descricao, valor: input.valor, custo_periodo: input.custoPeriodo,
      unidade_periodo: input.unidade, status: input.status,
      local_base: input.localBase, local_atual: input.localAtual,
      responsavel_atual: input.responsavelAtual ?? null,
    }).then(({ error }) => toastErr("Erro ao salvar no banco", error));
    return id;
  },
  atualizarEquipamento(id: string, patch: Partial<Equipamento>) {
    state = { ...state, equipamentos: state.equipamentos.map(e => e.id === id ? { ...e, ...patch } : e) };
    emit();
    const row: Record<string, unknown> = {};
    if (patch.nome !== undefined) row.nome = patch.nome;
    if (patch.codigo !== undefined) row.codigo = patch.codigo;
    if (patch.categoria !== undefined) row.categoria = patch.categoria;
    if (patch.descricao !== undefined) row.descricao = patch.descricao;
    if (patch.valor !== undefined) row.valor = patch.valor;
    if (patch.custoPeriodo !== undefined) row.custo_periodo = patch.custoPeriodo;
    if (patch.unidade !== undefined) row.unidade_periodo = patch.unidade;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.localBase !== undefined) row.local_base = patch.localBase;
    if (patch.localAtual !== undefined) row.local_atual = patch.localAtual;
    if (patch.responsavelAtual !== undefined) row.responsavel_atual = patch.responsavelAtual;
    void supabase.from("equipamentos").update(row).eq("id", id).then(({ error }) => toastErr("Erro ao salvar no banco", error));
  },
  excluirEquipamento(id: string) {
    state = {
      equipamentos: state.equipamentos.filter(e => e.id !== id),
      emprestimos: state.emprestimos.filter(e => e.equipamentoId !== id),
      manutencoes: state.manutencoes.filter(m => m.equipamentoId !== id),
    };
    emit();
    void supabase.from("equipamentos").delete().eq("id", id).then(({ error }) => toastErr("Erro ao salvar no banco", error));
  },
  registrarEmprestimo(input: Omit<Emprestimo, "id" | "custoTotal" | "ativo" | "dataDevolucaoReal">) {
    const id = uid("EM");
    const qtd = periodos(input.dataInicio, input.dataDevolucaoPrevista, input.unidade);
    const custoTotal = qtd * input.custoPeriodo;
    const novo: Emprestimo = { ...input, id, custoTotal, ativo: true };
    state = {
      ...state,
      emprestimos: [...state.emprestimos, novo],
      equipamentos: state.equipamentos.map(e =>
        e.id === input.equipamentoId
          ? { ...e, status: "Emprestado" as EquipStatus, localAtual: input.destino, responsavelAtual: input.responsavel }
          : e
      ),
    };
    emit();
    void supabase.from("emprestimos").insert({
      id, equipamento_id: input.equipamentoId, destino: input.destino,
      responsavel: input.responsavel, data_inicio: input.dataInicio,
      data_devolucao_prevista: input.dataDevolucaoPrevista,
      custo_periodo: input.custoPeriodo, unidade: input.unidade,
      observacoes: input.observacoes ?? null, custo_total: custoTotal, ativo: true,
    }).then(({ error }) => toastErr("Erro ao salvar no banco", error));
    void supabase.from("equipamentos").update({
      status: "Emprestado", local_atual: input.destino, responsavel_atual: input.responsavel,
    }).eq("id", input.equipamentoId).then(({ error }) => toastErr("Erro ao salvar no banco", error));
    return id;
  },
  registrarDevolucao(emprestimoId: string, dataReal: string) {
    const emp = state.emprestimos.find(e => e.id === emprestimoId);
    if (!emp) return;
    const qtd = periodos(emp.dataInicio, dataReal, emp.unidade);
    const custoFinal = qtd * emp.custoPeriodo;
    state = {
      ...state,
      emprestimos: state.emprestimos.map(e =>
        e.id === emprestimoId ? { ...e, dataDevolucaoReal: dataReal, custoTotal: custoFinal, ativo: false } : e
      ),
      equipamentos: state.equipamentos.map(e =>
        e.id === emp.equipamentoId
          ? { ...e, status: "Disponível" as EquipStatus, localAtual: e.localBase, responsavelAtual: undefined }
          : e
      ),
    };
    emit();
    void supabase.from("emprestimos").update({
      data_devolucao_real: dataReal, custo_total: custoFinal, ativo: false,
    }).eq("id", emprestimoId).then(({ error }) => toastErr("Erro ao salvar no banco", error));
    const equip = state.equipamentos.find(e => e.id === emp.equipamentoId);
    void supabase.from("equipamentos").update({
      status: "Disponível", local_atual: equip?.localBase ?? "", responsavel_atual: null,
    }).eq("id", emp.equipamentoId).then(({ error }) => toastErr("Erro ao salvar no banco", error));
  },
  registrarManutencao(input: Omit<Manutencao, "id" | "aberta" | "custo"> & { custo?: number }) {
    const id = uid("MAN");
    const custo = (input.custoPecas || 0) + (input.custoMaoObra || 0);
    const aberta = input.statusManut !== "Concluída";
    const novo: Manutencao = { ...input, id, custo, aberta };
    state = {
      ...state,
      manutencoes: [...state.manutencoes, novo],
      equipamentos: state.equipamentos.map(e =>
        e.id === input.equipamentoId && aberta ? { ...e, status: "Manutenção" as EquipStatus } : e
      ),
    };
    emit();
    void supabase.from("manutencoes").insert({
      id, equipamento_id: input.equipamentoId, tipo: input.tipo,
      data: input.data, data_fim: input.dataFim ?? null,
      descricao: input.descricao, oficina: input.oficina,
      custo_pecas: input.custoPecas, custo_mao_obra: input.custoMaoObra, custo,
      status: input.statusManut, observacoes: input.observacoes ?? null, aberta,
    }).then(({ error }) => toastErr("Erro ao salvar no banco", error));
    if (aberta) {
      void supabase.from("equipamentos").update({ status: "Manutenção" }).eq("id", input.equipamentoId).then(({ error }) => toastErr("Erro ao salvar no banco", error));
    }
    return id;
  },
  atualizarManutencao(id: string, patch: Partial<Manutencao>) {
    state = {
      ...state,
      manutencoes: state.manutencoes.map(m => {
        if (m.id !== id) return m;
        const merged = { ...m, ...patch };
        merged.custo = (merged.custoPecas || 0) + (merged.custoMaoObra || 0);
        merged.aberta = merged.statusManut !== "Concluída";
        return merged;
      }),
    };
    emit();
    const row: Record<string, unknown> = {};
    if (patch.tipo !== undefined) row.tipo = patch.tipo;
    if (patch.data !== undefined) row.data = patch.data;
    if (patch.dataFim !== undefined) row.data_fim = patch.dataFim;
    if (patch.descricao !== undefined) row.descricao = patch.descricao;
    if (patch.oficina !== undefined) row.oficina = patch.oficina;
    if (patch.custoPecas !== undefined) row.custo_pecas = patch.custoPecas;
    if (patch.custoMaoObra !== undefined) row.custo_mao_obra = patch.custoMaoObra;
    if (patch.statusManut !== undefined) { row.status = patch.statusManut; row.aberta = patch.statusManut !== "Concluída"; }
    if (patch.observacoes !== undefined) row.observacoes = patch.observacoes;
    const m = state.manutencoes.find(x => x.id === id);
    if (m) row.custo = m.custo;
    void supabase.from("manutencoes").update(row).eq("id", id).then(({ error }) => toastErr("Erro ao salvar no banco", error));
  },
  fecharManutencao(id: string, dataFim: string) {
    const man = state.manutencoes.find(m => m.id === id);
    if (!man) return;
    state = {
      ...state,
      manutencoes: state.manutencoes.map(m => m.id === id ? { ...m, dataFim, aberta: false, statusManut: "Concluída" as ManutencaoStatus } : m),
      equipamentos: state.equipamentos.map(e =>
        e.id === man.equipamentoId ? { ...e, status: "Disponível" as EquipStatus } : e
      ),
    };
    emit();
    void supabase.from("manutencoes").update({ data_fim: dataFim, aberta: false, status: "Concluída" }).eq("id", id).then(({ error }) => toastErr("Erro ao salvar no banco", error));
    void supabase.from("equipamentos").update({ status: "Disponível" }).eq("id", man.equipamentoId).then(({ error }) => toastErr("Erro ao salvar no banco", error));
  },
};
