// ============================================================
// Store de EPIs — integração real com Supabase
// ------------------------------------------------------------
// Cobre: funcionários, catálogo de EPIs, entregas (termos) e os
// itens de cada entrega (com data de entrega e validade calculada).
// Segue o padrão dos demais stores do portal: estado em módulo,
// subscribe/emit, hook useEpiStore com equality shallow e escrita
// otimista no Supabase.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { upperizePayload } from "@/lib/utils";

function toastErr(msg: string, err: { message?: string } | null | undefined) {
  if (err) toast.error(`${msg}: ${err.message ?? "erro desconhecido"}`);
}

// ---------- Tipos ----------
export type Funcionario = {
  id: string;
  nome: string;
  cpf: string;
  rg: string;
  cargo: string;
  setor: string;
  matricula: string;
  dataAdmissao?: string;
  ativo: boolean;
  observacoes: string;
};

export type Epi = {
  id: string;
  nome: string;
  ca: string;
  categoria: string;
  descricao: string;
  fabricante: string;
  validadeDias: number;
  caValidade?: string;
  estoque: number;
  unidade: string;
  fotoUrl?: string;
  ativo: boolean;
};

export type MotivoEntrega =
  | "PRIMEIRA ENTREGA"
  | "TROCA"
  | "DANIFICADO"
  | "PERDA"
  | "VENCIMENTO";

export const MOTIVOS_ENTREGA: MotivoEntrega[] = [
  "PRIMEIRA ENTREGA",
  "TROCA",
  "DANIFICADO",
  "PERDA",
  "VENCIMENTO",
];

export type EntregaItem = {
  id: string;
  entregaId: string;
  epiId?: string;
  epiNome: string;
  ca: string;
  quantidade: number;
  motivo: MotivoEntrega;
  dataEntrega: string;
  dataValidade?: string;
};

export type EntregaStatus = "PENDENTE" | "ASSINADO";

export type Entrega = {
  id: string;
  funcionarioId: string;
  numeroTermo: string;
  dataEntrega: string;
  responsavelEntrega: string;
  responsavelCargo: string;
  status: EntregaStatus;
  assinado: boolean;
  dataAssinatura?: string;
  observacoes: string;
};

type State = {
  funcionarios: Funcionario[];
  epis: Epi[];
  entregas: Entrega[];
  itens: EntregaItem[];
};

