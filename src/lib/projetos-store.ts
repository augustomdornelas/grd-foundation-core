import { useSyncExternalStore } from "react";
import { projetos as seedProjetos } from "./mock-data";

export type Projeto = {
  id: string;
  nome: string;
  cliente: string;
  status: "Planejamento" | "Em andamento" | "Concluído" | "Pausado";
  progresso: number;
  orcado: number;
};

export type Nota = {
  id: string;
  projetoId: string;
  data: string; // ISO
  descricao: string;
  tipo: "Insumo" | "Serviço" | "Locação" | "Mão de obra" | "Outro";
  valor: number;
};

export type Medicao = {
  id: string;
  projetoId: string;
  data: string; // ISO
  periodo: string;
  pct: number;
  valor: number;
};

type State = {
  projetos: Projeto[];
  notas: Nota[];
  medicoes: Medicao[];
};

const KEY = "grd_projetos_store_v1";

const defaultOrcados: Record<string, number> = {
  "P-001": 4820000, "P-002": 2340000, "P-003": 1180000,
  "P-004": 6950000, "P-005": 3420000, "P-006": 720000,
};

function seed(): State {
  return {
    projetos: seedProjetos.map(p => ({
      id: p.id, nome: p.nome, cliente: p.cliente,
      status: p.status as Projeto["status"], progresso: p.progresso,
      orcado: defaultOrcados[p.id] ?? 1000000,
    })),
    notas: [],
    medicoes: [],
  };
}

let state: State = load();

function load(): State {
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

const listeners = new Set<() => void>();
function emit() { save(); listeners.forEach(l => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }

export function useProjetosStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export const projetosActions = {
  criarProjeto(input: Omit<Projeto, "id"> & { id?: string }) {
    const id = input.id || `P-${(state.projetos.length + 1).toString().padStart(3, "0")}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    state = { ...state, projetos: [...state.projetos, { ...input, id }] };
    emit();
    return id;
  },
  atualizarProjeto(id: string, patch: Partial<Projeto>) {
    state = { ...state, projetos: state.projetos.map(p => p.id === id ? { ...p, ...patch } : p) };
    emit();
  },
  excluirProjeto(id: string) {
    state = {
      projetos: state.projetos.filter(p => p.id !== id),
      notas: state.notas.filter(n => n.projetoId !== id),
      medicoes: state.medicoes.filter(m => m.projetoId !== id),
    };
    emit();
  },
  adicionarNota(n: Omit<Nota, "id">) {
    state = { ...state, notas: [...state.notas, { ...n, id: uid("N") }] };
    emit();
  },
  excluirNota(id: string) {
    state = { ...state, notas: state.notas.filter(n => n.id !== id) };
    emit();
  },
  adicionarMedicao(m: Omit<Medicao, "id">) {
    const nova = { ...m, id: uid("M") };
    state = { ...state, medicoes: [...state.medicoes, nova] };
    // auto atualiza progresso do projeto pro pct mais alto
    const proj = state.projetos.find(p => p.id === m.projetoId);
    if (proj && m.pct > proj.progresso) {
      state = { ...state, projetos: state.projetos.map(p => p.id === m.projetoId ? { ...p, progresso: m.pct } : p) };
    }
    emit();
  },
  excluirMedicao(id: string) {
    state = { ...state, medicoes: state.medicoes.filter(m => m.id !== id) };
    emit();
  },
};

export function resumoProjeto(id: string, s: State) {
  const notas = s.notas.filter(n => n.projetoId === id);
  const medicoes = s.medicoes.filter(m => m.projetoId === id);
  const gasto = notas.reduce((a, n) => a + n.valor, 0);
  const medido = medicoes.reduce((a, m) => a + m.valor, 0);
  const proj = s.projetos.find(p => p.id === id);
  const orcado = proj?.orcado ?? 0;
  const financeiro = orcado > 0 ? Math.min(100, Math.round((gasto / orcado) * 100)) : 0;
  return { notas, medicoes, gasto, medido, orcado, financeiro, saldo: orcado - gasto };
}
