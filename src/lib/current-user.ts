// ============================================================
// Sessão do usuário atual + matriz de permissões (mock)
// ------------------------------------------------------------
// IMPORTANTE: esta é uma camada temporária para uso em memória
// enquanto o Supabase não está conectado. Quando ligar o banco:
//  - substituir `loadCurrentUser` por consulta ao perfil autenticado
//  - as permissões devem vir de tabelas próprias (ex.: user_roles)
//  - a segurança REAL é garantida por Row Level Security no banco;
//    a checagem no front é apenas para exibição.
// ============================================================
import { useSyncExternalStore } from "react";
import { usuarios as seedUsuarios } from "@/lib/mock-data";

export type ModuloKey =
  | "comercial"
  | "projetos"
  | "equipamentos"
  | "webmail"
  | "admin"
  | "financeiro";

export type CurrentUser = {
  id: number;
  nome: string;
  email: string;
  perfil: string;
  permissoes: ModuloKey[];
};

const KEY = "grd_current_user_v1";

// Mapa perfil -> permissões (mesma matriz do módulo Admin).
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

// Usuário padrão (demo) quando não houver sessão salva.
const DEFAULT_USER: CurrentUser = {
  id: 0,
  nome: "Rafael Prado",
  email: "demo@grupogrd.com.br",
  perfil: "Administrador",
  permissoes: permissoesDoPerfil("Administrador"),
};

function load(): CurrentUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as CurrentUser;
  } catch {}
  return null;
}

let state: CurrentUser | null = load();

const listeners = new Set<() => void>();
function emit() {
  if (typeof window !== "undefined") {
    try {
      if (state) localStorage.setItem(KEY, JSON.stringify(state));
      else localStorage.removeItem(KEY);
    } catch {}
  }
  listeners.forEach(l => l());
}
function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }

export function useCurrentUser(): CurrentUser {
  return useSyncExternalStore(
    subscribe,
    () => state ?? DEFAULT_USER,
    () => state ?? DEFAULT_USER,
  );
}

export function useHasPermission(mod: ModuloKey): boolean {
  const u = useCurrentUser();
  // Delega para a store de acesso (que respeita overrides do Admin).
  // Import dinâmico via require-like para evitar ciclo de módulos.
  const { useCanSeeModule } = accessHooks;
  return useCanSeeModule(u.id, u.perfil, mod);
}

export function useCanShowPainel(painel: import("@/lib/access-store").PainelKey): boolean {
  const u = useCurrentUser();
  const { useCanShowPainel: hook } = accessHooks;
  return hook(u.id, u.perfil, painel);
}

// Late-bound para evitar ciclo estático com access-store.
import * as accessHooks from "@/lib/access-store";

export const sessionActions = {
  loginPorEmail(email: string): CurrentUser {
    const e = email.trim().toLowerCase();
    // Aceita o usuário demo padrão.
    if (e === "demo@grupogrd.com.br" || e === "demo") {
      state = DEFAULT_USER;
      emit();
      return DEFAULT_USER;
    }
    // Tenta casar com um dos usuários cadastrados (mock-data).
    const found = seedUsuarios.find(u => u.email.toLowerCase() === e);
    if (found) {
      const u: CurrentUser = {
        id: found.id,
        nome: found.nome,
        email: found.email,
        perfil: found.perfil,
        permissoes: permissoesDoPerfil(found.perfil),
      };
      state = u;
      emit();
      return u;
    }
    // Fallback: entra como Administrador com nome derivado do e-mail.
    const nome = e.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, m => m.toUpperCase());
    const u: CurrentUser = {
      id: -1, nome, email: e, perfil: "Administrador",
      permissoes: permissoesDoPerfil("Administrador"),
    };
    state = u;
    emit();
    return u;
  },
  logout() {
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
