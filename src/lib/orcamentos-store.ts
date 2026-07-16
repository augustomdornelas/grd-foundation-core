// ============================================================
// Store de Orcamentos (Comercial)
// ------------------------------------------------------------
// Fonte unica de verdade dos orcamentos. Persistida na tabela
// `orcamentos` do Supabase (protegida por Row Level Security).
// ============================================================
import { useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

function toastErr(msg: string, err: { message?: string } | null | undefined) {
  if (err) toast.error(`${msg}: ${err.message ?? "erro desconhecido"}`);
}

export type OrcStatus =
  | "Levantamento"
  | "Aguardando Retorno"
  | "Em negociação"
  | "Não aprovado"
  | "Cancelado"
  | "Aprovado";

export type TipoServico =
    | "Engenharia e Constru\u00e7\u00e3o"
  | "Gerenciamento"
  | "Reformas Industriais"
  | "Sistemas de Esgoto"
  | "Frezamento";

export type TimelineEvento = {
    data: string;
    de: OrcStatus | "\u2014";
    para: OrcStatus;
    autor: string;
};

export type Nota = {
    id: string;
    data: string;
    autor: string;
    texto: string;
};

export type Orcamento = {
    id: string;
    numero: string;
    cliente: string;
    cnpj: string;
    tipo: TipoServico;
    obra: string;
    descricao: string;
    valor: number;
    responsavel: string;
    data: string;
    validade: string;
    status: OrcStatus;
    probabilidade: number;
    observacoes: string;
    anexo?: string;
    timeline: TimelineEvento[];
    notas: Nota[];
};

export const TIPOS_SERVICO: TipoServico[] = [
    "Engenharia e Constru\u00e7\u00e3o",
    "Gerenciamento",
    "Reformas Industriais",
    "Sistemas de Esgoto",
    "Frezamento",
  ];

export const STATUS_LIST: OrcStatus[] = [
    "Levantamento",
    "Aguardando Retorno",
    "Em negociação",
    "Não aprovado",
    "Cancelado",
    "Aprovado",
  ];

export const RESPONSAVEIS = [
    "Carlos Menezes",
    "Fernanda Braga",
    "Rodrigo Alves",
    "Patr\u00edcia Lima",
  ];

export const STATUS_COLORS: Record<OrcStatus, string> = {
    "Levantamento": "#94A3B8",
    "Aguardando Retorno": "#F59E0B",
    "Em negociação": "#3B82F6",
    "Não aprovado": "#DC2626",
    "Cancelado": "#475569",
    "Aprovado": "#16A34A",
};


// -----------------------------------------------------------
// Mapeamento linha do banco <-> tipo Orcamento
// -----------------------------------------------------------
type OrcamentoRow = {
    id: string;
    numero: string | null;
    cliente: string | null;
    cnpj: string | null;
    tipo_servico: string | null;
    obra: string | null;
    descricao: string | null;
    valor: number | null;
    responsavel: string | null;
    data_emissao: string | null;
    prazo_validade: string | null;
    status: string | null;

    probabilidade: number | null;
    observacoes: string | null;
    anexo: string | null;
    timeline: TimelineEvento[] | null;
    notas: Nota[] | null;
};

function fromRow(r: OrcamentoRow): Orcamento {
    return {
          id: r.id,
          numero: r.numero ?? "",
          cliente: r.cliente ?? "",
          cnpj: r.cnpj ?? "",
          tipo: (r.tipo_servico as TipoServico) ?? TIPOS_SERVICO[0],
          obra: r.obra ?? "",
          descricao: r.descricao ?? "",
          valor: Number(r.valor ?? 0) || 0,
          responsavel: r.responsavel ?? "",
          data: r.data_emissao ?? "",
          validade: r.prazo_validade ?? "",
          status: (r.status as OrcStatus) ?? "Em an\u00e1lise",
          estagio: (r.estagio as EstagioFunil) ?? "Levantamento",
          probabilidade: Number(r.probabilidade ?? 0) || 0,
          observacoes: r.observacoes ?? "",
          anexo: r.anexo ?? undefined,
          timeline: Array.isArray(r.timeline) ? r.timeline : [],
          notas: Array.isArray(r.notas) ? r.notas : [],
    };
}

function toRow(o: Partial<Orcamento>) {
    const row: Record<string, unknown> = {};
    if (o.numero !== undefined) row.numero = o.numero;
    if (o.cliente !== undefined) row.cliente = o.cliente;
    if (o.cnpj !== undefined) row.cnpj = o.cnpj;
    if (o.tipo !== undefined) row.tipo_servico = o.tipo;
    if (o.obra !== undefined) row.obra = o.obra;
    if (o.descricao !== undefined) row.descricao = o.descricao;
    if (o.valor !== undefined) row.valor = o.valor;
    if (o.responsavel !== undefined) row.responsavel = o.responsavel;
    if (o.data !== undefined) row.data_emissao = o.data;
    if (o.validade !== undefined) row.prazo_validade = o.validade;
    if (o.status !== undefined) row.status = o.status;
    if (o.estagio !== undefined) row.estagio = o.estagio;
    if (o.probabilidade !== undefined) row.probabilidade = o.probabilidade;
    if (o.observacoes !== undefined) row.observacoes = o.observacoes;
    if (o.anexo !== undefined) row.anexo = o.anexo;
    if (o.timeline !== undefined) row.timeline = o.timeline;
    if (o.notas !== undefined) row.notas = o.notas;
    return row;
}

// -----------------------------------------------------------
// Store (padrao useSyncExternalStore + Supabase)
// -----------------------------------------------------------
let state: Orcamento[] = [];
const listeners = new Set<() => void>();

function emit() {
    listeners.forEach(l => l());
}
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

const SSR_EMPTY: Orcamento[] = Object.freeze([]) as unknown as Orcamento[];
const getSnapshot = () => state;
const getServerSnapshot = () => SSR_EMPTY;

async function fetchAll() {
  try {
    const { data, error } = await supabase
      .from("orcamentos")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) { toastErr("Falha ao carregar orçamentos", error); state = []; emit(); return; }
    state = (data as OrcamentoRow[] ?? []).map(fromRow);
    emit();
  } catch (err) {
    console.error("[orcamentos-store] fetchAll error:", err);
    state = [];
    emit();
  }
}

