// ============================================================
// Store de controle de acesso por usuario
// ------------------------------------------------------------
// Guarda, por usuario: quais modulos ele pode ver/editar e quais
// blocos do painel inicial aparecem para ele.
// Persistido na tabela `profiles` (coluna `permissoes`, jsonb) do
// Supabase, protegido por Row Level Security. A checagem no front
// e apenas de EXIBICAO.
// ============================================================
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ModuloKey } from "@/lib/current-user";
import { permissoesDoPerfil } from "@/lib/current-user";

export type PainelKey = "comercial" | "previsao" | "projetos" | "equipamentos" | "financeiro";

export const PAINEL_KEYS: PainelKey[] = ["comercial", "previsao", "projetos", "equipamentos", "financeiro"];
export const PAINEL_LABEL: Record<PainelKey, string> = {
    comercial: "Comercial",
    previsao: "Previsao de Entrada",
    projetos: "Projetos",
    equipamentos: "Equipamentos",
    financeiro: "Financeiro",
};
// Qual modulo cada painel depende para poder ser exibido.
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
    admin: "Administracao",
};

export type ModuloAcesso = { ver: boolean; editar: boolean };
export type UserAccess = {
    modulos: Partial<Record<ModuloKey, ModuloAcesso>>;
    paineis: Partial<Record<PainelKey, boolean>>;
};
type AccessMap = Record<string, UserAccess>;

const SSR_EMPTY: AccessMap = Object.freeze({}) as AccessMap;

let state: AccessMap = {};
const listeners = new Set<() => void>();
const loaded = new Set<string>();
const loading = new Set<string>();

function emit() {
    listeners.forEach(l => l());
}
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
function getSnapshot() { return state; }
function getServerSnapshot() { return SSR_EMPTY; }

async function ensureLoaded(userId: string) {
    if (!userId || loaded.has(userId) || loading.has(userId)) return;
    loading.add(userId);
    const { data } = await supabase.from("profiles").select("permissoes").eq("id", userId).maybeSingle();
    const perm = (data?.permissoes ?? {}) as Partial<UserAccess>;
    state = { ...state, [userId]: { modulos: perm.modulos ?? {}, paineis: perm.paineis ?? {} } };
    loaded.add(userId);
    loading.delete(userId);
    emit();
}

async function persist(userId: string) {
    const entry = state[userId] ?? { modulos: {}, paineis: {} };
    await supabase.from("profiles").update({ permissoes: entry }).eq("id", userId);
}

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

export function useUserAccess(userId: string, perfil: string) {
    const map = useMap();
    useEffect(() => { if (userId) void ensureLoaded(userId); }, [userId]);
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

export function useCanSeeModule(userId: string, perfil: string, mod: ModuloKey): boolean {
    return useUserAccess(userId, perfil).modulos[mod]?.ver ?? false;
}

export function useCanShowPainel(userId: string, perfil: string, painel: PainelKey): boolean {
    const acc = useUserAccess(userId, perfil);
    const dep = PAINEL_MODULO[painel];
    return (acc.modulos[dep]?.ver ?? false) && (acc.paineis[painel] ?? false);
}

// ---------- Actions ----------
export const accessActions = {
    setModulo(userId: string, perfil: string, mod: ModuloKey, patch: Partial<ModuloAcesso>) {
          const cur = state[userId] ?? { modulos: {}, paineis: {} };
          const defaults = defaultModulosDoPerfil(perfil);
          const atual = cur.modulos[mod] ?? defaults[mod];
          const next: ModuloAcesso = { ...atual, ...patch };
          // editar exige ver
      if (patch.ver === false) next.editar = false;
          if (patch.editar === true) next.ver = true;
          state = { ...state, [userId]: { ...cur, modulos: { ...cur.modulos, [mod]: next } } };
          emit();
          void persist(userId);
    },
    setPainel(userId: string, painel: PainelKey, valor: boolean) {
          const cur = state[userId] ?? { modulos: {}, paineis: {} };
          state = { ...state, [userId]: { ...cur, paineis: { ...cur.paineis, [painel]: valor } } };
          emit();
          void persist(userId);
    },
    resetToPerfil(userId: string) {
          if (!(userId in state)) return;
          const next = { ...state };
          delete next[userId];
          state = next;
          emit();
          void persist(userId);
    },
    removeUser(userId: string) {
          if (!(userId in state)) return;
          const next = { ...state };
          delete next[userId];
          state = next;
          emit();
    },
};
