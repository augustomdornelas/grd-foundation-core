// ============================================================
// Catálogos do RH — cargos, etapas do funil, motivos e tipos de doc
// ------------------------------------------------------------
// São as tabelas que quase não mudam e que todas as telas do módulo
// consultam. Carregam uma vez, sob demanda.
//
// Por que não carrega no import, como epis-store faz: quem não é do
// RH recebe erro de permissão nessas tabelas, e o toast apareceria no
// login de todo mundo. Aqui a carga só acontece quando uma tela do
// módulo monta.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

function toastErr(msg: string, err: { message?: string } | null | undefined) {
  if (err) toast.error(`${msg}: ${err.message ?? "erro desconhecido"}`);
}

// ---------- Tipos ----------
export type EtapaTipo =
  "inicial" | "intermediaria" | "final_positiva" | "final_negativa" | "final_neutra";

export type FunilEtapa = {
  id: string;
  nome: string;
  ordem: number;
  tipo: EtapaTipo;
  slaDias: number;
  cor: string;
  opcional: boolean;
  permiteGestor: boolean;
  statusResultante: string | null;
  ativo: boolean;
};

export type MotivoReprovacao = { id: string; nome: string; ordem: number; ativo: boolean };

export type TipoDocumento = {
  id: string;
  nome: string;
  descricao: string;
  categoria: "pessoal" | "saude" | "treinamento" | "trabalhista" | "outro";
  temVencimento: boolean;
  validadePadraoMeses: number;
  obrigatorioAdmissao: boolean;
  bloqueiaAlocacao: boolean;
  ordem: number;
  ativo: boolean;
};

export type Cargo = {
  id: string;
  nome: string;
  cbo: string;
  setor: string;
  descricao: string;
  atividades: string;
  requisitos: string;
  escolaridadeMinima: string;
  nrsExigidas: string[];
  exigeCnh: boolean;
  categoriaCnh: string;
  episPadrao: string[];
  checklistModeloId: string | null;
  ativo: boolean;
  /** Só chega para Diretoria e RH — para os demais a RLS devolve vazio. */
  faixaMin: number | null;
  faixaMax: number | null;
};

export type ChecklistModelo = {
  id: string;
  nome: string;
  descricao: string;
  tipoContratacao: string;
  ativo: boolean;
};

export type ChecklistModeloItem = {
  id: string;
  modeloId: string;
  titulo: string;
  categoria: "documento" | "exame" | "treinamento" | "epi" | "sistema" | "contrato";
  tipoDocumentoId: string | null;
  obrigatorio: boolean;
  responsavelPadrao: "rh" | "candidato" | "almoxarifado" | "gestor";
  ordem: number;
  instrucoes: string;
  ativo: boolean;
};

type State = {
  carregado: boolean;
  carregando: boolean;
  etapas: FunilEtapa[];
  motivos: MotivoReprovacao[];
  tiposDocumento: TipoDocumento[];
  cargos: Cargo[];
  modelos: ChecklistModelo[];
  modeloItens: ChecklistModeloItem[];
};

const SSR: State = {
  carregado: false,
  carregando: false,
  etapas: [],
  motivos: [],
  tiposDocumento: [],
  cargos: [],
  modelos: [],
  modeloItens: [],
};

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

// ---------- Mapeamento ----------
type Row = Record<string, unknown>;
const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const int = (v: unknown) => Number(v ?? 0) || 0;
const numOuNulo = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

function mapEtapa(r: Row): FunilEtapa {
  return {
    id: txt(r.id),
    nome: txt(r.nome),
    ordem: int(r.ordem),
    tipo: (txt(r.tipo) || "intermediaria") as EtapaTipo,
    slaDias: int(r.sla_dias),
    cor: txt(r.cor) || "#1F3367",
    opcional: Boolean(r.opcional),
    permiteGestor: Boolean(r.permite_gestor),
    statusResultante: r.status_resultante ? txt(r.status_resultante) : null,
    ativo: r.ativo !== false,
  };
}

function mapMotivo(r: Row): MotivoReprovacao {
  return { id: txt(r.id), nome: txt(r.nome), ordem: int(r.ordem), ativo: r.ativo !== false };
}

function mapTipoDoc(r: Row): TipoDocumento {
  return {
    id: txt(r.id),
    nome: txt(r.nome),
    descricao: txt(r.descricao),
    categoria: (txt(r.categoria) || "outro") as TipoDocumento["categoria"],
    temVencimento: Boolean(r.tem_vencimento),
    validadePadraoMeses: int(r.validade_padrao_meses),
    obrigatorioAdmissao: Boolean(r.obrigatorio_admissao),
    bloqueiaAlocacao: Boolean(r.bloqueia_alocacao),
    ordem: int(r.ordem),
    ativo: r.ativo !== false,
  };
}