if (typeof window !== "undefined") {
  void fetchAll();
}

export function useOrcamentos<T>(selector: (s: Orcamento[]) => T): T {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => selector(snap), [snap, selector]);
}

function uid() { return `tmp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`; }

function proximoNumero(): string {
  const used = new Set(
    state.map(o => Number(o.numero.replace(/\D/g, ""))).filter(n => !isNaN(n) && n > 0)
  );
  let n = 1;
  while (used.has(n)) n++;
  return `ORC-${String(n).padStart(3, "0")}`;
}

export const orcamentosActions = {
  proximoNumero,
  criar(input: Omit<Orcamento, "id" | "numero" | "timeline" | "notas"> & { numero?: string }) {
    const numero = input.numero || proximoNumero();
    const timeline: TimelineEvento[] = [
      { data: new Date().toISOString(), de: "\u2014", para: input.status, autor: input.responsavel },
    ];
    const tempId = uid();
    state = [{ ...input, id: tempId, numero, timeline, notas: [] }, ...state];
    emit();
    void (async () => {
      const { data, error } = await supabase
        .from("orcamentos")
        .insert(toRow({ ...input, numero, timeline, notas: [] }))
        .select()
        .single();
      if (error) { toastErr("Falha ao criar orçamento", error); state = state.filter(o => o.id !== tempId); emit(); return; }
      state = state.map(o => o.id === tempId ? fromRow(data as OrcamentoRow) : o);
      emit();
    })();
    return tempId;
  },
  atualizar(id: string, patch: Partial<Orcamento>) {
    const atual = state.find(o => o.id === id);
    if (!atual) return;
    const novoPatch: Partial<Orcamento> = { ...patch };
    if (patch.status && patch.status !== atual.status) {
      novoPatch.timeline = [
        ...atual.timeline,
        { data: new Date().toISOString(), de: atual.status, para: patch.status, autor: patch.responsavel ?? atual.responsavel },
      ];
    }
    state = state.map(o => o.id === id ? { ...o, ...novoPatch } : o);
    emit();
    void supabase.from("orcamentos").update(toRow(novoPatch)).eq("id", id)
      .then(({ error }) => toastErr("Falha ao atualizar orçamento", error));
  },
  duplicar(id: string) {
    const orig = state.find(o => o.id === id);
    if (!orig) return;
    const numero = proximoNumero();
    const timeline: TimelineEvento[] = [{ data: new Date().toISOString(), de: "\u2014", para: "Em an\u00e1lise", autor: orig.responsavel }];
    const input = {
      ...orig,
      data: new Date().toISOString().slice(0, 10),
      status: "Em an\u00e1lise" as OrcStatus,
      estagio: "Proposta enviada" as EstagioFunil,
    };
    const tempId = uid();
    state = [{ ...input, id: tempId, numero, timeline, notas: [] }, ...state];
    emit();
    void (async () => {
      const { data, error } = await supabase
        .from("orcamentos")
        .insert(toRow({ ...input, numero, timeline, notas: [] }))
        .select()
        .single();
      if (error) { toastErr("Falha ao duplicar orçamento", error); state = state.filter(o => o.id !== tempId); emit(); return; }
      state = state.map(o => o.id === tempId ? fromRow(data as OrcamentoRow) : o);
      emit();
    })();
  },
  excluir(id: string) {
    const backup = state;
    state = state.filter(o => o.id !== id);
    emit();
    void supabase.from("orcamentos").delete().eq("id", id)
      .then(({ error }) => { if (error) { toastErr("Falha ao excluir orçamento", error); state = backup; emit(); } });
  },
  adicionarNota(id: string, autor: string, texto: string) {
    const atual = state.find(o => o.id === id);
    if (!atual) return;
    const notas = [...atual.notas, { id: uid(), data: new Date().toISOString(), autor, texto }];
    state = state.map(o => o.id === id ? { ...o, notas } : o);
    emit();
    void supabase.from("orcamentos").update({ notas }).eq("id", id)
      .then(({ error }) => toastErr("Falha ao salvar nota", error));
  },
};


