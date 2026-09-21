// ============================================================
// Store de colaboradores — o cadastro, e só o cadastro
// ------------------------------------------------------------
// Lê a tabela `funcionarios` e grava o cadastro básico (nome,
// documentos pessoais, cargo, contato, situação). É o único lugar do
// Portal que cria ou edita gente à mão.
//
// Documentos com vencimento, aptidão, dependentes, salário, histórico
// e alocação em obra saíram das telas. As tabelas e colunas continuam
// no banco com os dados de antes — só não há mais tela lendo ou
// gravando nelas por aqui.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Resultado } from "@/lib/rh-store";
import { upperizePayload } from "@/lib/utils";

function toastErr(msg: string, err: { message?: string } | null | undefined) {
  if (err) toast.error(`${msg}: ${err.message ?? "erro desconhecido"}`);
}

function falha<T = void>(err: { message?: string } | null | undefined): Resultado<T> {
  return { ok: false, erro: err?.message ?? "erro desconhecido" };
}

// ============================================================
// Tipos
// ============================================================
export type SituacaoColaborador = "experiencia" | "ativo" | "afastado" | "desligado";

export type Colaborador = {
  id: string;
  nome: string;
  cpf: string;
  rg: string;
  cargo: string;
  setor: string;
  matricula: string;
  dataAdmissao: string | null;
  situacao: SituacaoColaborador;
  ativo: boolean;
  observacoes: string;
  telefone: string;
  email: string;
  dataDesligamento: string | null;
};

type State = {
  carregado: boolean;
  carregando: boolean;
  colaboradores: Colaborador[];
};

const SSR: State = { carregado: false, carregando: false, colaboradores: [] };

let state: State = SSR;
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

// ============================================================
// Mapeamento
// ============================================================
type Row = Record<string, unknown>;
const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const opt = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

function mapColaborador(r: Row): Colaborador {
  return {
    id: txt(r.id),
    nome: txt(r.nome),
    cpf: txt(r.cpf),
    rg: txt(r.rg),
    cargo: txt(r.cargo),
    setor: txt(r.setor),
    matricula: txt(r.matricula),
    dataAdmissao: opt(r.data_admissao),
    situacao: (txt(r.situacao) || "ativo") as SituacaoColaborador,
    ativo: r.ativo !== false,
    observacoes: txt(r.observacoes),
    telefone: txt(r.telefone),
    email: txt(r.email),
    dataDesligamento: opt(r.data_desligamento),
  };
}

// ============================================================
// Carga
// ============================================================
async function fetchColaboradores() {
  if (state.carregando) return;
  state = { ...state, carregando: true };
  emit();
  try {
    const { data, error } = await supabase
      .from("funcionarios")
      .select("*")
      .order("nome", { ascending: true });
    toastErr("Falha ao carregar colaboradores", error);
    state = {
      carregado: true,
      carregando: false,
      colaboradores: ((data ?? []) as Row[]).map(mapColaborador),
    };
    emit();
  } catch (err) {
    console.error("[rh-colaboradores-store] fetchColaboradores:", err);
    state = { ...state, carregando: false };
    emit();
  }
}

export async function recarregarColaboradores() {
  await fetchColaboradores();
}

// ============================================================
// Hook
// ============================================================
function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
    return true;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
        return false;
    }
    return true;
  }
  return false;
}

export function useColaboradores<T>(selector: (s: State) => T): T {
  const selRef = useRef(selector);
  selRef.current = selector;
  const [value, setValue] = useState<T>(() => selector(state));
  useEffect(() => {
    if (!state.carregado && !state.carregando) void fetchColaboradores();
    const check = () => {
      const next = selRef.current(state);
      setValue((prev) => (shallowEqual(prev, next) ? prev : next));
    };
    check();
    return subscribe(check);
  }, []);
  return value;
}