function mapCargo(r: Row, faixa?: { minimo: unknown; maximo: unknown }): Cargo {
  return {
    id: txt(r.id),
    nome: txt(r.nome),
    cbo: txt(r.cbo),
    setor: txt(r.setor),
    descricao: txt(r.descricao),
    atividades: txt(r.atividades),
    requisitos: txt(r.requisitos),
    escolaridadeMinima: txt(r.escolaridade_minima),
    nrsExigidas: Array.isArray(r.nrs_exigidas) ? (r.nrs_exigidas as string[]) : [],
    exigeCnh: Boolean(r.exige_cnh),
    categoriaCnh: txt(r.categoria_cnh),
    episPadrao: Array.isArray(r.epis_padrao) ? (r.epis_padrao as string[]) : [],
    checklistModeloId: r.checklist_modelo_id ? txt(r.checklist_modelo_id) : null,
    ativo: r.ativo !== false,
    faixaMin: faixa ? numOuNulo(faixa.minimo) : null,
    faixaMax: faixa ? numOuNulo(faixa.maximo) : null,
  };
}

function mapModelo(r: Row): ChecklistModelo {
  return {
    id: txt(r.id),
    nome: txt(r.nome),
    descricao: txt(r.descricao),
    tipoContratacao: txt(r.tipo_contratacao),
    ativo: r.ativo !== false,
  };
}

function mapModeloItem(r: Row): ChecklistModeloItem {
  return {
    id: txt(r.id),
    modeloId: txt(r.modelo_id),
    titulo: txt(r.titulo),
    categoria: (txt(r.categoria) || "documento") as ChecklistModeloItem["categoria"],
    tipoDocumentoId: r.tipo_documento_id ? txt(r.tipo_documento_id) : null,
    obrigatorio: r.obrigatorio !== false,
    responsavelPadrao: (txt(r.responsavel_padrao) ||
      "rh") as ChecklistModeloItem["responsavelPadrao"],
    ordem: int(r.ordem),
    instrucoes: txt(r.instrucoes),
    ativo: r.ativo !== false,
  };
}

// ---------- Carga ----------
async function fetchCatalogos() {
  if (state.carregando) return;
  state = { ...state, carregando: true };
  emit();
  try {
    const [et, mo, td, ca, fx, mod, modIt] = await Promise.all([
      supabase.from("rh_funil_etapas").select("*").order("ordem", { ascending: true }),
      supabase.from("rh_motivos_reprovacao").select("*").order("ordem", { ascending: true }),
      supabase.from("rh_tipos_documento").select("*").order("ordem", { ascending: true }),
      supabase.from("rh_cargos").select("*").order("nome", { ascending: true }),
      // Faixa salarial vem de outra tabela: para quem não é Diretoria
      // nem RH, a RLS devolve lista vazia — sem erro, sem toast.
      supabase.from("rh_cargo_faixa").select("*"),
      supabase.from("rh_checklist_modelos").select("*").order("nome", { ascending: true }),
      supabase.from("rh_checklist_modelo_itens").select("*").order("ordem", { ascending: true }),
    ]);
    toastErr("Falha ao carregar etapas do funil", et.error);
    toastErr("Falha ao carregar motivos de reprovação", mo.error);
    toastErr("Falha ao carregar tipos de documento", td.error);
    toastErr("Falha ao carregar cargos", ca.error);
    toastErr("Falha ao carregar modelos de checklist", mod.error);

    const faixas = new Map<string, { minimo: unknown; maximo: unknown }>();
    for (const f of (fx.data ?? []) as Row[]) {
      faixas.set(txt(f.cargo_id), { minimo: f.minimo, maximo: f.maximo });
    }

    state = {
      carregado: true,
      carregando: false,
      etapas: ((et.data ?? []) as Row[]).map(mapEtapa),
      motivos: ((mo.data ?? []) as Row[]).map(mapMotivo),
      tiposDocumento: ((td.data ?? []) as Row[]).map(mapTipoDoc),
      cargos: ((ca.data ?? []) as Row[]).map((r) => mapCargo(r, faixas.get(txt(r.id)))),
      modelos: ((mod.data ?? []) as Row[]).map(mapModelo),
      modeloItens: ((modIt.data ?? []) as Row[]).map(mapModeloItem),
    };
    emit();
  } catch (err) {
    console.error("[rh-catalogos-store] fetchCatalogos:", err);
    state = { ...state, carregando: false };
    emit();
  }
}

export async function recarregarCatalogosRh() {
  state = { ...state, carregado: false };
  await fetchCatalogos();
}

// ---------- Hook ----------
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

