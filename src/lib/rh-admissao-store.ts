// ============================================================
// Store de admissões — o checklist que vira colaborador
// ------------------------------------------------------------
// Duas coisas aqui NÃO são UPDATE, e sim função no banco:
//
//   status da admissão  → rh_mover_admissao(), que exige nota
//   conclusão           → rh_concluir_admissao(), que confere o
//                         checklist inteiro, exige ASO e contrato
//                         aprovados e anexados, cria o colaborador a
//                         partir do candidato, gera matrícula, migra
//                         os documentos e move a candidatura para
//                         "Contratado" — tudo numa transação só.
//
// Se a conclusão fosse feita daqui, em vários passos, uma queda de
// rede no meio deixaria colaborador criado sem admissão fechada, ou
// admissão fechada sem colaborador. Por isso é uma chamada só.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Resultado } from "@/lib/rh-store";

function toastErr(msg: string, err: { message?: string } | null | undefined) {
  if (err) toast.error(`${msg}: ${err.message ?? "erro desconhecido"}`);
}

function falha<T = void>(err: { message?: string } | null | undefined): Resultado<T> {
  return { ok: false, erro: err?.message ?? "erro desconhecido" };
}

// ============================================================
// Tipos
// ============================================================
export type AdmissaoStatus =
  | "aberta"
  | "aguardando_candidato"
  | "em_conferencia"
  | "aguardando_exame"
  | "pronta"
  | "concluida"
  | "cancelada";

export type ItemStatus = "pendente" | "enviado" | "aprovado" | "reprovado" | "dispensado";
export type ItemCategoria = "documento" | "exame" | "treinamento" | "epi" | "sistema" | "contrato";

export type Admissao = {
  id: string;
  codigo: string;
  candidaturaId: string | null;
  candidatoId: string;
  funcionarioId: string | null;
  cargoId: string | null;
  setor: string;
  projetoId: string | null;
  gestorId: string | null;
  tipoContratacao: string;
  jornada: string;
  dataPrevistaAdmissao: string | null;
  dataEfetivaAdmissao: string | null;
  periodoExperiencia: string;
  dataFimExperiencia1: string | null;
  dataFimExperiencia2: string | null;
  valeTransporte: boolean;
  valeRefeicao: boolean;
  observacoes: string;
  status: AdmissaoStatus;
  motivoCancelamento: string;
  responsavelId: string | null;
  checklistModeloId: string | null;
  ativo: boolean;
  criadaEm: string;
  /** Só para Diretoria e RH — mora em rh_admissao_proposta. */
  salario: number | null;
  validadeProposta: string | null;
};

export type AdmissaoItem = {
  id: string;
  admissaoId: string;
  titulo: string;
  categoria: ItemCategoria;
  tipoDocumentoId: string | null;
  obrigatorio: boolean;
  responsavel: "rh" | "candidato" | "almoxarifado" | "gestor";
  status: ItemStatus;
  arquivoPath: string | null;
  dataDocumento: string | null;
  dataVencimento: string | null;
  observacao: string;
  instrucoes: string;
  conferidoPorId: string | null;
  conferidoEm: string | null;
  ordem: number;
};

export type HistoricoAdmissao = {
  id: string;
  admissaoId: string;
  statusAnterior: string;
  statusNovo: string;
  nota: string;
  autorNome: string;
  criadoEm: string;
};

type State = {
  carregado: boolean;
  carregando: boolean;
  admissoes: Admissao[];
  itens: AdmissaoItem[];
};

const SSR: State = { carregado: false, carregando: false, admissoes: [], itens: [] };

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
const int = (v: unknown) => Number(v ?? 0) || 0;
const dec = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