const SSR: State = { funcionarios: [], epis: [], entregas: [], itens: [] };
let state: State = SSR;
const listeners = new Set<() => void>();
function emit() { listeners.forEach(l => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

// ---------- Utilidades de data ----------
const DIA_MS = 24 * 60 * 60 * 1000;

/** Soma `dias` a uma data ISO (yyyy-mm-dd) e devolve outra data ISO. */
export function somaDias(iso: string, dias: number): string {
  if (!iso || !dias) return "";
  const base = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const d = new Date(base.getTime() + dias * DIA_MS);
  return d.toISOString().slice(0, 10);
}

/** Dias restantes até a validade (negativo = vencido). */
export function diasParaVencer(dataValidade?: string): number | null {
  if (!dataValidade) return null;
  const hoje = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime();
  const val = new Date(`${dataValidade.slice(0, 10)}T00:00:00`).getTime();
  return Math.round((val - hoje) / DIA_MS);
}

// ---------- Mapeamento (linha do banco -> objeto) ----------
function mapFuncionario(r: any): Funcionario {
  return {
    id: r.id,
    nome: r.nome ?? "",
    cpf: r.cpf ?? "",
    rg: r.rg ?? "",
    cargo: r.cargo ?? "",
    setor: r.setor ?? "",
    matricula: r.matricula ?? "",
    dataAdmissao: r.data_admissao ?? undefined,
    ativo: r.ativo ?? true,
    observacoes: r.observacoes ?? "",
  };
}
function mapEpi(r: any): Epi {
  return {
    id: r.id,
    nome: r.nome ?? "",
    ca: r.ca ?? "",
    categoria: r.categoria ?? "",
    descricao: r.descricao ?? "",
    fabricante: r.fabricante ?? "",
    validadeDias: Number(r.validade_dias ?? 0) || 0,
    caValidade: r.ca_validade ?? undefined,
    estoque: Number(r.estoque ?? 0) || 0,
    unidade: r.unidade ?? "un",
    fotoUrl: r.foto_url ?? undefined,
    ativo: r.ativo ?? true,
  };
}
function mapEntrega(r: any): Entrega {
  return {
    id: r.id,
    funcionarioId: r.funcionario_id ?? "",
    numeroTermo: r.numero_termo ?? "",
    dataEntrega: r.data_entrega ?? "",
    responsavelEntrega: r.responsavel_entrega ?? "",
    responsavelCargo: r.responsavel_cargo ?? "",
    status: (r.status ?? "PENDENTE") as EntregaStatus,
    assinado: r.assinado ?? false,
    dataAssinatura: r.data_assinatura ?? undefined,
    observacoes: r.observacoes ?? "",
  };
}
function mapItem(r: any): EntregaItem {
  return {
    id: r.id,
    entregaId: r.entrega_id ?? "",
    epiId: r.epi_id ?? undefined,
    epiNome: r.epi_nome ?? "",
    ca: r.ca ?? "",
    quantidade: Number(r.quantidade ?? 1) || 1,
    motivo: (r.motivo ?? "PRIMEIRA ENTREGA") as MotivoEntrega,
    dataEntrega: r.data_entrega ?? "",
    dataValidade: r.data_validade ?? undefined,
  };
}

async function fetchAll() {
  try {
    const [fun, epi, ent, itn] = await Promise.all([
      supabase.from("funcionarios").select("*").order("nome", { ascending: true }),
      supabase.from("epis").select("*").order("nome", { ascending: true }),
      supabase.from("entregas_epi").select("*").order("data_entrega", { ascending: false }),
      supabase.from("entrega_epi_itens").select("*").order("created_at", { ascending: true }),
    ]);
    toastErr("Falha ao carregar funcionários", fun.error);
    toastErr("Falha ao carregar EPIs", epi.error);
    toastErr("Falha ao carregar entregas", ent.error);
    toastErr("Falha ao carregar itens de entrega", itn.error);
    state = {
      funcionarios: (fun.data ?? []).map(mapFuncionario),
      epis: (epi.data ?? []).map(mapEpi),
      entregas: (ent.data ?? []).map(mapEntrega),
      itens: (itn.data ?? []).map(mapItem),
    };
    emit();
  } catch (err) {
    console.error("[epis-store] fetchAll error:", err);
    emit();
  }
}

if (typeof window !== "undefined") void fetchAll();

export async function refetchEpis() {
  await fetchAll();
}

// ---------- Hook com equality shallow ----------
function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
    return true;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object); const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!Object.is((a as any)[k], (b as any)[k])) return false;
    return true;
  }
  return false;
}

export function useEpiStore<T>(selector: (s: State) => T): T {
  const selRef = useRef(selector);
  selRef.current = selector;
  const [value, setValue] = useState<T>(() => selector(state));
  useEffect(() => {
    const check = () => {
      const next = selRef.current(state);
      setValue(prev => shallowEqual(prev, next) ? prev : next);
    };
    check();
    return subscribe(check);
  }, []);
  return value;
}

// ---------- Helpers ----------
export function itensDaEntrega(s: State, entregaId: string): EntregaItem[] {
  return s.itens.filter(i => i.entregaId === entregaId);
}

export function nomeFuncionario(s: State, id: string): string {
  return s.funcionarios.find(f => f.id === id)?.nome ?? "—";
}

function proximoNumeroTermo(): string {
  const ano = new Date().getFullYear();
  const doAno = state.entregas.filter(e => (e.numeroTermo || "").includes(`EPI-${ano}-`)).length;
  return `EPI-${ano}-${String(doAno + 1).padStart(4, "0")}`;
}

export type NovaEntregaInput = {
  funcionarioId: string;
  dataEntrega: string;
  responsavelEntrega: string;
  responsavelCargo?: string;
  observacoes?: string;
  itens: { epiId: string; quantidade: number; motivo: MotivoEntrega }[];
};

export type EntregaSalva = {
  entrega: Entrega;
  funcionario?: Funcionario;
  itens: EntregaItem[];
};