export function useRhCatalogos<T>(selector: (s: State) => T): T {
  const selRef = useRef(selector);
  selRef.current = selector;
  const [value, setValue] = useState<T>(() => selector(state));
  useEffect(() => {
    if (!state.carregado && !state.carregando) void fetchCatalogos();
    const check = () => {
      const next = selRef.current(state);
      setValue((prev) => (shallowEqual(prev, next) ? prev : next));
    };
    check();
    return subscribe(check);
  }, []);
  return value;
}

// ---------- Seletores ----------
export function etapasAtivas(s: State): FunilEtapa[] {
  return s.etapas.filter((e) => e.ativo).sort((a, b) => a.ordem - b.ordem);
}

/** As colunas do Kanban: tudo menos as etapas finais, que viram destino e não coluna de trabalho. */
export function etapasDoKanban(s: State): FunilEtapa[] {
  return etapasAtivas(s);
}

export function etapaPorId(s: State, id: string): FunilEtapa | undefined {
  return s.etapas.find((e) => e.id === id);
}

export function primeiraEtapa(s: State): FunilEtapa | undefined {
  return etapasAtivas(s).find((e) => e.tipo === "inicial");
}

export function cargoPorId(s: State, id: string | null): Cargo | undefined {
  return id ? s.cargos.find((c) => c.id === id) : undefined;
}

export function itensDoModelo(s: State, modeloId: string): ChecklistModeloItem[] {
  return s.modeloItens
    .filter((i) => i.modeloId === modeloId && i.ativo)
    .sort((a, b) => a.ordem - b.ordem);
}

export function tipoDocumentoPorId(s: State, id: string | null): TipoDocumento | undefined {
  return id ? s.tiposDocumento.find((t) => t.id === id) : undefined;
}

/** Todas as NRs que aparecem em algum cargo — alimenta o filtro "tem NR-x". */
export function nrsConhecidas(s: State): string[] {
  const set = new Set<string>();
  for (const c of s.cargos) for (const nr of c.nrsExigidas) set.add(nr);
  for (const t of s.tiposDocumento) if (t.nome.startsWith("NR-")) set.add(t.nome);
  return [...set].sort();
}

// ============================================================
// Escrita — nada se apaga, tudo se inativa (regra 12)
// ------------------------------------------------------------
// Um cargo inativado some dos comboboxes, mas continua aparecendo nas
// vagas e nos colaboradores antigos. Uma etapa inativada sai do
// Kanban sem levar junto o histórico de quem passou por ela.
// ============================================================
type Erro = { message?: string } | null | undefined;

/** Mesmo formato do Resultado usado nos outros stores do módulo. */
export type ResultadoCatalogo = { ok: boolean; erro?: string; dado?: string };

function resultado(error: Erro): ResultadoCatalogo {
  if (error) return { ok: false, erro: error.message ?? "erro desconhecido" };
  return { ok: true };
}

export type CargoInput = {
  nome: string;
  cbo: string;
  setor: string;
  descricao: string;
  atividades: string;
  requisitos: string;
  escolaridadeMinima: string;
  nrsExigidas: string[];
  exigeCnh: boolean;
  categoriaCnh: string;
  episPadrao: string[];
  checklistModeloId: string | null;
  faixaMin: number | null;
  faixaMax: number | null;
};

