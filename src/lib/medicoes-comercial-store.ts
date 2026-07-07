// ============================================================
// Store de Medições (Comercial — Previsão de Entrada)
// ------------------------------------------------------------
// Cada medição está vinculada a um orçamento (orcamentos-store).
// Compartilhada entre /app/comercial (seção Previsão de Entrada)
// e o painel /app (bloco resumo).
// ============================================================
import { useMemo, useSyncExternalStore } from "react";
import { useOrcamentos, type Orcamento } from "@/lib/orcamentos-store";

export type MedStatus = "Lançada" | "Em aprovação" | "Recebida" | "Prevista";

export type Medicao = {
  id: string;
  orcamentoId: string;
  numero: string; // MED-001
  data: string; // ISO
  valor: number;
  descricao: string;
  previsaoRecebimento: string;
  status: MedStatus;
  observacoes: string;
  anexo?: string;
};

const KEY = "grd_medicoes_comercial_v1";

function iso(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// Seed baseado nos IDs de orcamentos-store (O-1..O-22). Alguns
// aprovados recebem medições, outros ficam sem — para variedade.
function seed(): Medicao[] {
  const raw: Omit<Medicao, "id">[] = [
    // O-1 Bracell — 3 medições (concluído)
    { orcamentoId: "O-1", numero: "MED-001", data: iso(60), valor: 800_000, descricao: "Fundações", previsaoRecebimento: iso(50), status: "Recebida", observacoes: "" },
    { orcamentoId: "O-1", numero: "MED-002", data: iso(35), valor: 900_000, descricao: "Estrutura", previsaoRecebimento: iso(25), status: "Recebida", observacoes: "" },
    { orcamentoId: "O-1", numero: "MED-003", data: iso(10), valor: 680_000, descricao: "Acabamento", previsaoRecebimento: iso(0), status: "Lançada", observacoes: "" },
    // O-3 Mondelli — 1 medição (em execução)
    { orcamentoId: "O-3", numero: "MED-001", data: iso(15), valor: 250_000, descricao: "Etapa 1", previsaoRecebimento: iso(5), status: "Lançada", observacoes: "" },
    // O-5 Dexco — 1 medição parcial
    { orcamentoId: "O-5", numero: "MED-001", data: iso(20), valor: 120_000, descricao: "Frezamento setor A", previsaoRecebimento: iso(10), status: "Em aprovação", observacoes: "" },
    // O-8 Bracell — 2 medições (em execução)
    { orcamentoId: "O-8", numero: "MED-001", data: iso(40), valor: 260_000, descricao: "Planejamento shutdown", previsaoRecebimento: iso(30), status: "Recebida", observacoes: "" },
    { orcamentoId: "O-8", numero: "MED-002", data: iso(12), valor: 240_000, descricao: "Execução parcial", previsaoRecebimento: iso(-5), status: "Lançada", observacoes: "" },
    // O-9 Usina Colorado — 100% executado (concluído)
    { orcamentoId: "O-9", numero: "MED-001", data: iso(55), valor: 480_000, descricao: "Rede tubulação", previsaoRecebimento: iso(45), status: "Recebida", observacoes: "" },
    { orcamentoId: "O-9", numero: "MED-002", data: iso(25), valor: 480_000, descricao: "Bombas e poços", previsaoRecebimento: iso(15), status: "Recebida", observacoes: "" },
    // O-12 Frigol — 100% concluído
    { orcamentoId: "O-12", numero: "MED-001", data: iso(90), valor: 410_000, descricao: "Reforma completa", previsaoRecebimento: iso(80), status: "Recebida", observacoes: "" },
    // O-15 Bracell — 1 medição inicial
    { orcamentoId: "O-15", numero: "MED-001", data: iso(50), valor: 400_000, descricao: "Terraplenagem", previsaoRecebimento: iso(40), status: "Recebida", observacoes: "" },
    // O-16, O-17, O-19, O-20, O-21, O-22 → sem medições (aguardando início ou já entregues sem medição registrada aqui — para variedade)
  ];
  return raw.map((m, i) => ({ ...m, id: `M-${i + 1}` }));
}

function load(): Medicao[] {
  if (typeof window === "undefined") return seed();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const s = seed();
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  return s;
}
function save() {
  if (typeof window !== "undefined") {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  }
}

let state: Medicao[] = load();
const listeners = new Set<() => void>();
function emit() { save(); listeners.forEach(l => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }

export function useMedicoes<T>(selector: (s: Medicao[]) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

function uid() { return `M-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`; }

export function proximoNumeroMedicao(orcamentoId: string): string {
  const nums = state
    .filter(m => m.orcamentoId === orcamentoId)
    .map(m => Number(m.numero.replace(/\D/g, "")))
    .filter(n => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `MED-${String(max + 1).padStart(3, "0")}`;
}

export const medicoesActions = {
  criar(input: Omit<Medicao, "id">) {
    state = [...state, { ...input, id: uid() }];
    emit();
  },
  atualizar(id: string, patch: Partial<Medicao>) {
    state = state.map(m => m.id === id ? { ...m, ...patch } : m);
    emit();
  },
  excluir(id: string) {
    state = state.filter(m => m.id !== id);
    emit();
  },
};

// ------------------------------------------------------------
// Helpers derivados
// ------------------------------------------------------------
export type ResumoOrcamento = {
  orcamento: Orcamento;
  faturado: number;
  saldo: number;
  pct: number;
  proximaMedicao?: string;
  statusExec: "Aguardando início" | "Em execução" | "Concluído";
};

export function resumoDoOrcamento(o: Orcamento, medicoes: Medicao[]): ResumoOrcamento {
  const meds = medicoes.filter(m => m.orcamentoId === o.id);
  const faturado = meds.reduce((a, m) => a + m.valor, 0);
  const saldo = Math.max(0, o.valor - faturado);
  const pct = o.valor > 0 ? Math.min(100, Math.round((faturado / o.valor) * 100)) : 0;
  const proximas = meds.filter(m => m.status !== "Recebida").sort((a, b) => a.previsaoRecebimento.localeCompare(b.previsaoRecebimento));
  const proximaMedicao = proximas[0]?.previsaoRecebimento;
  const statusExec: ResumoOrcamento["statusExec"] =
    faturado === 0 ? "Aguardando início" : pct >= 100 ? "Concluído" : "Em execução";
  return { orcamento: o, faturado, saldo, pct, proximaMedicao, statusExec };
}

export function useAprovadosResumo(): ResumoOrcamento[] {
  const orcamentos = useOrcamentos(s => s.filter(o => o.status === "Aprovado"));
  const medicoes = useMedicoes(s => s);
  return orcamentos.map(o => resumoDoOrcamento(o, medicoes));
}