// ============================================================
// Ações
// ============================================================
export type CadastroColaborador = {
  nome: string;
  cpf: string;
  rg: string;
  cargo: string;
  setor: string;
  matricula: string;
  dataAdmissao: string | null;
  telefone: string;
  email: string;
  observacoes: string;
  situacao: SituacaoColaborador;
};

/**
 * O EPIs lê a mesma tabela para a entrega. Import dinâmico de
 * propósito: o epis-store busca tudo assim que o módulo carrega, e um
 * import estático faria toda tela de RH baixar as tabelas de EPI.
 */
async function refetchEpis() {
  const epis = await import("@/lib/epis-store");
  await epis.refetchEpis();
}

function linhaCadastro(input: CadastroColaborador) {
  return {
    ...upperizePayload({
      nome: input.nome,
      cpf: input.cpf,
      rg: input.rg,
      cargo: input.cargo,
      setor: input.setor,
      matricula: input.matricula,
      data_admissao: input.dataAdmissao,
      telefone: input.telefone,
      // E-mail em minúsculas: upperizePayload pula a chave, mas quem
      // digita nem sempre digita em minúsculas.
      email: input.email.toLowerCase(),
      observacoes: input.observacoes,
    }),
    // Fora do upperizePayload: o banco só aceita a situação em
    // minúsculas (funcionarios_situacao_check), e "DESLIGADO" seria
    // recusado.
    situacao: input.situacao,
    // `ativo` é o que EPIs, Ponto e a conciliação usam para saber quem
    // está na casa; anda sempre junto com a situação.
    ativo: input.situacao !== "desligado",
  };
}

export const colaboradorActions = {
  /**
   * Cadastro direto, sem passar por admissão. Não existe o par
   * "excluir": quem sai muda a situação para Desligado, para os termos
   * de EPI e as batidas de ponto continuarem apontando para alguém.
   *
   * O store do EPIs é recarregado junto — senão o recém-cadastrado só
   * apareceria na entrega depois de um F5.
   */
  async criar(input: CadastroColaborador): Promise<Resultado<string>> {
    const { data, error } = await supabase
      .from("funcionarios")
      .insert(linhaCadastro(input) as never)
      .select("id")
      .single();
    if (error) return falha<string>(error);
    await Promise.all([recarregarColaboradores(), refetchEpis()]);
    return { ok: true, dado: txt((data as Row).id) };
  },

  /**
   * Ao desligar, carimba a data de desligamento (se ainda não houver) e
   * tira da obra — é o que o desligamento completo do RH fazia. Ao
   * voltar para Ativo, a data de desligamento é limpa.
   */
  async atualizarCadastro(anterior: Colaborador, input: CadastroColaborador): Promise<Resultado> {
    const linha: Record<string, unknown> = linhaCadastro(input);
    const desligando = input.situacao === "desligado" && anterior.situacao !== "desligado";
    const religando = input.situacao !== "desligado" && anterior.situacao === "desligado";
    if (desligando) {
      linha.data_desligamento = anterior.dataDesligamento ?? new Date().toISOString().slice(0, 10);
      linha.projeto_id = null;
    }
    if (religando) linha.data_desligamento = null;

    const { error } = await supabase
      .from("funcionarios")
      .update(linha as never)
      .eq("id", anterior.id);
    if (error) return falha(error);
    await Promise.all([recarregarColaboradores(), refetchEpis()]);
    return { ok: true };
  },
};

// ============================================================
// Rótulos
// ============================================================
export const SITUACAO_LABEL: Record<string, string> = {
  experiencia: "Experiência",
  ativo: "Ativo",
  afastado: "Afastado",
  desligado: "Desligado",
};

export const SITUACAO_ESTILO: Record<string, string> = {
  experiencia: "bg-amber-100 text-amber-800",
  ativo: "bg-emerald-100 text-emerald-800",
  afastado: "bg-sky-100 text-sky-800",
  desligado: "bg-slate-100 text-slate-500",
};