// ---------- Actions ----------
export const epiActions = {
  // ----- Funcionários -----
  async criarFuncionario(input: Omit<Funcionario, "id">): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from("funcionarios")
        .insert(upperizePayload({
          nome: input.nome,
          cpf: input.cpf ?? "",
          rg: input.rg ?? "",
          cargo: input.cargo ?? "",
          setor: input.setor ?? "",
          matricula: input.matricula ?? "",
          data_admissao: input.dataAdmissao || null,
          ativo: input.ativo,
          observacoes: input.observacoes ?? "",
        }) as any)
        .select("*")
        .single();
      if (error) { toast.error(`Erro ao salvar funcionário: ${error.message}`); return null; }
      await fetchAll();
      return data?.id ?? null;
    } catch (err) {
      toast.error(`Erro ao salvar funcionário: ${err instanceof Error ? err.message : "desconhecido"}`);
      return null;
    }
  },
  async atualizarFuncionario(id: string, patch: Partial<Funcionario>) {
    state = { ...state, funcionarios: state.funcionarios.map(f => f.id === id ? { ...f, ...patch } : f) };
    emit();
    const row: Record<string, unknown> = {};
    if (patch.nome !== undefined) row.nome = patch.nome;
    if (patch.cpf !== undefined) row.cpf = patch.cpf;
    if (patch.rg !== undefined) row.rg = patch.rg;
    if (patch.cargo !== undefined) row.cargo = patch.cargo;
    if (patch.setor !== undefined) row.setor = patch.setor;
    if (patch.matricula !== undefined) row.matricula = patch.matricula;
    if (patch.dataAdmissao !== undefined) row.data_admissao = patch.dataAdmissao || null;
    if (patch.ativo !== undefined) row.ativo = patch.ativo;
    if (patch.observacoes !== undefined) row.observacoes = patch.observacoes;
    const { error } = await supabase.from("funcionarios").update(upperizePayload(row)).eq("id", id);
    toastErr("Erro ao salvar no banco", error);
  },
  async excluirFuncionario(id: string) {
    state = { ...state, funcionarios: state.funcionarios.filter(f => f.id !== id) };
    emit();
    const { error } = await supabase.from("funcionarios").delete().eq("id", id);
    toastErr("Erro ao excluir funcionário", error);
    await fetchAll();
  },

  // ----- EPIs (catálogo) -----
  async criarEpi(input: Omit<Epi, "id">): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from("epis")
        .insert(upperizePayload({
          nome: input.nome,
          ca: input.ca ?? "",
          categoria: input.categoria ?? "",
          descricao: input.descricao ?? "",
          fabricante: input.fabricante ?? "",
          validade_dias: input.validadeDias ?? 0,
          ca_validade: input.caValidade || null,
          estoque: input.estoque ?? 0,
          unidade: input.unidade ?? "un",
          foto_url: input.fotoUrl ?? null,
          ativo: input.ativo,
        }) as any)
        .select("*")
        .single();
      if (error) { toast.error(`Erro ao salvar EPI: ${error.message}`); return null; }
      await fetchAll();
      return data?.id ?? null;
    } catch (err) {
      toast.error(`Erro ao salvar EPI: ${err instanceof Error ? err.message : "desconhecido"}`);
      return null;
    }
  },
  async atualizarEpi(id: string, patch: Partial<Epi>) {
    state = { ...state, epis: state.epis.map(e => e.id === id ? { ...e, ...patch } : e) };
    emit();
    const row: Record<string, unknown> = {};
    if (patch.nome !== undefined) row.nome = patch.nome;
    if (patch.ca !== undefined) row.ca = patch.ca;
    if (patch.categoria !== undefined) row.categoria = patch.categoria;
    if (patch.descricao !== undefined) row.descricao = patch.descricao;
    if (patch.fabricante !== undefined) row.fabricante = patch.fabricante;
    if (patch.validadeDias !== undefined) row.validade_dias = patch.validadeDias;
    if (patch.caValidade !== undefined) row.ca_validade = patch.caValidade || null;
    if (patch.estoque !== undefined) row.estoque = patch.estoque;
    if (patch.unidade !== undefined) row.unidade = patch.unidade;
    if (patch.fotoUrl !== undefined) row.foto_url = patch.fotoUrl;
    if (patch.ativo !== undefined) row.ativo = patch.ativo;
    const { error } = await supabase.from("epis").update(upperizePayload(row)).eq("id", id);
    toastErr("Erro ao salvar no banco", error);
  },
  async excluirEpi(id: string) {
    state = { ...state, epis: state.epis.filter(e => e.id !== id) };
    emit();
    const { error } = await supabase.from("epis").delete().eq("id", id);
    toastErr("Erro ao excluir EPI", error);
    await fetchAll();
  },

  // ----- Entregas (termo) -----
  async registrarEntrega(input: NovaEntregaInput): Promise<EntregaSalva | null> {
    if (!input.funcionarioId) { toast.error("Selecione o funcionário"); return null; }
    if (!input.itens.length) { toast.error("Adicione ao menos um EPI"); return null; }

    const numeroTermo = proximoNumeroTermo();
    try {
      const { data: entRow, error: entErr } = await supabase
        .from("entregas_epi")
        .insert(upperizePayload({
          funcionario_id: input.funcionarioId,
          numero_termo: numeroTermo,
          data_entrega: input.dataEntrega,
          responsavel_entrega: input.responsavelEntrega ?? "",
          responsavel_cargo: input.responsavelCargo ?? "",
          status: "PENDENTE",
          assinado: false,
          observacoes: input.observacoes ?? "",
        }) as any)
        .select("*")
        .single();
      if (entErr || !entRow) { toast.error(`Erro ao registrar entrega: ${entErr?.message ?? "desconhecido"}`); return null; }

      const entregaId = entRow.id as string;

      const itensPayload = input.itens.map(it => {
        const epi = state.epis.find(e => e.id === it.epiId);
        const dataValidade = epi && epi.validadeDias > 0 ? somaDias(input.dataEntrega, epi.validadeDias) : null;
        return {
          entrega_id: entregaId,
          epi_id: it.epiId,
          epi_nome: epi?.nome ?? "",
          ca: epi?.ca ?? "",
          quantidade: it.quantidade,
          motivo: it.motivo,
          data_entrega: input.dataEntrega,
          data_validade: dataValidade,
        };
      });

      const { error: itErr } = await supabase
        .from("entrega_epi_itens")
        .insert(itensPayload.map(p => upperizePayload(p)) as any);
      if (itErr) { toast.error(`Entrega criada, mas falhou ao salvar os itens: ${itErr.message}`); }

      // Baixa de estoque (best-effort)
      for (const it of input.itens) {
        const epi = state.epis.find(e => e.id === it.epiId);
        if (epi) {
          const novoEstoque = Math.max(0, epi.estoque - it.quantidade);
          if (novoEstoque !== epi.estoque) {
            await supabase.from("epis").update({ estoque: novoEstoque }).eq("id", epi.id);
          }
        }
      }

      await fetchAll();

      const entrega = state.entregas.find(e => e.id === entregaId) ?? mapEntrega(entRow);
      const funcionario = state.funcionarios.find(f => f.id === input.funcionarioId);
      const itens = state.itens.filter(i => i.entregaId === entregaId);
      return { entrega, funcionario, itens };
    } catch (err) {
      toast.error(`Erro ao registrar entrega: ${err instanceof Error ? err.message : "desconhecido"}`);
      return null;
    }
  },
  async marcarAssinado(entregaId: string, assinado: boolean) {
    const dataAssinatura = assinado ? new Date().toISOString().slice(0, 10) : null;
    state = {
      ...state,
      entregas: state.entregas.map(e => e.id === entregaId
        ? { ...e, assinado, status: assinado ? "ASSINADO" : "PENDENTE", dataAssinatura: dataAssinatura ?? undefined }
        : e),
    };
    emit();
    const { error } = await supabase.from("entregas_epi").update({
      assinado,
      status: assinado ? "ASSINADO" : "PENDENTE",
      data_assinatura: dataAssinatura,
    }).eq("id", entregaId);
    toastErr("Erro ao atualizar termo", error);
  },
  async excluirEntrega(id: string) {
    state = {
      ...state,
      entregas: state.entregas.filter(e => e.id !== id),
      itens: state.itens.filter(i => i.entregaId !== id),
    };
    emit();
    const { error } = await supabase.from("entregas_epi").delete().eq("id", id);
    toastErr("Erro ao excluir entrega", error);
    await fetchAll();
  },
};
