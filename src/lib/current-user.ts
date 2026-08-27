// ============================================================
// Sessao do usuario atual + matriz de permissoes
// ------------------------------------------------------------
// A sessao vem da autenticacao real do Supabase (supabase.auth).
// O perfil (nome, perfil, permissoes) e lido da tabela `profiles`,
// vinculada 1:1 ao usuario autenticado (profiles.id = auth.uid()).
// A seguranca REAL e garantida por Row Level Security no banco;
// a checagem no front e apenas para exibicao.
// ============================================================
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export type ModuloKey =
  | "comercial"
  | "projetos"
  | "epis"
  | "webmail"
  | "admin"
  | "financeiro"
  | "rh"
  /** Permissão à parte, e não um módulo com menu: é ela que libera
   *  salário, faixa salarial e pretensão. No banco quem manda é a RLS
   *  das tabelas de remuneração; aqui só decide o que a tela mostra. */
  | "rh_remuneracao";

export type CurrentUser = {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  permissoes: ModuloKey[];
};

// Mapa perfil -> permissoes (mesma matriz do modulo Admin).
// Os perfis Diretoria, RH, Administrativo, Engenharia e Campo entraram
// com o modulo de RH: a matriz do briefing distingue os cinco, e antes
// deles so existiam Administrador/Comercial/Projetos/Almoxarifado.
// "projetos" continua valendo como Engenharia enquanto as contas nao
// forem reclassificadas na tela de Admin.
export function permissoesDoPerfil(perfil: string): ModuloKey[] {
  switch (perfil.toLowerCase()) {
    case "administrador":
    case "admin":
      return [
        "comercial",
        "projetos",
        "epis",
        "webmail",
        "admin",
        "financeiro",
        "rh",
        "rh_remuneracao",
      ];
    case "diretoria":
      return ["comercial", "projetos", "epis", "webmail", "financeiro", "rh", "rh_remuneracao"];
    case "rh":
      return ["webmail", "rh", "rh_remuneracao"];
    case "administrativo":
      return ["webmail", "rh"];
    case "engenharia":
      return ["projetos", "webmail", "financeiro", "rh"];
    case "comercial":
      return ["comercial", "webmail"];
    case "projetos":
      return ["projetos", "webmail", "financeiro", "rh"];
    case "almoxarifado":
      return ["epis", "webmail", "rh"];
    case "campo":
      return ["webmail"];
    default:
      return ["webmail"];
  }
}

/** Perfis, em minusculas, que enxergam cada tela do modulo de RH.
 *  E a matriz do briefing transcrita: campo nao aparece em nenhuma. */
export const PERFIS_RH = {
  painel: ["administrador", "admin", "diretoria", "rh", "administrativo"],
  vagas: ["administrador", "admin", "diretoria", "rh", "administrativo", "engenharia", "projetos"],
  selecao: [
    "administrador",
    "admin",
    "diretoria",
    "rh",
    "administrativo",
    "engenharia",
    "projetos",
  ],
  admissoes: [
    "administrador",
    "admin",
    "diretoria",
    "rh",
    "administrativo",
    "engenharia",
    "projetos",
  ],
  colaboradores: [
    "administrador",
    "admin",
    "diretoria",
    "rh",
    "administrativo",
    "engenharia",
    "projetos",
    "almoxarifado",
  ],
  cargos: [
    "administrador",
    "admin",
    "diretoria",
    "rh",
    "administrativo",
    "engenharia",
    "projetos",
    "almoxarifado",
  ],
  integracoes: ["administrador", "admin", "diretoria", "rh"],
  configuracoes: ["administrador", "admin", "diretoria", "rh"],
} as const;
const GUEST_USER: CurrentUser = {
  id: "",
  nome: "",
  email: "",
  perfil: "",
  permissoes: [],
};

let state: CurrentUser | null = null;
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

async function refreshFromSession(session: Session | null) {
  if (!session?.user) {
    state = null;
    emit();
    return;
  }
  const authUser = session.user;
  const { data } = await supabase
    .from("profiles")
    .select("nome, email, perfil")
    .eq("id", authUser.id)
    .maybeSingle();

  const email = data?.email || authUser.email || "";
  const nome = data?.nome || email.split("@")[0] || "Usuario";
  const perfil = data?.perfil || "colaborador";

  state = {
    id: authUser.id,
    nome,
    email,
    perfil,
    permissoes: permissoesDoPerfil(perfil),
  };
  emit();
}

if (typeof window !== "undefined") {
  supabase.auth.getSession().then(({ data }) => refreshFromSession(data.session));
  supabase.auth.onAuthStateChange((_event, session) => {
    refreshFromSession(session);
  });
}

export function useCurrentUser(): CurrentUser {
  return useSyncExternalStore(
    subscribe,
    () => state ?? GUEST_USER,
    () => GUEST_USER,
  );
}

export function useHasPermission(mod: ModuloKey): boolean {
  const u = useCurrentUser();
  const { useCanSeeModule } = accessHooks;
  return useCanSeeModule(u.id, u.perfil, mod);
}

export function useCanShowPainel(painel: import("@/lib/access-store").PainelKey): boolean {
  const u = useCurrentUser();
  const { useCanShowPainel: hook } = accessHooks;
  return hook(u.id, u.perfil, painel);
}

// Late-bound para evitar ciclo estatico com access-store.
import * as accessHooks from "@/lib/access-store";

export const sessionActions = {
  async logout() {
    await supabase.auth.signOut();
    state = null;
    emit();
  },
};

export function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "GR";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
