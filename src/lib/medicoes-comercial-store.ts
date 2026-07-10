// ============================================================
// Store de Medições Comerciais — integração real com Supabase
// ============================================================
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Orcamento } from "@/lib/orcamentos-store";

export type MedicaoStatus = "Lançada" | "Em aprovação" | "Recebida";

export type MedicaoComercial = {
  id: string;
  orcamentoId: string;
  numero: string;
  data: string;
  descricao: string;
  valor: number;
  percentualFisico: number;
  dataRecebimento: string;
  previsaoRecebimento: string;
  status: MedicaoStatus;
  observacoes: string;
};

export type ResumoOrcamento = {
  orcamento: Orcamento;
  faturado: number;
  saldo: number;
  pct: number;
  medicoes: MedicaoComercial[];
};

const SSR: MedicaoComercial[] = [];
let state: MedicaoComercial[] = SSR;
const listeners = new Set<() => void>();
function emit() { listeners.forEach(l => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }

async function fetchAll() {
  const { data } = await supabase
    .from("medicoes")
    .select("*")
    .order("data", { ascending: false });
  state = (data ?? []).map((r: any) => ({
    id: r.id,
    orcamentoId: r.orcamento_id ?? "",
    numero: r.numero ?? "",
    data: r.data ?? "",
    descricao: r.descricao ?? "",
    valor: r.valor ?? 0,
    percentualFisico: r.percentual_fisico ?? 0,
    dataRecebimento: r.data_recebimento ?? "",
    previsaoRecebimento: r.data_recebimento ?? "",
    status: (r.status ?? "Lançada") as MedicaoStatus,
    observacoes: r.observacoes ?? "",
  }));
  emit();
}

if (typeof window !== "undefined") void fetchAll();

export function useMedicoes<T>(selector: (s: MedicaoComercial[]) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(SSR));
}

export function useMedicoesPorOrcamento(orcamentoId: string): MedicaoComercial[] {
  return useSyncExternalStore(
    subscribe,
    () => state.filter(m => m.orcamentoId === orcamentoId),
    () => [],
  );
}

export function resumoDoOrcamento(orcamento: Orcamento, medicoes: MedicaoComercial[]): ResumoOrcamento {
  const minhas = medicoes.filter(m => m.orcamentoId === orcamento.id);
  const faturado = minhas.reduce((a, m) => a + m.valor, 0);
  const saldo = Math.max(0, orcamento.valor - faturado);
  const pct = orcamento.valor > 0 ? Math.min(100, (faturado / orcamento.valor) * 100) : 0;
  return { orcamento, faturado, saldo, pct, medicoes: minhas };
}

function uid() {
  return `MED-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
}

export function proximoNumeroMedicao(orcamentoId: string): string {
  const existing = state.filter(m => m.orcamentoId === orcamentoId);
  return `MED-${String(existing.length + 1).padStart(3, "0")}`;
}

export const medicoesComercialActions = {
  criar(input: Omit<MedicaoComercial, "id">) {
    const id = uid();
    const nova = { ...input, id };
    state = [nova, ...state];
    emit();
    void supabase.from("medicoes").insert({
      id,
      orcamento_id: input.orcamentoId,
      numero: input.numero,
      data: input.data,
      descricao: input.descricao,
      valor: input.valor,
      percentual_fisico: input.percentualFisico,
      data_recebimento: input.dataRecebimento,
      status: input.status,
      observacoes: input.observacoes,
    });
    return id;
  },
  atualizar(id: string, patch: Partial<MedicaoComercial>) {
    state = state.map(m => m.id === id ? { ...m, ...patch } : m);
    emit();
    const row: Record<string, unknown> = {};
    if (patch.numero !== undefined) row.numero = patch.numero;
    if (patch.data !== undefined) row.data = patch.data;
    if (patch.descricao !== undefined) row.descricao = patch.descricao;
    if (patch.valor !== undefined) row.valor = patch.valor;
    if (patch.percentualFisico !== undefined) row.percentual_fisico = patch.percentualFisico;
    if (patch.dataRecebimento !== undefined) row.data_recebimento = patch.dataRecebimento;
    if (patch.previsaoRecebimento !== undefined) row.data_recebimento = patch.previsaoRecebimento;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.observacoes !== undefined) row.observacoes = patch.observacoes;
    void supabase.from("medicoes").update(row).eq("id", id);
  },
  excluir(id: string) {
    state = state.filter(m => m.id !== id);
    emit();
    void supabase.from("medicoes").delete().eq("id", id);
  },
};
