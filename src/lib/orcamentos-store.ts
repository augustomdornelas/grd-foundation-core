// ============================================================
// Store de Orçamentos (Comercial)
// ------------------------------------------------------------
// Fonte única de verdade dos orçamentos. Compartilhada entre o
// módulo Comercial (/app/comercial) e o painel inicial (/app).
// Persistência em localStorage. Preparado para migrar para
// Supabase: basta trocar load/save por queries e substituir os
// actions por chamadas ao banco — os componentes que consomem
// via useOrcamentosStore não precisam mudar.
// ============================================================
import { useMemo, useSyncExternalStore } from "react";

export type OrcStatus =
  | "Aprovado"
  | "Em análise"
  | "Aguardando retorno"
  | "Recusado"
  | "Cancelado";

export type TipoServico =
  | "Engenharia e Construção"
  | "Gerenciamento"
  | "Reformas Industriais"
  | "Sistemas de Esgoto"
  | "Frezamento";

export type EstagioFunil =
  | "Prospectado"
  | "Proposta enviada"
  | "Em negociação"
  | "Aprovado"
  | "Contrato assinado";

export type TimelineEvento = {
  data: string; // ISO
  de: OrcStatus | "—";
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
  data: string; // emissão (ISO)
  validade: string; // ISO
  status: OrcStatus;
  estagio: EstagioFunil;
  probabilidade: number; // 0-100
  observacoes: string;
  anexo?: string;
  timeline: TimelineEvento[];
  notas: Nota[];
};

export const TIPOS_SERVICO: TipoServico[] = [
  "Engenharia e Construção",
  "Gerenciamento",
  "Reformas Industriais",
  "Sistemas de Esgoto",
  "Frezamento",
];

export const STATUS_LIST: OrcStatus[] = [
  "Aprovado",
  "Em análise",
  "Aguardando retorno",
  "Recusado",
  "Cancelado",
];

export const ESTAGIO_LIST: EstagioFunil[] = [
  "Prospectado",
  "Proposta enviada",
  "Em negociação",
  "Aprovado",
  "Contrato assinado",
];

export const RESPONSAVEIS = [
  "Carlos Menezes",
  "Fernanda Braga",
  "Rodrigo Alves",
  "Patrícia Lima",
];

export const STATUS_COLORS: Record<OrcStatus, string> = {
  "Aprovado": "#16A34A",
  "Em análise": "#213368",
  "Aguardando retorno": "#F59E0B",
  "Recusado": "#DC2626",
  "Cancelado": "#94A3B8",
};

// -----------------------------------------------------------
// Seed — 22 orçamentos realistas (obras industriais)
// -----------------------------------------------------------
const KEY = "grd_orcamentos_store_v1";