export const catalogosActions = {
  // ---------- Cargos ----------
  async salvarCargo(input: CargoInput, id?: string): Promise<ResultadoCatalogo> {
    const linha = {
      nome: input.nome.trim(),
      cbo: input.cbo,
      setor: input.setor,
      descricao: input.descricao,
      atividades: input.atividades,
      requisitos: input.requisitos,
      escolaridade_minima: input.escolaridadeMinima,
      nrs_exigidas: input.nrsExigidas,
      exige_cnh: input.exigeCnh,
      categoria_cnh: input.categoriaCnh,
      epis_padrao: input.episPadrao,
      checklist_modelo_id: input.checklistModeloId,
    };
    const { data, error } = id
      ? await supabase.from("rh_cargos").update(linha).eq("id", id).select("id").single()
      : await supabase.from("rh_cargos").insert(linha).select("id").single();
    if (error) {
      if (error.code === "23505") return { ok: false, erro: "Já existe um cargo com este nome." };
      return resultado(error);
    }
    const cargoId = String((data as Record<string, unknown>).id);
    // A faixa mora em outra tabela, com RLS própria: para quem não vê
    // remuneração o upsert simplesmente não encontra linha, sem erro.
    if (input.faixaMin !== null || input.faixaMax !== null) {
      await supabase
        .from("rh_cargo_faixa")
        .upsert(
          { cargo_id: cargoId, minimo: input.faixaMin, maximo: input.faixaMax },
          { onConflict: "cargo_id" },
        );
    }
    await recarregarCatalogosRh();
    return { ok: true, dado: cargoId };
  },

  async alternarCargo(id: string, ativo: boolean) {
    const { error } = await supabase.from("rh_cargos").update({ ativo }).eq("id", id);
    if (!error) await recarregarCatalogosRh();
    return resultado(error);
  },

  // ---------- Etapas do funil ----------
  async salvarEtapa(input: Omit<FunilEtapa, "id">, id?: string) {
    const linha = {
      nome: input.nome.trim(),
      ordem: input.ordem,
      tipo: input.tipo,
      sla_dias: input.slaDias,
      cor: input.cor,
      opcional: input.opcional,
      permite_gestor: input.permiteGestor,
      status_resultante: input.statusResultante,
      ativo: input.ativo,
    };
    const { error } = id
      ? await supabase.from("rh_funil_etapas").update(linha).eq("id", id)
      : await supabase.from("rh_funil_etapas").insert(linha);
    if (error) {
      if (error.code === "23505") return { ok: false, erro: "Já existe uma etapa com este nome." };
      return resultado(error);
    }
    await recarregarCatalogosRh();
    return { ok: true };
  },

  /** Reordenar arrastando: grava a ordem nova de todas de uma vez. */
  async reordenarEtapas(ids: string[]) {
    for (let i = 0; i < ids.length; i++) {
      const { error } = await supabase
        .from("rh_funil_etapas")
        .update({ ordem: i + 1 })
        .eq("id", ids[i]);
      if (error) return resultado(error);
    }
    await recarregarCatalogosRh();
    return { ok: true };
  },

  // ---------- Motivos de reprovação ----------
  async salvarMotivo(nome: string, ordem: number, ativo: boolean, id?: string) {
    const linha = { nome: nome.trim(), ordem, ativo };
    const { error } = id
      ? await supabase.from("rh_motivos_reprovacao").update(linha).eq("id", id)
      : await supabase.from("rh_motivos_reprovacao").insert(linha);
    if (error) {
      if (error.code === "23505") return { ok: false, erro: "Já existe um motivo com este nome." };
      return resultado(error);
    }
    await recarregarCatalogosRh();
    return { ok: true };
  },

  // ---------- Tipos de documento ----------
  async salvarTipoDocumento(input: Omit<TipoDocumento, "id">, id?: string) {
    const linha = {
      nome: input.nome.trim(),
      descricao: input.descricao,
      categoria: input.categoria,
      tem_vencimento: input.temVencimento,
      validade_padrao_meses: input.validadePadraoMeses,
      obrigatorio_admissao: input.obrigatorioAdmissao,
      bloqueia_alocacao: input.bloqueiaAlocacao,
      ordem: input.ordem,
      ativo: input.ativo,
    };
    const { error } = id
      ? await supabase.from("rh_tipos_documento").update(linha).eq("id", id)
      : await supabase.from("rh_tipos_documento").insert(linha);
    if (error) {
      if (error.code === "23505")
        return { ok: false, erro: "Já existe um tipo de documento com este nome." };
      return resultado(error);
    }
    await recarregarCatalogosRh();
    return { ok: true };
  },

  // ---------- Modelos de checklist ----------
  async salvarModelo(
    nome: string,
    descricao: string,
    tipoContratacao: string,
    ativo: boolean,
    id?: string,
  ) {
    const linha = { nome: nome.trim(), descricao, tipo_contratacao: tipoContratacao, ativo };
    const { error } = id
      ? await supabase.from("rh_checklist_modelos").update(linha).eq("id", id)
      : await supabase.from("rh_checklist_modelos").insert(linha);
    if (error) {
      if (error.code === "23505") return { ok: false, erro: "Já existe um modelo com este nome." };
      return resultado(error);
    }
    await recarregarCatalogosRh();
    return { ok: true };
  },

  async salvarItemModelo(input: Omit<ChecklistModeloItem, "id">, id?: string) {
    const linha = {
      modelo_id: input.modeloId,
      titulo: input.titulo.trim(),
      categoria: input.categoria,
      tipo_documento_id: input.tipoDocumentoId,
      obrigatorio: input.obrigatorio,
      responsavel_padrao: input.responsavelPadrao,
      ordem: input.ordem,
      instrucoes: input.instrucoes,
      ativo: input.ativo,
    };
    const { error } = id
      ? await supabase.from("rh_checklist_modelo_itens").update(linha).eq("id", id)
      : await supabase.from("rh_checklist_modelo_itens").insert(linha);
    if (error) {
      if (error.code === "23505")
        return { ok: false, erro: "Este modelo já tem um item com esse título." };
      return resultado(error);
    }
    await recarregarCatalogosRh();
    return { ok: true };
  },

  async inativarItemModelo(id: string) {
    const { error } = await supabase
      .from("rh_checklist_modelo_itens")
      .update({ ativo: false })
      .eq("id", id);
    if (!error) await recarregarCatalogosRh();
    return resultado(error);
  },
};
