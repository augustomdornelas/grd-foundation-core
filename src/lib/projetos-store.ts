import { useSyncExternalStore } from "react";

export type ProjetoStatus = "Planejamento" | "Em andamento" | "Paralisado" | "Concluído";

export type Projeto = {
  id: string;
  nome: string;
  cliente: string;
  local: string;
  descricao: string;
  responsavel: string;
  dataInicio: string; // ISO
  prazo: string; // ISO
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

const KEY = "grd_projetos_store_v2";

function seed(): State {
  const projetos: Projeto[] = [
    { id: "P-001", nome: "Galpão Industrial Fase 2", cliente: "Vale Verde Logística", local: "Cubatão/SP", descricao: "Construção de galpão industrial de 12.000m² para expansão logística.", responsavel: "Eng. Rafael Prado", dataInicio: "2026-01-15", prazo: "2026-12-20", status: "Em andamento", progresso: 62, orcado: 4820000 },
    { id: "P-002", nome: "Ampliação Fábrica AutoTech", cliente: "AutoTech Indústria", local: "Sorocaba/SP", descricao: "Ampliação de linha de produção automotiva com nova nave de 4.800m².", responsavel: "Eng. Camila Rocha", dataInicio: "2026-02-10", prazo: "2026-11-30", status: "Em andamento", progresso: 78, orcado: 6950000 },
    { id: "P-003", nome: "Planta Fabril Sul", cliente: "Metalpar S.A.", local: "Joinville/SC", descricao: "Nova planta fabril com estrutura metálica e ponte rolante.", responsavel: "Eng. Bruno Almeida", dataInicio: "2026-03-05", prazo: "2027-04-30", status: "Planejamento", progresso: 8, orcado: 8420000 },
    { id: "P-004", nome: "Unidade de Armazenagem Norte", cliente: "LogBrás Transportes", local: "Anápolis/GO", descricao: "Centro de distribuição de 18.000m² com docas e pátio de manobras.", responsavel: "Eng. Rafael Prado", dataInicio: "2025-11-01", prazo: "2026-10-15", status: "Em andamento", progresso: 45, orcado: 5340000 },
    { id: "P-005", nome: "Retrofit Industrial Aurora", cliente: "Aurora Alimentos", local: "Chapecó/SC", descricao: "Modernização de planta frigorífica com troca de cobertura e piso industrial.", responsavel: "Eng. Camila Rocha", dataInicio: "2025-08-01", prazo: "2026-06-30", status: "Concluído", progresso: 100, orcado: 3420000 },
    { id: "P-006", nome: "Silos de Estocagem BR-Sul", cliente: "BR-Sul Agro", local: "Rondonópolis/MT", descricao: "Construção de bateria de 6 silos metálicos e casa de máquinas.", responsavel: "Eng. Bruno Almeida", dataInicio: "2026-04-10", prazo: "2026-12-10", status: "Paralisado", progresso: 22, orcado: 2180000 },
    { id: "P-007", nome: "Centro Logístico Águas Claras", cliente: "Grupo Águas Claras", local: "Extrema/MG", descricao: "Complexo logístico com 3 galpões e edifício administrativo.", responsavel: "Eng. Camila Rocha", dataInicio: "2026-05-01", prazo: "2027-06-30", status: "Em andamento", progresso: 18, orcado: 9720000 },
    { id: "P-008", nome: "Subestação Industrial AutoTech", cliente: "AutoTech Indústria", local: "Sorocaba/SP", descricao: "Nova subestação 138kV para atender expansão fabril.", responsavel: "Eng. Rafael Prado", dataInicio: "2026-06-01", prazo: "2026-12-01", status: "Planejamento", progresso: 3, orcado: 1720000 },
  ];

  const custos: Custo[] = [
    { id: "C-1", projetoId: "P-001", data: "2026-03-05", descricao: "Aço estrutural — lote 1", categoria: "Insumo", valor: 320000 },
    { id: "C-2", projetoId: "P-001", data: "2026-04-12", descricao: "Locação de guindaste", categoria: "Locação", valor: 85000 },
    { id: "C-3", projetoId: "P-002", data: "2026-03-20", descricao: "Equipe de montagem", categoria: "Mão de obra", valor: 210000 },
    { id: "C-4", projetoId: "P-004", data: "2026-02-15", descricao: "Terraplanagem", categoria: "Serviço", valor: 470000 },
  ];

  const notas: NotaFiscal[] = [
    { id: "N-1", projetoId: "P-001", numero: "NF 12345", fornecedor: "Aço Brasil Ltda", descricao: "Perfis metálicos", data: "2026-03-06", valor: 320000, status: "Pago" },
    { id: "N-2", projetoId: "P-001", numero: "NF 12346", fornecedor: "Guindastes SP", descricao: "Locação junho", data: "2026-04-12", valor: 85000, status: "Pendente" },
    { id: "N-3", projetoId: "P-002", numero: "NF 55221", fornecedor: "Construmax", descricao: "Concreto usinado", data: "2026-04-01", valor: 148000, status: "Pago" },
    { id: "N-4", projetoId: "P-004", numero: "NF 99871", fornecedor: "Terra & Cia", descricao: "Terraplanagem", data: "2026-02-18", valor: 470000, status: "Pago" },
  ];

  const medicoes: Medicao[] = [
    { id: "M-1", projetoId: "P-001", numero: 1, periodo: "Fev/2026", data: "2026-02-28", pct: 20, valor: 964000, status: "Aprovada" },
    { id: "M-2", projetoId: "P-001", numero: 2, periodo: "Abr/2026", data: "2026-04-30", pct: 45, valor: 1200000, status: "Aprovada" },
    { id: "M-3", projetoId: "P-001", numero: 3, periodo: "Jun/2026", data: "2026-06-30", pct: 62, valor: 820000, status: "Em análise" },
    { id: "M-4", projetoId: "P-002", numero: 1, periodo: "Mar/2026", data: "2026-03-31", pct: 30, valor: 2085000, status: "Aprovada" },
    { id: "M-5", projetoId: "P-002", numero: 2, periodo: "Mai/2026", data: "2026-05-31", pct: 78, valor: 3336000, status: "Aprovada" },
    { id: "M-6", projetoId: "P-004", numero: 1, periodo: "Jan/2026", data: "2026-01-31", pct: 22, valor: 1174000, status: "Aprovada" },
    { id: "M-7", projetoId: "P-004", numero: 2, periodo: "Abr/2026", data: "2026-04-30", pct: 45, valor: 1230000, status: "Aprovada" },
  ];

  return { projetos, custos, notas, medicoes };
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
    const id = input.id || `P-${Date.now().toString(36).slice(-4).toUpperCase()}`;
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
      custos: state.custos.filter(c => c.projetoId !== id),
      notas: state.notas.filter(n => n.projetoId !== id),
      medicoes: state.medicoes.filter(m => m.projetoId !== id),
    };
    emit();
  },
  adicionarCusto(c: Omit<Custo, "id">) {
    state = { ...state, custos: [...state.custos, { ...c, id: uid("C") }] };
    emit();
  },
  excluirCusto(id: string) {
    state = { ...state, custos: state.custos.filter(c => c.id !== id) };
    emit();
  },
  adicionarNota(n: Omit<NotaFiscal, "id">) {
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