function iso(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function seed(): Orcamento[] {
  type Raw = Omit<Orcamento, "timeline" | "notas" | "validade"> & { validadeDias?: number };
  const raw: Raw[] = [
    { id: "O-1", numero: "ORC-2501", cliente: "Bracell", cnpj: "13.456.789/0001-10", tipo: "Engenharia e Construção", obra: "Ampliação linha celulose Fase 3", descricao: "Obras civis para nova linha de produção.", valor: 2_380_000, responsavel: "Carlos Menezes", data: iso(9), status: "Aprovado", estagio: "Contrato assinado", probabilidade: 100, observacoes: "Contrato em vigor." },
    { id: "O-2", numero: "ORC-2502", cliente: "Frigol", cnpj: "45.678.912/0001-22", tipo: "Reformas Industriais", obra: "Reforma câmara fria unidade Lençóis", descricao: "Substituição de painéis e piso técnico.", valor: 890_000, responsavel: "Fernanda Braga", data: iso(15), status: "Em análise", estagio: "Em negociação", probabilidade: 70, observacoes: "" },
    { id: "O-3", numero: "ORC-2503", cliente: "Mondelli", cnpj: "22.345.678/0001-33", tipo: "Gerenciamento", obra: "Gerenciamento obra expansão Bauru", descricao: "Gestão de contratos e cronograma.", valor: 620_000, responsavel: "Rodrigo Alves", data: iso(22), status: "Aprovado", estagio: "Contrato assinado", probabilidade: 100, observacoes: "" },
    { id: "O-4", numero: "ORC-2504", cliente: "Duratex", cnpj: "60.876.541/0001-19", tipo: "Sistemas de Esgoto", obra: "ETE industrial Itapetininga", descricao: "Projeto e execução de ETE.", valor: 1_720_000, responsavel: "Patrícia Lima", data: iso(30), status: "Aguardando retorno", estagio: "Proposta enviada", probabilidade: 55, observacoes: "Cliente avaliando junto ao jurídico." },
    { id: "O-5", numero: "ORC-2505", cliente: "Dexco", cnpj: "97.837.181/0001-45", tipo: "Frezamento", obra: "Frezamento pátio industrial", descricao: "Recuperação de pavimento asfáltico.", valor: 340_000, responsavel: "Carlos Menezes", data: iso(38), status: "Aprovado", estagio: "Contrato assinado", probabilidade: 100, observacoes: "" },
    { id: "O-6", numero: "ORC-2506", cliente: "Usina Santa Adélia", cnpj: "10.223.445/0001-88", tipo: "Engenharia e Construção", obra: "Nova moenda — obra civil", descricao: "Fundações e estrutura.", valor: 2_150_000, responsavel: "Fernanda Braga", data: iso(45), status: "Em análise", estagio: "Em negociação", probabilidade: 65, observacoes: "" },
    { id: "O-7", numero: "ORC-2507", cliente: "Frigorífico Astra", cnpj: "78.556.322/0001-71", tipo: "Reformas Industriais", obra: "Modernização área de abate", descricao: "Substituição de estruturas metálicas.", valor: 1_180_000, responsavel: "Rodrigo Alves", data: iso(55), status: "Recusado", estagio: "Proposta enviada", probabilidade: 0, observacoes: "Recusado por preço." },
    { id: "O-8", numero: "ORC-2508", cliente: "Bracell", cnpj: "13.456.789/0001-10", tipo: "Gerenciamento", obra: "Gerenciamento shutdown 2026", descricao: "Coordenação de parada programada.", valor: 780_000, responsavel: "Patrícia Lima", data: iso(62), status: "Aprovado", estagio: "Contrato assinado", probabilidade: 100, observacoes: "" },
    { id: "O-9", numero: "ORC-2509", cliente: "Usina Colorado", cnpj: "34.556.778/0001-52", tipo: "Sistemas de Esgoto", obra: "Rede de efluentes industrial", descricao: "Tubulação, poços de visita e bombas.", valor: 960_000, responsavel: "Carlos Menezes", data: iso(70), status: "Aprovado", estagio: "Contrato assinado", probabilidade: 100, observacoes: "" },
    { id: "O-10", numero: "ORC-2510", cliente: "Cocamar", cnpj: "56.778.990/0001-64", tipo: "Engenharia e Construção", obra: "Silo horizontal — unidade Maringá", descricao: "Fundação e superestrutura.", valor: 2_490_000, responsavel: "Fernanda Braga", data: iso(80), status: "Aguardando retorno", estagio: "Em negociação", probabilidade: 60, observacoes: "" },
    { id: "O-11", numero: "ORC-2511", cliente: "Mondelli", cnpj: "22.345.678/0001-33", tipo: "Frezamento", obra: "Frezamento acesso caminhões", descricao: "Fresagem e nova capa asfáltica.", valor: 220_000, responsavel: "Rodrigo Alves", data: iso(95), status: "Aprovado", estagio: "Contrato assinado", probabilidade: 100, observacoes: "" },
    { id: "O-12", numero: "ORC-2512", cliente: "Frigol", cnpj: "45.678.912/0001-22", tipo: "Reformas Industriais", obra: "Reforma vestiários e refeitório", descricao: "Reforma predial.", valor: 410_000, responsavel: "Patrícia Lima", data: iso(110), status: "Aprovado", estagio: "Contrato assinado", probabilidade: 100, observacoes: "" },
    { id: "O-13", numero: "ORC-2513", cliente: "Duratex", cnpj: "60.876.541/0001-19", tipo: "Gerenciamento", obra: "Gerenciamento ampliação Agudos", descricao: "Contratos, medições e cronograma.", valor: 540_000, responsavel: "Carlos Menezes", data: iso(125), status: "Em análise", estagio: "Proposta enviada", probabilidade: 50, observacoes: "" },
    { id: "O-14", numero: "ORC-2514", cliente: "Usina Santa Adélia", cnpj: "10.223.445/0001-88", tipo: "Sistemas de Esgoto", obra: "Estação elevatória efluentes", descricao: "Instalação de estação elevatória.", valor: 680_000, responsavel: "Fernanda Braga", data: iso(140), status: "Cancelado", estagio: "Prospectado", probabilidade: 0, observacoes: "Cliente adiou projeto." },
    { id: "O-15", numero: "ORC-2515", cliente: "Bracell", cnpj: "13.456.789/0001-10", tipo: "Engenharia e Construção", obra: "Nova subestação elétrica", descricao: "Civil e drenagem.", valor: 1_890_000, responsavel: "Rodrigo Alves", data: iso(160), status: "Aprovado", estagio: "Contrato assinado", probabilidade: 100, observacoes: "" },
    { id: "O-16", numero: "ORC-2516", cliente: "Usina Colorado", cnpj: "34.556.778/0001-52", tipo: "Reformas Industriais", obra: "Reforma cobertura armazém", descricao: "Substituição de telhas e calhas.", valor: 320_000, responsavel: "Patrícia Lima", data: iso(180), status: "Aprovado", estagio: "Contrato assinado", probabilidade: 100, observacoes: "" },
    { id: "O-17", numero: "ORC-2517", cliente: "Cocamar", cnpj: "56.778.990/0001-64", tipo: "Frezamento", obra: "Frezamento vias internas", descricao: "Recuperação de 8.500 m² de pavimento.", valor: 480_000, responsavel: "Carlos Menezes", data: iso(200), status: "Aprovado", estagio: "Contrato assinado", probabilidade: 100, observacoes: "" },
    { id: "O-18", numero: "ORC-2518", cliente: "Mondelli", cnpj: "22.345.678/0001-33", tipo: "Engenharia e Construção", obra: "Ampliação centro de distribuição", descricao: "Obra civil galpão 6.000 m².", valor: 2_100_000, responsavel: "Fernanda Braga", data: iso(220), status: "Recusado", estagio: "Em negociação", probabilidade: 0, observacoes: "" },
    { id: "O-19", numero: "ORC-2519", cliente: "Frigorífico Astra", cnpj: "78.556.322/0001-71", tipo: "Sistemas de Esgoto", obra: "Reforma ETE Fase 1", descricao: "Adequação de decantadores.", valor: 750_000, responsavel: "Rodrigo Alves", data: iso(245), status: "Aprovado", estagio: "Contrato assinado", probabilidade: 100, observacoes: "" },
    { id: "O-20", numero: "ORC-2520", cliente: "Duratex", cnpj: "60.876.541/0001-19", tipo: "Reformas Industriais", obra: "Reforma linha 4 pintura", descricao: "Instalação hidráulica e elétrica.", valor: 890_000, responsavel: "Patrícia Lima", data: iso(270), status: "Aprovado", estagio: "Contrato assinado", probabilidade: 100, observacoes: "" },
    { id: "O-21", numero: "ORC-2521", cliente: "Usina Santa Adélia", cnpj: "10.223.445/0001-88", tipo: "Gerenciamento", obra: "Gerenciamento entressafra", descricao: "Coordenação de reformas industriais.", valor: 430_000, responsavel: "Carlos Menezes", data: iso(300), status: "Aprovado", estagio: "Contrato assinado", probabilidade: 100, observacoes: "" },
    { id: "O-22", numero: "ORC-2522", cliente: "Bracell", cnpj: "13.456.789/0001-10", tipo: "Frezamento", obra: "Frezamento pátio de carga", descricao: "Frezamento e recomposição.", valor: 380_000, responsavel: "Fernanda Braga", data: iso(340), status: "Aprovado", estagio: "Contrato assinado", probabilidade: 100, observacoes: "" },
  ];
  return raw.map<Orcamento>(r => ({
    ...r,
    validade: iso(-30 + Math.floor(Math.random() * -1)),
    timeline: [
      { data: r.data + "T09:00:00.000Z", de: "—", para: "Em análise", autor: r.responsavel },
      { data: new Date().toISOString(), de: "Em análise", para: r.status, autor: r.responsavel },
    ],
    notas: [],
  }));
}

// -----------------------------------------------------------
// Store (padrão useSyncExternalStore + localStorage)
// -----------------------------------------------------------
function load(): Orcamento[] {
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

let state: Orcamento[] = load();
const listeners = new Set<() => void>();
function emit() { save(); listeners.forEach(l => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }

const SSR_EMPTY: Orcamento[] = Object.freeze([]) as unknown as Orcamento[];
const getSnapshot = () => state;
const getServerSnapshot = () => SSR_EMPTY;

export function useOrcamentos<T>(selector: (s: Orcamento[]) => T): T {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => selector(snap), [snap, selector]);
}

function uid() { return `O-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`; }

function proximoNumero(): string {
  const nums = state
    .map(o => Number(o.numero.replace(/\D/g, "")))
    .filter(n => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 2500;
  return `ORC-${max + 1}`;
}

export const orcamentosActions = {
  proximoNumero,
  criar(input: Omit<Orcamento, "id" | "numero" | "timeline" | "notas"> & { numero?: string }) {
    const numero = input.numero || proximoNumero();
    const novo: Orcamento = {
      ...input,
      id: uid(),
      numero,
      timeline: [{ data: new Date().toISOString(), de: "—", para: input.status, autor: input.responsavel }],
      notas: [],
    };
    state = [novo, ...state];
    emit();
    return novo.id;
  },
  atualizar(id: string, patch: Partial<Orcamento>) {
    state = state.map(o => {
      if (o.id !== id) return o;
      const atualizado = { ...o, ...patch };
      if (patch.status && patch.status !== o.status) {
        atualizado.timeline = [
          ...o.timeline,
          { data: new Date().toISOString(), de: o.status, para: patch.status, autor: patch.responsavel ?? o.responsavel },
        ];
      }
      return atualizado;
    });
    emit();
  },
  duplicar(id: string) {
    const orig = state.find(o => o.id === id);
    if (!orig) return;
    const novo: Orcamento = {
      ...orig,
      id: uid(),
      numero: proximoNumero(),
      data: new Date().toISOString().slice(0, 10),
      status: "Em análise",
      estagio: "Proposta enviada",
      timeline: [{ data: new Date().toISOString(), de: "—", para: "Em análise", autor: orig.responsavel }],
      notas: [],
    };
    state = [novo, ...state];
    emit();
  },
  excluir(id: string) {
    state = state.filter(o => o.id !== id);
    emit();
  },
  adicionarNota(id: string, autor: string, texto: string) {
    state = state.map(o => o.id === id ? {
      ...o,
      notas: [...o.notas, { id: uid(), data: new Date().toISOString(), autor, texto }],
    } : o);
    emit();
  },
};

// Helpers de período compartilhados (usados em /app também)
export type PeriodoTipo = "mes" | "trimestre" | "ano" | "custom";
export type Periodo = { tipo: PeriodoTipo; ini?: string; fim?: string };

export function rangeDoPeriodo(p: Periodo): { ini: Date; fim: Date } {
  const hoje = new Date();
  if (p.tipo === "custom" && p.ini && p.fim) {
    return { ini: new Date(p.ini), fim: new Date(p.fim + "T23:59:59") };
  }
  if (p.tipo === "mes") return { ini: new Date(hoje.getFullYear(), hoje.getMonth(), 1), fim: hoje };
  if (p.tipo === "trimestre") return { ini: new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1), fim: hoje };
  return { ini: new Date(hoje.getFullYear(), 0, 1), fim: hoje };
}

export function rangeAnterior(p: Periodo): { ini: Date; fim: Date } {
  const cur = rangeDoPeriodo(p);
  const durMs = cur.fim.getTime() - cur.ini.getTime();
  return { ini: new Date(cur.ini.getTime() - durMs), fim: new Date(cur.ini.getTime() - 1) };
}

export function dentro(dataISO: string, r: { ini: Date; fim: Date }) {
  const d = new Date(dataISO);
  return d >= r.ini && d <= r.fim;
}