// Helpers de periodo compartilhados (usados em /app tambem)
export type PeriodoTipo = "mes" | "trimestre" | "ano" | "custom";
export type Periodo = { tipo: PeriodoTipo; ini?: string; fim?: string };

export function rangeDoPeriodo(p: Periodo): { ini: Date; fim: Date } {
    const hoje = new Date();
    const y = hoje.getFullYear();
    const m = hoje.getMonth();
    if (p.tipo === "custom" && p.ini && p.fim) {
        return { ini: new Date(p.ini + "T00:00:00"), fim: new Date(p.fim + "T23:59:59.999") };
    }
    if (p.tipo === "mes") {
        // do dia 1 ao último dia do mês atual
        return {
            ini: new Date(y, m, 1, 0, 0, 0, 0),
            fim: new Date(y, m + 1, 0, 23, 59, 59, 999),
        };
    }
    if (p.tipo === "trimestre") {
        // dos últimos 3 meses até hoje (rolling window)
        const ini = new Date(y, m, hoje.getDate(), 0, 0, 0, 0);
        ini.setMonth(ini.getMonth() - 3);
        return { ini, fim: new Date(y, m, hoje.getDate(), 23, 59, 59, 999) };
    }
    // ano: 01/01 até 31/12 do ano atual
    return {
        ini: new Date(y, 0, 1, 0, 0, 0, 0),
        fim: new Date(y, 11, 31, 23, 59, 59, 999),
    };
}

export function rangeAnterior(p: Periodo): { ini: Date; fim: Date } {
    const cur = rangeDoPeriodo(p);
    const durMs = cur.fim.getTime() - cur.ini.getTime();
    return { ini: new Date(cur.ini.getTime() - durMs - 1), fim: new Date(cur.ini.getTime() - 1) };
}

export function dentro(dataISO: string, r: { ini: Date; fim: Date }) {
    if (!dataISO) return false;
    const d = new Date(dataISO.length <= 10 ? dataISO + "T12:00:00" : dataISO);
    return d >= r.ini && d <= r.fim;
}