function mapAdmissao(
  r: Row,
  proposta?: { salario: unknown; validade_proposta: unknown },
): Admissao {
  return {
    id: txt(r.id),
    codigo: txt(r.codigo),
    candidaturaId: opt(r.candidatura_id),
    candidatoId: txt(r.candidato_id),
    funcionarioId: opt(r.funcionario_id),
    cargoId: opt(r.cargo_id),
    setor: txt(r.setor),
    projetoId: opt(r.projeto_id),
    gestorId: opt(r.gestor_id),
    tipoContratacao: txt(r.tipo_contratacao) || "clt",
    jornada: txt(r.jornada),
    dataPrevistaAdmissao: opt(r.data_prevista_admissao),
    dataEfetivaAdmissao: opt(r.data_efetiva_admissao),
    periodoExperiencia: txt(r.periodo_experiencia) || "30_60",
    dataFimExperiencia1: opt(r.data_fim_experiencia_1),
    dataFimExperiencia2: opt(r.data_fim_experiencia_2),
    valeTransporte: Boolean(r.vale_transporte),
    valeRefeicao: Boolean(r.vale_refeicao),
    observacoes: txt(r.observacoes),
    status: (txt(r.status) || "aberta") as AdmissaoStatus,
    motivoCancelamento: txt(r.motivo_cancelamento),
    responsavelId: opt(r.responsavel_id),
    checklistModeloId: opt(r.checklist_modelo_id),
    ativo: r.ativo !== false,
    criadaEm: txt(r.created_at),
    salario: proposta ? dec(proposta.salario) : null,
    validadeProposta: proposta ? opt(proposta.validade_proposta) : null,
  };
}

function mapItem(r: Row): AdmissaoItem {
  return {
    id: txt(r.id),
    admissaoId: txt(r.admissao_id),
    titulo: txt(r.titulo),
    categoria: (txt(r.categoria) || "documento") as ItemCategoria,
    tipoDocumentoId: opt(r.tipo_documento_id),
    obrigatorio: r.obrigatorio !== false,
    responsavel: (txt(r.responsavel) || "rh") as AdmissaoItem["responsavel"],
    status: (txt(r.status) || "pendente") as ItemStatus,
    arquivoPath: opt(r.arquivo_path),
    dataDocumento: opt(r.data_documento),
    dataVencimento: opt(r.data_vencimento),
    observacao: txt(r.observacao),
    instrucoes: txt(r.instrucoes),
    conferidoPorId: opt(r.conferido_por_id),
    conferidoEm: opt(r.conferido_em),
    ordem: int(r.ordem),
  };
}

// ============================================================
// Carga
// ============================================================
async function fetchAdmissoes() {
  if (state.carregando) return;
  state = { ...state, carregando: true };
  emit();
  try {
    const [ad, pr, it] = await Promise.all([
      supabase.from("rh_admissoes").select("*").order("created_at", { ascending: false }),
      // Salário: RLS devolve vazio para quem não é Diretoria nem RH.
      supabase.from("rh_admissao_proposta").select("*"),
      supabase.from("rh_admissao_itens").select("*").order("ordem", { ascending: true }),
    ]);
    toastErr("Falha ao carregar admissões", ad.error);
    toastErr("Falha ao carregar o checklist", it.error);

    const propostas = new Map<string, { salario: unknown; validade_proposta: unknown }>();
    for (const p of (pr.data ?? []) as Row[]) {
      propostas.set(txt(p.admissao_id), {
        salario: p.salario,
        validade_proposta: p.validade_proposta,
      });
    }

    state = {
      carregado: true,
      carregando: false,
      admissoes: ((ad.data ?? []) as Row[]).map((r) => mapAdmissao(r, propostas.get(txt(r.id)))),
      itens: ((it.data ?? []) as Row[]).map(mapItem),
    };
    emit();
  } catch (err) {
    console.error("[rh-admissao-store] fetchAdmissoes:", err);
    state = { ...state, carregando: false };
    emit();
  }
}

