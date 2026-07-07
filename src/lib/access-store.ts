// ============================================================
// Store de controle de acesso por usuário
// ------------------------------------------------------------
// Guarda, por usuário: quais módulos ele pode ver/editar e quais
// blocos do painel inicial aparecem para ele.
// Persistido em localStorage. Quando o Supabase estiver conectado,
// substituir por tabelas próprias (ex.: user_roles + user_prefs)
// e proteger via RLS. A checagem no front é só de EXIBIÇÃO.
// ============================================================
import { useMemo, useSyncExternalStore } from "react";
import type { ModuloKey } from "@/lib/current-user";
import { permissoesDoPerfil } from "@/lib/current-user";

export type PainelKey = "comercial" | "previsao" | "projetos" | "equipamentos" | "financeiro";

export const PAINEL_KEYS: PainelKey[] = ["comercial", "previsao", "projetos", "equipamentos", "financeiro"];
export const PAINEL_LABEL: Record<PainelKey, string> = {
  comercial: "Comercial",
  previsao: "Previsão de Entrada",
  projetos: "Projetos",
  equipamentos: "Equipamentos",
  financeiro: "Financeiro",
};
// Qual módulo cada painel depende para poder ser exibido.
export const PAINEL_MODULO: Record<PainelKey, ModuloKey> = {
  comercial: "comercial",
  previsao: "comercial",
  projetos: "projetos",
  equipamentos: "equipamentos",
  financeiro: "financeiro",
};

export const MODULO_KEYS: ModuloKey[] = ["comercial", "projetos", "equipamentos", "webmail", "financeiro", "admin"];
export const MODULO_LABEL: Record<ModuloKey, string> = {
  comercial: "Comercial",
  projetos: "Projetos",
  equipamentos: "Equipamentos",
  webmail: "Webmail",
  financeiro: "Financeiro",
  admin: "Administração",
};

export type ModuloAcesso = { ver: boolean; editar: boolean };
export type UserAccess = {
  modulos: Partial<Record<ModuloKey, ModuloAcesso>>;
  paineis: Partial<Record<PainelKey, boolean>>;
};
type AccessMap = Record<number, UserAccess>;

const KEY = "grd_access_matrix_v1";
const SSR_EMPTY: AccessMap = Object.freeze({}) as AccessMap;

function load(): AccessMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as AccessMap;
  } catch {}
  return {};
}

let state: AccessMap = load();
const listeners = new Set<() => void>();

function emit() {
  if (typeof window !== "undefined") {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  }
  listeners.forEach(l => l());
}
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
function getSnapshot() { return state; }
function getServerSnapshot() { return SSR_EMPTY; }

// ---------- Defaults por perfil ----------
export function defaultModulosDoPerfil(perfil: string): Record<ModuloKey, ModuloAcesso> {
  const permitidos = new Set(permissoesDoPerfil(perfil));
  const isAdmin = perfil === "Administrador";
  return {
    comercial: { ver: permitidos.has("comercial"), editar: isAdmin || perfil === "Comercial" },
    projetos: { ver: permitidos.has("projetos"), editar: isAdmin || perfil === "Projetos" },
    equipamentos: { ver: permitidos.has("equipamentos"), editar: isAdmin || perfil === "Almoxarifado" },
    webmail: { ver: permitidos.has("webmail"), editar: permitidos.has("webmail") },
    financeiro: { ver: permitidos.has("financeiro"), editar: isAdmin },
    admin: { ver: isAdmin, editar: isAdmin },
  };
}

export function defaultPaineisDoPerfil(perfil: string): Record<PainelKey, boolean> {
  const mods = defaultModulosDoPerfil(perfil);
  return {
    comercial: mods.comercial.ver,
    previsao: mods.comercial.ver,
    projetos: mods.projetos.ver,
    equipamentos: mods.equipamentos.ver,
    financeiro: mods.financeiro.ver,
  };
}

// ---------- Hooks ----------
function useMap(): AccessMap {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useUserAccess(userId: number, perfil: string) {
  const map = useMap();
  return useMemo(() => {
    const defaultsMod = defaultModulosDoPerfil(perfil);
    const defaultsPan = defaultPaineisDoPerfil(perfil);
    const entry = map[userId];
    const modulos = { ...defaultsMod } as Record<ModuloKey, ModuloAcesso>;
    const paineis = { ...defaultsPan } as Record<PainelKey, boolean>;
    if (entry?.modulos) {
      for (const k of MODULO_KEYS) {
        const v = entry.modulos[k];
        if (v) modulos[k] = v;
      }
    }
    if (entry?.paineis) {
      for (const k of PAINEL_KEYS) {
        const v = entry.paineis[k];
        if (typeof v === "boolean") paineis[k] = v;
      }
    }
    return { modulos, paineis };
  }, [map, userId, perfil]);
}

export function useCanSeeModule(userId: number, perfil: string, mod: ModuloKey): boolean {
  return useUserAccess(userId, perfil).modulos[mod]?.ver ?? false;
}

export function useCanShowPainel(userId: number, perfil: string, painel: PainelKey): boolean {
  const acc = useUserAccess(userId, perfil);
  const dep = PAINEL_MODULO[painel];
  return (acc.modulos[dep]?.ver ?? false) && (acc.paineis[painel] ?? false);
}

// ---------- Actions ----------
export const accessActions = {
  setModulo(userId: number, perfil: string, mod: ModuloKey, patch: Partial<ModuloAcesso>) {
    const cur = state[userId] ?? { modulos: {}, paineis: {} };
    const defaults = defaultModulosDoPerfil(perfil);
    const atual = cur.modulos[mod] ?? defaults[mod];
    const next: ModuloAcesso = { ...atual, ...patch };
    // editar exige ver
    if (patch.ver === false) next.editar = false;
    if (patch.editar === true) next.ver = true;
    state = { ...state, [userId]: { ...cur, modulos: { ...cur.modulos, [mod]: next } } };
    emit();
  },
  setPainel(userId: number, painel: PainelKey, valor: boolean) {
    const cur = state[userId] ?? { modulos: {}, paineis: {} };
    state = { ...state, [userId]: { ...cur, paineis: { ...cur.paineis, [painel]: valor } } };
    emit();
  },
  resetToPerfil(userId: number) {
    if (!(userId in state)) return;
    const next = { ...state };
    delete next[userId];
    state = next;
    emit();
  },
  removeUser(userId: number) {
    if (!(userId in state)) return;
    const next = { ...state };
    delete next[userId];
    state = next;
    emit();
  },
};
