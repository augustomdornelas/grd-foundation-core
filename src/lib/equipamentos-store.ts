import { useSyncExternalStore } from "react";

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

export type Manutencao = {
  id: string;
  equipamentoId: string;
  data: string;
  dataFim?: string;
  descricao: string;
  custo: number;
  aberta: boolean;
};

type State = {
  equipamentos: Equipamento[];
  emprestimos: Emprestimo[];
  manutencoes: Manutencao[];
};

const KEY = "grd_equipamentos_store_v1";

const DIA_MS = 24 * 60 * 60 * 1000;

export function periodos(inicio: string, fim: string, unidade: UnidadePeriodo): number {
  if (!inicio || !fim) return 0;
  const dias = Math.max(1, Math.ceil((new Date(fim).getTime() - new Date(inicio).getTime()) / DIA_MS));
  if (unidade === "dia") return dias;
  if (unidade === "semana") return Math.max(1, Math.ceil(dias / 7));
  return Math.max(1, Math.ceil(dias / 30));
}

function seed(): State {
  const equipamentos: Equipamento[] = [
    { id: "E-001", nome: "Betoneira 400L", codigo: "BET-001", categoria: "Concreto", descricao: "Betoneira elétrica 400L trifásica.", valor: 12500, custoPeriodo: 180, unidade: "dia", status: "Emprestado", localBase: "Almoxarifado Central – Cubatão", localAtual: "Obra Vale Verde – Cubatão/SP", responsavelAtual: "Carlos Ribeiro" },
    { id: "E-002", nome: "Gerador Diesel 60kVA", codigo: "GER-060", categoria: "Energia", descricao: "Grupo gerador silenciado 60kVA.", valor: 78000, custoPeriodo: 320, unidade: "dia", status: "Emprestado", localBase: "Pátio Sorocaba", localAtual: "Ampliação AutoTech – Sorocaba/SP", responsavelAtual: "Paulo Reis" },
    { id: "E-003", nome: "Compressor de Ar 15HP", codigo: "COM-015", categoria: "Pneumática", descricao: "Compressor parafuso 15HP, reservatório 500L.", valor: 34000, custoPeriodo: 210, unidade: "dia", status: "Disponível", localBase: "Almoxarifado Central – Cubatão", localAtual: "Almoxarifado Central – Cubatão" },
    { id: "E-004", nome: "Andaime Multidirecional (lote)", codigo: "AND-500", categoria: "Estrutura", descricao: "Kit 500m² andaime multidirecional.", valor: 48000, custoPeriodo: 3200, unidade: "mês", status: "Emprestado", localBase: "Pátio Cubatão", localAtual: "Centro Logístico Águas Claras – Extrema/MG", responsavelAtual: "Marta Lima" },
    { id: "E-005", nome: "Guindaste 25t", codigo: "GUI-025", categoria: "Içamento", descricao: "Guindaste hidráulico 25 toneladas.", valor: 320000, custoPeriodo: 1850, unidade: "dia", status: "Emprestado", localBase: "Pátio Sorocaba", localAtual: "Planta Fabril Sul – Joinville/SC", responsavelAtual: "João Costa" },
    { id: "E-006", nome: "Empilhadeira 2,5t", codigo: "EMP-025", categoria: "Movimentação", descricao: "Empilhadeira à combustão, capacidade 2500kg.", valor: 85000, custoPeriodo: 520, unidade: "dia", status: "Disponível", localBase: "Almoxarifado Central – Cubatão", localAtual: "Almoxarifado Central – Cubatão" },
    { id: "E-007", nome: "Máquina de Solda MIG 300A", codigo: "SLD-300", categoria: "Solda", descricao: "Solda MIG/MAG 300A trifásica.", valor: 9800, custoPeriodo: 95, unidade: "dia", status: "Disponível", localBase: "Almoxarifado Central – Cubatão", localAtual: "Almoxarifado Central – Cubatão" },
    { id: "E-008", nome: "Furadeira Industrial Radial", codigo: "FUR-RAD", categoria: "Usinagem", descricao: "Furadeira radial 40mm de capacidade.", valor: 28000, custoPeriodo: 140, unidade: "dia", status: "Manutenção", localBase: "Oficina Sorocaba", localAtual: "Oficina Sorocaba" },
    { id: "E-009", nome: "Bomba de Concreto Estacionária", codigo: "BMB-CON", categoria: "Concreto", descricao: "Bomba estacionária 40m³/h.", valor: 210000, custoPeriodo: 1200, unidade: "dia", status: "Emprestado", localBase: "Pátio Cubatão", localAtual: "Unidade de Armazenagem Norte – Anápolis/GO", responsavelAtual: "Roberta Alves" },
    { id: "E-010", nome: "Martelete Rompedor 30kg", codigo: "MAR-030", categoria: "Demolição", descricao: "Martelete pneumático 30kg.", valor: 6200, custoPeriodo: 65, unidade: "dia", status: "Disponível", localBase: "Almoxarifado Central – Cubatão", localAtual: "Almoxarifado Central – Cubatão" },
  ];

  const hoje = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  const emprestimos: Emprestimo[] = [
    // Ativos (equipamentos emprestados)
    { id: "L-001", equipamentoId: "E-001", destino: "Obra Vale Verde – Cubatão/SP", responsavel: "Carlos Ribeiro", dataInicio: iso(addDays(hoje, -20)), dataDevolucaoPrevista: iso(addDays(hoje, 10)), custoPeriodo: 180, unidade: "dia", custoTotal: 180 * 30, ativo: true },
    { id: "L-002", equipamentoId: "E-002", destino: "Ampliação AutoTech – Sorocaba/SP", responsavel: "Paulo Reis", dataInicio: iso(addDays(hoje, -45)), dataDevolucaoPrevista: iso(addDays(hoje, 15)), custoPeriodo: 320, unidade: "dia", custoTotal: 320 * 60, ativo: true },
    { id: "L-003", equipamentoId: "E-004", destino: "Centro Logístico Águas Claras – Extrema/MG", responsavel: "Marta Lima", dataInicio: iso(addDays(hoje, -60)), dataDevolucaoPrevista: iso(addDays(hoje, 30)), custoPeriodo: 3200, unidade: "mês", custoTotal: 3200 * 3, ativo: true },
    { id: "L-004", equipamentoId: "E-005", destino: "Planta Fabril Sul – Joinville/SC", responsavel: "João Costa", dataInicio: iso(addDays(hoje, -10)), dataDevolucaoPrevista: iso(addDays(hoje, 20)), custoPeriodo: 1850, unidade: "dia", custoTotal: 1850 * 30, ativo: true },
    { id: "L-005", equipamentoId: "E-009", destino: "Unidade de Armazenagem Norte – Anápolis/GO", responsavel: "Roberta Alves", dataInicio: iso(addDays(hoje, -35)), dataDevolucaoPrevista: iso(addDays(hoje, 25)), custoPeriodo: 1200, unidade: "dia", custoTotal: 1200 * 60, ativo: true },
    // Histórico encerrado
    { id: "L-006", equipamentoId: "E-003", destino: "Obra Aurora – Chapecó/SC", responsavel: "Ana Prado", dataInicio: iso(addDays(hoje, -120)), dataDevolucaoPrevista: iso(addDays(hoje, -95)), dataDevolucaoReal: iso(addDays(hoje, -93)), custoPeriodo: 210, unidade: "dia", custoTotal: 210 * 27, ativo: false },
    { id: "L-007", equipamentoId: "E-006", destino: "Silos BR-Sul – Rondonópolis/MT", responsavel: "Luiz Fernandes", dataInicio: iso(addDays(hoje, -80)), dataDevolucaoPrevista: iso(addDays(hoje, -50)), dataDevolucaoReal: iso(addDays(hoje, -48)), custoPeriodo: 520, unidade: "dia", custoTotal: 520 * 32, ativo: false },
    { id: "L-008", equipamentoId: "E-007", destino: "Retrofit Aurora – Chapecó/SC", responsavel: "Marcos Souza", dataInicio: iso(addDays(hoje, -180)), dataDevolucaoPrevista: iso(addDays(hoje, -160)), dataDevolucaoReal: iso(addDays(hoje, -158)), custoPeriodo: 95, unidade: "dia", custoTotal: 95 * 22, ativo: false },
    { id: "L-009", equipamentoId: "E-010", destino: "Subestação AutoTech – Sorocaba/SP", responsavel: "Carlos Ribeiro", dataInicio: iso(addDays(hoje, -70)), dataDevolucaoPrevista: iso(addDays(hoje, -55)), dataDevolucaoReal: iso(addDays(hoje, -54)), custoPeriodo: 65, unidade: "dia", custoTotal: 65 * 16, ativo: false },
  ];

  const manutencoes: Manutencao[] = [
    { id: "MN-001", equipamentoId: "E-008", data: iso(addDays(hoje, -8)), descricao: "Troca do motor e regulagem do braço radial.", custo: 4200, aberta: true },
    { id: "MN-002", equipamentoId: "E-002", data: iso(addDays(hoje, -160)), dataFim: iso(addDays(hoje, -155)), descricao: "Revisão preventiva 500h.", custo: 1850, aberta: false },
    { id: "MN-003", equipamentoId: "E-005", data: iso(addDays(hoje, -220)), dataFim: iso(addDays(hoje, -212)), descricao: "Substituição de cabos e teste de carga.", custo: 8600, aberta: false },
  ];

  return { equipamentos, emprestimos, manutencoes };
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

export function useEquipStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state), () => sel(state));
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export const equipActions = {
  criarEquipamento(input: Omit<Equipamento, "id"> & { id?: string }) {
    const id = input.id || uid("E");
    state = { ...state, equipamentos: [...state.equipamentos, { ...input, id }] };
    emit();
    return id;
  },
  atualizarEquipamento(id: string, patch: Partial<Equipamento>) {
    state = { ...state, equipamentos: state.equipamentos.map(e => e.id === id ? { ...e, ...patch } : e) };
    emit();
  },
  excluirEquipamento(id: string) {
    state = {
      equipamentos: state.equipamentos.filter(e => e.id !== id),
      emprestimos: state.emprestimos.filter(e => e.equipamentoId !== id),
      manutencoes: state.manutencoes.filter(m => m.equipamentoId !== id),
    };
    emit();
  },
  registrarEmprestimo(input: Omit<Emprestimo, "id" | "custoTotal" | "ativo"> & { equipamentoId: string }) {
    const eq = state.equipamentos.find(e => e.id === input.equipamentoId);
    if (!eq) return;
    const p = periodos(input.dataInicio, input.dataDevolucaoPrevista, input.unidade);
    const emp: Emprestimo = { ...input, id: uid("L"), custoTotal: p * input.custoPeriodo, ativo: true };
    state = {
      ...state,
      emprestimos: [...state.emprestimos, emp],
      equipamentos: state.equipamentos.map(e => e.id === eq.id ? { ...e, status: "Emprestado", localAtual: input.destino, responsavelAtual: input.responsavel } : e),
    };
    emit();
  },
  registrarDevolucao(emprestimoId: string, dataReal: string) {
    const emp = state.emprestimos.find(e => e.id === emprestimoId);
    if (!emp) return;
    const p = periodos(emp.dataInicio, dataReal, emp.unidade);
    const custoTotal = p * emp.custoPeriodo;
    state = {
      ...state,
      emprestimos: state.emprestimos.map(e => e.id === emprestimoId ? { ...e, dataDevolucaoReal: dataReal, custoTotal, ativo: false } : e),
      equipamentos: state.equipamentos.map(e => {
        if (e.id !== emp.equipamentoId) return e;
        return { ...e, status: "Disponível", localAtual: e.localBase, responsavelAtual: undefined };
      }),
    };
    emit();
  },
  registrarManutencao(input: Omit<Manutencao, "id" | "aberta">) {
    const m: Manutencao = { ...input, id: uid("MN"), aberta: !input.dataFim };
    state = {
      ...state,
      manutencoes: [...state.manutencoes, m],
      equipamentos: m.aberta
        ? state.equipamentos.map(e => e.id === m.equipamentoId ? { ...e, status: "Manutenção" } : e)
        : state.equipamentos,
    };
    emit();
  },
  encerrarManutencao(manutencaoId: string, dataFim: string) {
    const m = state.manutencoes.find(x => x.id === manutencaoId);
    if (!m) return;
    state = {
      ...state,
      manutencoes: state.manutencoes.map(x => x.id === manutencaoId ? { ...x, dataFim, aberta: false } : x),
      equipamentos: state.equipamentos.map(e => e.id === m.equipamentoId ? { ...e, status: "Disponível", localAtual: e.localBase } : e),
    };
    emit();
  },
};

export function custoAtivoTotal(s: State) {
  return s.emprestimos.filter(e => e.ativo).reduce((a, e) => a + e.custoTotal, 0);
}