export async function recarregarAdmissoes() {
  await fetchAdmissoes();
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

export function useAdmissoes<T>(selector: (s: State) => T): T {
  const selRef = useRef(selector);
  selRef.current = selector;
  const [value, setValue] = useState<T>(() => selector(state));
  useEffect(() => {
    if (!state.carregado && !state.carregando) void fetchAdmissoes();
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
// Seletores
// ============================================================
export function itensDaAdmissao(s: State, admissaoId: string): AdmissaoItem[] {
  return s.itens.filter((i) => i.admissaoId === admissaoId);
}

export type Progresso = {
  obrigatorios: number;
  concluidos: number;
  pct: number;
  /** O primeiro item obrigatório que ainda trava a conclusão. */
  travando: AdmissaoItem | null;
  pendentes: AdmissaoItem[];
};

/** Um item obrigatório só deixa de travar quando é aprovado ou dispensado. */
export function progressoDaAdmissao(itens: AdmissaoItem[]): Progresso {
  const obrig = itens.filter((i) => i.obrigatorio);
  const resolvido = (i: AdmissaoItem) => i.status === "aprovado" || i.status === "dispensado";
  const pendentes = obrig.filter((i) => !resolvido(i)).sort((a, b) => a.ordem - b.ordem);
  const concluidos = obrig.length - pendentes.length;
  return {
    obrigatorios: obrig.length,
    concluidos,
    pct: obrig.length === 0 ? 0 : Math.round((concluidos / obrig.length) * 100),
    travando: pendentes[0] ?? null,
    pendentes,
  };
}

/**
 * O que ainda impede a conclusão, em texto — é o que vai no tooltip do
 * botão desabilitado. A lista é a mesma que rh_concluir_admissao usa
 * para recusar; se as duas discordarem, a do banco é a que vale.
 */
export function bloqueiosDaConclusao(itens: AdmissaoItem[]): string[] {
  const bloqueios: string[] = [];
  const { pendentes } = progressoDaAdmissao(itens);
  for (const p of pendentes) bloqueios.push(p.titulo);

  const aso = itens.find(
    (i) =>
      i.categoria === "exame" &&
      i.status === "aprovado" &&
      i.arquivoPath &&
      (!i.dataVencimento || i.dataVencimento >= new Date().toISOString().slice(0, 10)),
  );
  if (!aso) bloqueios.push("Exame admissional (ASO) aprovado, anexado e dentro da validade");

  const contrato = itens.find(
    (i) => i.categoria === "contrato" && i.status === "aprovado" && i.arquivoPath,
  );
  if (!contrato) bloqueios.push("Contrato ou ficha de registro assinada, anexada");

  // Sem duplicar: o ASO e o contrato costumam já estar na lista de pendentes.
  return [...new Set(bloqueios)];
}

// ============================================================
// Ações
// ============================================================
export type AdmissaoInput = {
  candidatoId: string;
  candidaturaId: string | null;
  cargoId: string | null;
  setor: string;
  projetoId: string | null;
  gestorId: string | null;
  tipoContratacao: string;
  jornada: string;
  dataPrevistaAdmissao: string | null;
  periodoExperiencia: string;
  valeTransporte: boolean;
  valeRefeicao: boolean;
  observacoes: string;
  checklistModeloId: string | null;
  salario: number | null;
  validadeProposta: string | null;
};

function payload(input: AdmissaoInput) {
  return {
    candidato_id: input.candidatoId,
    candidatura_id: input.candidaturaId,
    cargo_id: input.cargoId,
    setor: input.setor,
    projeto_id: input.projetoId,
    gestor_id: input.gestorId,
    tipo_contratacao: input.tipoContratacao,
    jornada: input.jornada,
    data_prevista_admissao: input.dataPrevistaAdmissao,
    periodo_experiencia: input.periodoExperiencia,
    // As datas de fim de experiência saem da data prevista: 30+60 ou 45+45.
    data_fim_experiencia_1: fimExperiencia(input.dataPrevistaAdmissao, input.periodoExperiencia, 1),
    data_fim_experiencia_2: fimExperiencia(input.dataPrevistaAdmissao, input.periodoExperiencia, 2),
    vale_transporte: input.valeTransporte,
    vale_refeicao: input.valeRefeicao,
    observacoes: input.observacoes,
    checklist_modelo_id: input.checklistModeloId,
  };
}

/** 30_60 → 30 dias e depois mais 60; 45_45 → 45 e mais 45. */
export function fimExperiencia(
  inicio: string | null,
  periodo: string,
  etapa: 1 | 2,
): string | null {
  if (!inicio || periodo === "nao_se_aplica") return null;
  const [a, b] = periodo === "45_45" ? [45, 45] : [30, 60];
  const dias = etapa === 1 ? a : a + b;
  const d = new Date(`${inicio}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

async function salvarProposta(admissaoId: string, salario: number | null, validade: string | null) {
  if (salario === null && validade === null) return;
  await supabase
    .from("rh_admissao_proposta")
    .upsert(
      { admissao_id: admissaoId, salario, validade_proposta: validade },
      { onConflict: "admissao_id" },
    );
}

export const admissaoActions = {
  /** Abre a admissão e já monta o checklist a partir do modelo do cargo. */
  async abrir(input: AdmissaoInput): Promise<Resultado<string>> {
    const { data, error } = await supabase
      .from("rh_admissoes")
      .insert(payload(input))
      .select("id")
      .single();
    if (error) return falha<string>(error);
    const id = txt((data as Row).id);
    await salvarProposta(id, input.salario, input.validadeProposta);

    const { error: erroChecklist } = await supabase.rpc("rh_gerar_checklist_admissao", {
      p_admissao: id,
    });
    if (erroChecklist) {
      // A admissão existe; só o checklist falhou. Dizer isso é melhor
      // que fingir sucesso e deixar a tela abrir vazia.
      toast.error(`Admissão criada, mas o checklist não foi montado: ${erroChecklist.message}`);
    }
    await fetchAdmissoes();
    return { ok: true, dado: id };
  },

  async atualizar(id: string, input: AdmissaoInput): Promise<Resultado> {
    const { error } = await supabase.from("rh_admissoes").update(payload(input)).eq("id", id);
    if (error) return falha(error);
    await salvarProposta(id, input.salario, input.validadeProposta);
    await fetchAdmissoes();
    return { ok: true };
  },

  /** Regenera o checklist — usado quando o cargo muda depois de aberta. */
  async regerarChecklist(id: string): Promise<Resultado> {
    const { error } = await supabase.rpc("rh_gerar_checklist_admissao", { p_admissao: id });
    if (error) return falha(error);
    await fetchAdmissoes();
    return { ok: true };
  },

  async mover(id: string, status: AdmissaoStatus, nota: string): Promise<Resultado> {
    const { error } = await supabase.rpc("rh_mover_admissao", {
      p_admissao: id,
      p_status: status,
      p_nota: nota,
    });
    if (error) return falha(error);
    await fetchAdmissoes();
    return { ok: true };
  },

  /** A conclusão inteira acontece no banco, numa transação só. */
  async concluir(id: string, nota: string): Promise<Resultado<string>> {
    const { data, error } = await supabase.rpc("rh_concluir_admissao", {
      p_admissao: id,
      p_nota: nota,
    });
    if (error) return falha<string>(error);
    await fetchAdmissoes();
    const func = data as Row | null;
    return { ok: true, dado: func ? txt(func.id) : undefined };
  },

  async salvarItem(
    itemId: string,
    patch: Partial<{
      status: ItemStatus;
      dataDocumento: string | null;
      dataVencimento: string | null;
      observacao: string;
      arquivoPath: string | null;
    }>,
  ): Promise<Resultado> {
    const linha: Row = {};
    if (patch.status !== undefined) linha.status = patch.status;
    if (patch.dataDocumento !== undefined) linha.data_documento = patch.dataDocumento;
    if (patch.dataVencimento !== undefined) linha.data_vencimento = patch.dataVencimento;
    if (patch.observacao !== undefined) linha.observacao = patch.observacao;
    if (patch.arquivoPath !== undefined) linha.arquivo_path = patch.arquivoPath;
    const { error } = await supabase.from("rh_admissao_itens").update(linha).eq("id", itemId);
    if (error) return falha(error);
    await fetchAdmissoes();
    return { ok: true };
  },

  /**
   * Sobe o arquivo e marca o item como enviado.
   *
   * O caminho começa pelo ID do candidato de propósito: a policy do
   * bucket deixa o próprio candidato escrever só dentro da pasta dele,
   * e é assim que a área do candidato (Etapa 4) vai enviar documento
   * sem precisar de política nova.
   */
  async enviarArquivo(item: AdmissaoItem, candidatoId: string, arquivo: File): Promise<Resultado> {
    const limite = 10 * 1024 * 1024;
    if (arquivo.size > limite) {
      return { ok: false, erro: "Arquivo acima de 10 MB. Reduza o tamanho ou envie em partes." };
    }
    const extensao =
      arquivo.name
        .split(".")
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "bin";
    const caminho = `${candidatoId}/admissao/${item.id}.${extensao}`;

    const { error: erroUpload } = await supabase.storage
      .from("documentos-rh")
      .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type || undefined });
    if (erroUpload) return falha(erroUpload);

    const { error } = await supabase
      .from("rh_admissao_itens")
      .update({
        arquivo_path: caminho,
        status: item.status === "aprovado" ? "aprovado" : "enviado",
      })
      .eq("id", item.id);
    if (error) return falha(error);
    await fetchAdmissoes();
    return { ok: true };
  },
};

export async function listarHistoricoAdmissao(admissaoId: string): Promise<HistoricoAdmissao[]> {
  const { data, error } = await supabase
    .from("rh_admissao_historico")
    .select("*")
    .eq("admissao_id", admissaoId)
    .order("created_at", { ascending: false });
  toastErr("Falha ao carregar o histórico da admissão", error);
  return ((data ?? []) as Row[]).map((r) => ({
    id: txt(r.id),
    admissaoId: txt(r.admissao_id),
    statusAnterior: txt(r.status_anterior),
    statusNovo: txt(r.status_novo),
    nota: txt(r.nota),
    autorNome: txt(r.autor_nome),
    criadoEm: txt(r.created_at),
  }));
}

export const ADMISSAO_STATUS_LABEL: Record<string, string> = {
  aberta: "Aberta",
  aguardando_candidato: "Aguardando candidato",
  em_conferencia: "Em conferência",
  aguardando_exame: "Aguardando exame",
  pronta: "Pronta",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const ADMISSAO_STATUS_ESTILO: Record<string, string> = {
  aberta: "bg-sky-100 text-sky-800",
  aguardando_candidato: "bg-amber-100 text-amber-800",
  em_conferencia: "bg-amber-100 text-amber-800",
  aguardando_exame: "bg-amber-100 text-amber-800",
  pronta: "bg-emerald-100 text-emerald-800",
  concluida: "bg-slate-100 text-slate-600",
  cancelada: "bg-red-100 text-red-700",
};

export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  pendente: "Pendente",
  enviado: "Enviado",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  dispensado: "Dispensado",
};

export const CATEGORIA_LABEL: Record<ItemCategoria, string> = {
  documento: "Documentos",
  exame: "Exames",
  treinamento: "Treinamentos e NRs",
  epi: "EPIs",
  contrato: "Contrato",
  sistema: "Cadastros e sistemas",
};

export const RESPONSAVEL_LABEL: Record<string, string> = {
  rh: "RH",
  candidato: "Candidato",
  almoxarifado: "Almoxarifado",
  gestor: "Gestor da obra",
};

export const PERIODO_EXPERIENCIA_LABEL: Record<string, string> = {
  "30_60": "30 + 60 dias",
  "45_45": "45 + 45 dias",
  nao_se_aplica: "Não se aplica",
};
