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
  | "equipamentos"
  | "webmail"
  | "admin"
  | "financeiro";

export type CurrentUser = {
    id: string;
    nome: string;
    email: string;
    perfil: string;
    permissoes: ModuloKey[];
};

// Mapa perfil -> permissoes (mesma matriz do modulo Admin).
export function permissoesDoPerfil(perfil: string): ModuloKey[] {
    switch (perfil) {
      case "Administrador":
              return ["comercial", "projetos", "equipamentos", "webmail", "admin", "financeiro"];
      case "Comercial":
              return ["comercial", "webmail"];
      case "Projetos":
              return ["projetos", "webmail", "financeiro"];
      case "Almoxarifado":
              return ["equipamentos", "webmail"];
      default:
              return ["webmail"];
    }
}

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
    listeners.forEach(l => l());
}
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

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
