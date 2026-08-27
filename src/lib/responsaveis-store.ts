// ============================================================
// Store de Responsáveis (técnico / comercial)
// ------------------------------------------------------------
// Pré-cadastro que alimenta os comboboxes de projeto e orçamento.
// Persistida na tabela `responsaveis` do Supabase (RLS ligada).
//
// Responsável não se apaga, se inativa: o inativo some dos
// comboboxes mas continua aparecendo nos registros antigos, que
// seguem apontando para ele.
// ============================================================
import { useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/current-user";
import { useUserAccess } from "@/lib/access-store";

export type ResponsavelTipo = "tecnico" | "comercial" | "ambos";

export const RESPONSAVEL_TIPOS: ResponsavelTipo[] = ["tecnico", "comercial", "ambos"];

export const RESPONSAVEL_TIPO_LABEL: Record<ResponsavelTipo, string> = {
  tecnico: "Técnico",
  comercial: "Comercial",
  ambos: "Ambos",
};

export type Responsavel = {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  tipo: ResponsavelTipo;
  ativo: boolean;
};

type ResponsavelRow = {
  id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  tipo: string | null;
  ativo: boolean | null;
};

function fromRow(r: ResponsavelRow): Responsavel {
  return {
    id: r.id,
    nome: r.nome ?? "",
    email: r.email ?? "",
    telefone: r.telefone ?? "",
    tipo: (r.tipo as ResponsavelTipo) ?? "ambos",
    ativo: r.ativo ?? true,
  };
}

function toastErr(msg: string, err: { message?: string } | null | undefined) {
  if (err) toast.error(`${msg}: ${err.message ?? "erro desconhecido"}`);
}

let state: Responsavel[] = [];
const listeners = new Set<() => void>();
function emit() { listeners.forEach(l => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

const SSR_EMPTY: Responsavel[] = Object.freeze([]) as unknown as Responsavel[];
const getSnapshot = () => state;
const getServerSnapshot = () => SSR_EMPTY;

async function fetchAll() {
  const { data, error } = await supabase
    .from("responsaveis")
    .select("*")
    .order("nome", { ascending: true });
  if (error) { toastErr("Falha ao carregar responsáveis", error); state = []; emit(); return; }
  state = (data as ResponsavelRow[] ?? []).map(fromRow);
  emit();
}

if (typeof window !== "undefined") void fetchAll();

export function useResponsaveis<T>(selector: (s: Responsavel[]) => T): T {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => selector(snap), [snap, selector]);
}

/**
 * Quem entra em cada combobox: `ambos` aparece nos dois, e só ativos.
 * O responsável já selecionado num registro antigo é preservado pelo
 * componente de seleção mesmo se estiver inativo.
 */
export function filtrarPorPapel(lista: Responsavel[], papel: "tecnico" | "comercial"): Responsavel[] {
  return lista.filter(r => r.ativo && (r.tipo === papel || r.tipo === "ambos"));
}

export function nomeDoResponsavel(lista: Responsavel[], id: string | null): string {
  if (!id) return "";
  return lista.find(r => r.id === id)?.nome ?? "";
}

/**
 * Quem pode criar responsável pelo atalho do combobox.
 * Decisão do time: administrador, comercial e projetos — os três
 * perfis que lançam projeto ou orçamento no dia a dia.
 *
 * A RLS não distingue perfil (qualquer autenticado escreve), então
 * isto é trava de interface, para o cadastro não virar lixeira de
 * nomes duplicados.
 */
export function usePodeCadastrarResponsavel(): boolean {
  const u = useCurrentUser();
  const acesso = useUserAccess(u.id, u.perfil);
  return Boolean(
    acesso.modulos.admin?.editar ||
    acesso.modulos.comercial?.editar ||
    acesso.modulos.projetos?.editar,
  );
}

export const responsaveisActions = {
  recarregar: fetchAll,

  async criar(input: { nome: string; tipo: ResponsavelTipo; email?: string; telefone?: string }): Promise<Responsavel | null> {
    const nome = input.nome.trim().toUpperCase();
    if (!nome) { toast.error("Informe o nome do responsável."); return null; }
    const { data, error } = await supabase
      .from("responsaveis")
      // `tipo` fica em minúsculas de propósito (check constraint no banco),
      // por isso o payload não passa por upperizePayload.
      .insert({
        nome,
        tipo: input.tipo,
        email: input.email?.trim() || null,
        telefone: input.telefone?.trim() || null,
      })
      .select()
      .single();
    if (error) { toastErr("Falha ao cadastrar responsável", error); return null; }
    const novo = fromRow(data as ResponsavelRow);
    state = [...state, novo].sort((a, b) => a.nome.localeCompare(b.nome));
    emit();
    return novo;
  },

  async atualizar(id: string, patch: Partial<Omit<Responsavel, "id">>): Promise<boolean> {
    const anterior = state;
    state = state.map(r => r.id === id ? { ...r, ...patch } : r);
    emit();
    const row: Record<string, unknown> = {};
    if (patch.nome !== undefined) row.nome = patch.nome.trim().toUpperCase();
    if (patch.tipo !== undefined) row.tipo = patch.tipo;
    if (patch.email !== undefined) row.email = patch.email.trim() || null;
    if (patch.telefone !== undefined) row.telefone = patch.telefone.trim() || null;
    if (patch.ativo !== undefined) row.ativo = patch.ativo;
    const { error } = await supabase.from("responsaveis").update(row).eq("id", id);
    if (error) {
      toastErr("Falha ao salvar responsável", error);
      state = anterior;
      emit();
      return false;
    }
    return true;
  },

  /** Inativa em vez de apagar — os registros antigos continuam apontando para ele. */
  async inativar(id: string, ativo: boolean): Promise<boolean> {
    return responsaveisActions.atualizar(id, { ativo });
  },
};
