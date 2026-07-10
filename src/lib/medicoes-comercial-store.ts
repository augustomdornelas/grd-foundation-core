// ============================================================
// Store de Medições Comerciais — integração real com Supabase
// ============================================================
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Orcamento } from "@/lib/orcamentos-store";

function toastErr(msg: string, err: { message?: string } | null | undefined) {
  if (err) toast.error(`${msg}: ${err.message ?? "erro desconhecido"}`);
}

export type MedStatus = "Lançada" | "Em aprovação" | "Recebida" | "Prevista";

export type Medicao = {
  id: string;
  orcamentoId: string;
  numero: string;
  data: string;
  descricao: string;
  valor: number;
  percentualFisico: number;
  dataRecebimento: string;
  previsaoRecebimento: string;
  status: MedStatus;
  observacoes: string;
};

export type ResumoOrcamento = {
  orcamento: Orcamento;
  faturado: number;
  saldo: number;
  pct: number;
  medicoes: Medicao[];
  statusExec: "Aguardando início" | "Em execução" | "Concluído";
  proximaMedicao: string | null;
};

const SSR: Medicao[] = [];
let state: Medicao[] = SSR;
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
    status: (r.status ?? "Lançada") as MedStatus,
    observacoes: r.observacoes ?? "",
  }));
  emit();
}

if (typeof window !== "undefined") void fetchAll();

export function useMedicoes<T>(selector: (s: Medicao[]) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(SSR));
}

export function useMedicoesPorOrcamento(orcamentoId: string): Medicao[] {
  return useSyncExternalStore(
    subscribe,
    () => state.filter(m => m.orcamentoId === orcamentoId),
    () => [],
  );
}

export function resumoDoOrcamento(orcamento: Orcamento, medicoes: Medicao[]): ResumoOrcamento {
  const minhas = medicoes
    .filter(m => m.orcamentoId === orcamento.id)
    .sort((a, b) => a.data.localeCompare(b.data));
  const faturado = minhas.reduce((a, m) => a + m.valor, 0);
  const saldo = Math.max(0, orcamento.valor - faturado);
  const pct = orcamento.valor > 0 ? Math.min(100, Math.round((faturado / orcamento.valor) * 100)) : 0;

  let statusExec: ResumoOrcamento["statusExec"] = "Aguardando início";
  if (pct >= 100) statusExec = "Concluído";
  else if (minhas.length > 0) statusExec = "Em execução";

  // Próxima medição prevista (status "Prevista" mais próxima no futuro)
  const hoje = new Date().toISOString().slice(0, 10);
  const previstas = minhas
    .filter(m => m.status === "Prevista" && m.previsaoRecebimento >= hoje)
    .sort((a, b) => a.previsaoRecebimento.localeCompare(b.previsaoRecebimento));
  const proximaMedicao = previstas[0]?.previsaoRecebimento ?? null;

  return { orcamento, faturado, saldo, pct, medicoes: minhas, statusExec, proximaMedicao };
}

export function proximoNumeroMedicao(orcamentoId: string): string {
  const existing = state.filter(m => m.orcamentoId === orcamentoId);
  return `MED-${String(existing.length + 1).padStart(3, "0")}`;
}

function uid() {
  return `MED-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
}

export const medicoesActions = {
  criar(input: Omit<Medicao, "id" | "percentualFisico" | "dataRecebimento"> & { percentualFisico?: number; dataRecebimento?: string }) {
    const id = uid();
    const nova: Medicao = {
      ...input,
      id,
      percentualFisico: input.percentualFisico ?? 0,
      dataRecebimento: input.dataRecebimento ?? input.previsaoRecebimento ?? "",
    };
    state = [nova, ...state];
    emit();
    void supabase.from("medicoes").insert({
      id,
      orcamento_id: input.orcamentoId,
      numero: input.numero,
      data: input.data,
      descricao: input.descricao,
      valor: input.valor,
      percentual_fisico: input.percentualFisico ?? 0,
      data_recebimento: input.previsaoRecebimento ?? "",
      status: input.status,
      observacoes: input.observacoes,
    });
    return id;
  },
  atualizar(id: string, patch: Partial<Medicao>) {
    state = state.map(m => m.id === id ? { ...m, ...patch } : m);
    emit();
    const row: Record<string, unknown> = {};
    if (patch.numero !== undefined) row.numero = patch.numero;
    if (patch.data !== undefined) row.data = patch.data;
    if (patch.descricao !== undefined) row.descricao = patch.descricao;
    if (patch.valor !== undefined) row.valor = patch.valor;
    if (patch.percentualFisico !== undefined) row.percentual_fisico = patch.percentualFisico;
    if (patch.previsaoRecebimento !== undefined) row.data_recebimento = patch.previsaoRecebimento;
    if (patch.dataRecebimento !== undefined) row.data_recebimento = patch.dataRecebimento;
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
