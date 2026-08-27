// ============================================================
// Store de recrutamento — vagas, candidatos, funil e pareceres
// ------------------------------------------------------------
// Segue o padrão dos outros stores do portal (estado em módulo,
// subscribe/emit, hook com equality shallow), com duas diferenças que
// vêm do desenho do banco:
//
// 1. Carrega sob demanda, e não no import. Quem não é do RH leva erro
//    de permissão nessas tabelas; carregar no import faria o toast de
//    erro aparecer no login de todo mundo.
//
// 2. Mudança de etapa, de status de vaga e de status de admissão NÃO
//    são UPDATE. São chamadas de função no banco (rh_mover_*), que
//    gravam a nota obrigatória na mesma transação. Um UPDATE direto é
//    recusado por trigger — de propósito, e vale para o administrador
//    também. Por isso este arquivo quase não tem .update() de status.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { mediaCriterios, papelRh, type CriterioNota, type PapelRh } from "@/lib/rh-regras";
import { useCurrentUser } from "@/lib/current-user";

function toastErr(msg: string, err: { message?: string } | null | undefined) {
  if (err) toast.error(`${msg}: ${err.message ?? "erro desconhecido"}`);
}

/** Resultado padrão das ações: quem chama decide o que fazer com o erro. */
export type Resultado<T = void> = { ok: boolean; erro?: string; dado?: T };

function falha<T = void>(err: { message?: string } | null | undefined): Resultado<T> {
  return { ok: false, erro: err?.message ?? "erro desconhecido" };
}

// ============================================================
// Tipos
// ============================================================
export type VagaStatus =
  | "rascunho"
  | "aguardando_aprovacao"
  | "aprovada"
  | "publicada"
  | "congelada"
  | "encerrada"
  | "cancelada";

export type Vaga = {
  id: string;
  codigo: string;
  titulo: string;
  cargoId: string | null;
  setor: string;
  projetoId: string | null;
  tipoContratacao: string;
  quantidadePosicoes: number;
  quantidadePreenchida: number;
  jornada: string;
  localTrabalho: string;
  cidade: string;
  uf: string;
  salarioConfidencial: boolean;
  beneficios: string;
  descricao: string;
  requisitos: string;
  diferenciais: string;
  motivoAbertura: string;
  substituindoFuncionarioId: string | null;
  dataAbertura: string;
  dataPrevistaInicio: string | null;
  dataLimite: string | null;
  dataEncerramento: string | null;
  status: VagaStatus;
  publicadaSite: boolean;
  slug: string | null;
  solicitanteId: string | null;
  aprovadorId: string | null;
  dataAprovacao: string | null;
  responsavelRhId: string | null;
  ativo: boolean;
  criadaEm: string;
  /** Só chega para Diretoria e RH. Para os demais a RLS devolve vazio. */
  faixaMin: number | null;
  faixaMax: number | null;
};

export type Candidato = {
  id: string;
  nome: string;
  cpf: string;
  rg: string;
  dataNascimento: string | null;
  email: string;
  telefone: string;
  whatsapp: string;
  cidade: string;
  uf: string;
  /** jsonb livre: logradouro, numero, bairro, cep. Vem do formulário público. */
  endereco: Record<string, unknown>;
  cargoPretendido: string;
  disponibilidade: string;
  disponibilidadeViagem: boolean;
  possuiCnh: boolean;
  categoriaCnh: string;
  nrsDeclaradas: unknown;
  escolaridade: string;
  experienciaResumo: string;
  linkedin: string;
  curriculoPath: string | null;
  fotoPath: string | null;
  origem: string;
  origemDetalhe: string;
  indicadoPor: string;
  observacoes: string;
  status: string;
  funcionarioId: string | null;
  lgpdConsentimento: boolean;
  lgpdData: string | null;
  lgpdRetencaoAte: string | null;
  anonimizadoEm: string | null;
  ativo: boolean;
  criadoEm: string;
  /** Só para Diretoria e RH, como a faixa da vaga. */
  pretensao: number | null;
};

/** Uma linha de vw_rh_funil: candidatura + candidato + vaga + etapa, já com o semáforo. */
export type FunilItem = {
  candidaturaId: string;
  candidatoId: string;
  vagaId: string;
  etapaId: string;
  status: string;
  dataInscricao: string;
  dataUltimaMovimentacao: string;
  score: number | null;
  responsavelId: string | null;
  origem: string;
  admissaoId: string | null;
  candidatoNome: string;
  cidade: string;
  uf: string;
  cargoPretendido: string;
  telefone: string;
  whatsapp: string;
  email: string;
  nrsDeclaradas: unknown;
  fotoPath: string | null;
  curriculoPath: string | null;
  disponibilidade: string;
  candidatoStatus: string;
  vagaCodigo: string;
  vagaTitulo: string;
  projetoId: string | null;
  cargoId: string | null;
  vagaStatus: string;
  etapaNome: string;
  etapaOrdem: number;
  etapaTipo: string;
  slaDias: number;
  etapaCor: string;
  diasNaEtapa: number;
  semaforo: "neutro" | "alerta" | "critico";
};

export type Avaliacao = {
  id: string;
  candidaturaId: string;
  tipo: string;
  avaliadorId: string | null;
  avaliadorNome: string;
  dataHora: string | null;
  local: string;
  criterios: CriterioNota[];
  notaFinal: number | null;
  parecer: string;
  recomendacao: string | null;
  status: string;
  criadaEm: string;
};

export type HistoricoCandidatura = {
  id: string;
  candidaturaId: string;
  etapaAnteriorId: string | null;
  etapaNovaId: string | null;
  statusAnterior: string;
  statusNovo: string;
  nota: string;
  autorNome: string;
  criadoEm: string;
};

export type HistoricoVaga = {
  id: string;
  vagaId: string;
  statusAnterior: string;
  statusNovo: string;
  nota: string;
  autorNome: string;
  criadoEm: string;
};

export type Referencia = { id: string; nome: string };

type State = {
  carregado: boolean;
  carregando: boolean;
  vagas: Vaga[];
  candidatos: Candidato[];
  funil: FunilItem[];
  avaliacoes: Avaliacao[];
  projetos: Referencia[];
  pessoas: Referencia[];
};

const SSR: State = {
  carregado: false,
  carregando: false,
  vagas: [],
  candidatos: [],
  funil: [],
  avaliacoes: [],
  projetos: [],
  pessoas: [],
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

// ============================================================
// Mapeamento das linhas
// ============================================================
type Row = Record<string, unknown>;
const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const opt = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const int = (v: unknown) => Number(v ?? 0) || 0;
const dec = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

function mapVaga(r: Row, faixa?: { minimo: unknown; maximo: unknown }): Vaga {
  return {
    id: txt(r.id),
    codigo: txt(r.codigo),
    titulo: txt(r.titulo),
    cargoId: opt(r.cargo_id),
    setor: txt(r.setor),
    projetoId: opt(r.projeto_id),
    tipoContratacao: txt(r.tipo_contratacao) || "clt",
    quantidadePosicoes: int(r.quantidade_posicoes) || 1,
    quantidadePreenchida: int(r.quantidade_preenchida),
    jornada: txt(r.jornada),
    localTrabalho: txt(r.local_trabalho),
    cidade: txt(r.cidade),
    uf: txt(r.uf),
    salarioConfidencial: r.salario_confidencial !== false,
    beneficios: txt(r.beneficios),
    descricao: txt(r.descricao),
    requisitos: txt(r.requisitos),
    diferenciais: txt(r.diferenciais),
    motivoAbertura: txt(r.motivo_abertura) || "aumento_quadro",
    substituindoFuncionarioId: opt(r.substituindo_funcionario_id),
    dataAbertura: txt(r.data_abertura),
    dataPrevistaInicio: opt(r.data_prevista_inicio),
    dataLimite: opt(r.data_limite),
    dataEncerramento: opt(r.data_encerramento),
    status: (txt(r.status) || "rascunho") as VagaStatus,
    publicadaSite: Boolean(r.publicada_site),
    slug: opt(r.slug),
    solicitanteId: opt(r.solicitante_id),
    aprovadorId: opt(r.aprovador_id),
    dataAprovacao: opt(r.data_aprovacao),
    responsavelRhId: opt(r.responsavel_rh_id),
    ativo: r.ativo !== false,
    criadaEm: txt(r.created_at),
    faixaMin: faixa ? dec(faixa.minimo) : null,
    faixaMax: faixa ? dec(faixa.maximo) : null,
  };
}

function mapCandidato(r: Row, pretensao?: unknown): Candidato {
  return {
    id: txt(r.id),
    nome: txt(r.nome),
    cpf: txt(r.cpf),
    rg: txt(r.rg),
    dataNascimento: opt(r.data_nascimento),
    email: txt(r.email),
    telefone: txt(r.telefone),
    whatsapp: txt(r.whatsapp),
    cidade: txt(r.cidade),
    uf: txt(r.uf),
    endereco: (r.endereco && typeof r.endereco === "object" ? r.endereco : {}) as Record<
      string,
      unknown
    >,
    cargoPretendido: txt(r.cargo_pretendido),
    disponibilidade: txt(r.disponibilidade) || "a_combinar",
    disponibilidadeViagem: Boolean(r.disponibilidade_viagem),
    possuiCnh: Boolean(r.possui_cnh),
    categoriaCnh: txt(r.categoria_cnh),
    nrsDeclaradas: r.nrs_declaradas ?? [],
    escolaridade: txt(r.escolaridade),
    experienciaResumo: txt(r.experiencia_resumo),
    linkedin: txt(r.linkedin),
    curriculoPath: opt(r.curriculo_path),
    fotoPath: opt(r.foto_path),
    origem: txt(r.origem) || "cadastro_interno",
    origemDetalhe: txt(r.origem_detalhe),
    indicadoPor: txt(r.indicado_por),
    observacoes: txt(r.observacoes),
    status: txt(r.status) || "ativo",
    funcionarioId: opt(r.funcionario_id),
    lgpdConsentimento: Boolean(r.lgpd_consentimento),
    lgpdData: opt(r.lgpd_data),
    lgpdRetencaoAte: opt(r.lgpd_retencao_ate),
    anonimizadoEm: opt(r.anonimizado_em),
    ativo: r.ativo !== false,
    criadoEm: txt(r.created_at),
    pretensao: pretensao === undefined ? null : dec(pretensao),
  };
}

function mapFunil(r: Row): FunilItem {
  return {
    candidaturaId: txt(r.candidatura_id),
    candidatoId: txt(r.candidato_id),
    vagaId: txt(r.vaga_id),
    etapaId: txt(r.etapa_id),
    status: txt(r.status),
    dataInscricao: txt(r.data_inscricao),
    dataUltimaMovimentacao: txt(r.data_ultima_movimentacao),
    score: dec(r.score),
    responsavelId: opt(r.responsavel_id),
    origem: txt(r.origem),
    admissaoId: opt(r.admissao_id),
    candidatoNome: txt(r.candidato_nome),
    cidade: txt(r.cidade),
    uf: txt(r.uf),
    cargoPretendido: txt(r.cargo_pretendido),
    telefone: txt(r.telefone),
    whatsapp: txt(r.whatsapp),
    email: txt(r.email),
    nrsDeclaradas: r.nrs_declaradas ?? [],
    fotoPath: opt(r.foto_path),
    curriculoPath: opt(r.curriculo_path),
    disponibilidade: txt(r.disponibilidade),
    candidatoStatus: txt(r.candidato_status),
    vagaCodigo: txt(r.vaga_codigo),
    vagaTitulo: txt(r.vaga_titulo),
    projetoId: opt(r.projeto_id),
    cargoId: opt(r.cargo_id),
    vagaStatus: txt(r.vaga_status),
    etapaNome: txt(r.etapa_nome),
    etapaOrdem: int(r.etapa_ordem),
    etapaTipo: txt(r.etapa_tipo),
    slaDias: int(r.sla_dias),
    etapaCor: txt(r.etapa_cor) || "#1F3367",
    diasNaEtapa: int(r.dias_na_etapa),
    semaforo: (txt(r.semaforo) || "neutro") as FunilItem["semaforo"],
  };
}

function mapAvaliacao(r: Row): Avaliacao {
  return {
    id: txt(r.id),
    candidaturaId: txt(r.candidatura_id),
    tipo: txt(r.tipo),
    avaliadorId: opt(r.avaliador_id),
    avaliadorNome: txt(r.avaliador_nome),
    dataHora: opt(r.data_hora),
    local: txt(r.local),
    criterios: Array.isArray(r.criterios) ? (r.criterios as CriterioNota[]) : [],
    notaFinal: dec(r.nota_final),
    parecer: txt(r.parecer),
    recomendacao: opt(r.recomendacao),
    status: txt(r.status) || "agendada",
    criadaEm: txt(r.created_at),
  };
}

// ============================================================
// Carga
// ============================================================
async function fetchTudo() {
  if (state.carregando) return;
  state = { ...state, carregando: true };
  emit();
  try {
    const [vg, vfx, cd, cpr, fn, av, pj, pf] = await Promise.all([
      supabase.from("rh_vagas").select("*").order("created_at", { ascending: false }),
      supabase.from("rh_vaga_faixa").select("*"),
      supabase.from("rh_candidatos").select("*").order("nome", { ascending: true }),
      supabase.from("rh_candidato_pretensao").select("*"),
      supabase.from("vw_rh_funil").select("*"),
      supabase.from("rh_avaliacoes").select("*").order("created_at", { ascending: false }),
      supabase.from("projetos").select("id, nome").order("nome", { ascending: true }),
      supabase.from("profiles").select("id, nome").order("nome", { ascending: true }),
    ]);
    toastErr("Falha ao carregar vagas", vg.error);
    toastErr("Falha ao carregar candidatos", cd.error);
    toastErr("Falha ao carregar o funil", fn.error);
    toastErr("Falha ao carregar pareceres", av.error);

    const faixas = new Map<string, { minimo: unknown; maximo: unknown }>();
    for (const f of (vfx.data ?? []) as Row[])
      faixas.set(txt(f.vaga_id), { minimo: f.minimo, maximo: f.maximo });
    const pretensoes = new Map<string, unknown>();
    for (const p of (cpr.data ?? []) as Row[]) pretensoes.set(txt(p.candidato_id), p.valor);

    state = {
      carregado: true,
      carregando: false,
      vagas: ((vg.data ?? []) as Row[]).map((r) => mapVaga(r, faixas.get(txt(r.id)))),
      candidatos: ((cd.data ?? []) as Row[]).map((r) => mapCandidato(r, pretensoes.get(txt(r.id)))),
      funil: ((fn.data ?? []) as Row[]).map(mapFunil),
      avaliacoes: ((av.data ?? []) as Row[]).map(mapAvaliacao),
      projetos: ((pj.data ?? []) as Row[]).map((r) => ({ id: txt(r.id), nome: txt(r.nome) })),
      pessoas: ((pf.data ?? []) as Row[]).map((r) => ({ id: txt(r.id), nome: txt(r.nome) })),
    };
    emit();
  } catch (err) {
    console.error("[rh-store] fetchTudo:", err);
    state = { ...state, carregando: false };
    emit();
  }
}

export async function recarregarRh() {
  await fetchTudo();
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

export function useRhStore<T>(selector: (s: State) => T): T {
  const selRef = useRef(selector);
  selRef.current = selector;
  const [value, setValue] = useState<T>(() => selector(state));
  useEffect(() => {
    if (!state.carregado && !state.carregando) void fetchTudo();
    const check = () => {
      const next = selRef.current(state);
      setValue((prev) => (shallowEqual(prev, next) ? prev : next));
    };
    check();
    return subscribe(check);
  }, []);
  return value;
}

/** O que o usuário logado pode fazer no módulo. Ver papelRh(). */
export function usePapelRh(): PapelRh {
  const user = useCurrentUser();
  return papelRh(user.perfil);
}

/**
 * Currículo e documentos ficam em bucket privado: não existe URL fixa,
 * só link assinado com validade curta. Nulo quando não há arquivo ou
 * quando o usuário não tem permissão no bucket.
 */
export async function urlAssinada(
  bucket: string,
  path: string | null,
  segundos = 120,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, segundos);
  if (error) {
    toast.error(`Não foi possível abrir o arquivo: ${error.message}`);
    return null;
  }
  return data?.signedUrl ?? null;
}

// ============================================================
// Seletores
// ============================================================
export function vagaPorId(s: State, id: string | null): Vaga | undefined {
  return id ? s.vagas.find((v) => v.id === id) : undefined;
}

export function candidatoPorId(s: State, id: string | null): Candidato | undefined {
  return id ? s.candidatos.find((c) => c.id === id) : undefined;
}

export function nomeDoProjeto(s: State, id: string | null): string {
  if (!id) return "—";
  return s.projetos.find((p) => p.id === id)?.nome ?? "—";
}

export function nomeDaPessoa(s: State, id: string | null): string {
  if (!id) return "—";
  return s.pessoas.find((p) => p.id === id)?.nome ?? "—";
}

export function funilDaVaga(s: State, vagaId: string): FunilItem[] {
  return s.funil.filter((f) => f.vagaId === vagaId);
}

export function candidaturasDoCandidato(s: State, candidatoId: string): FunilItem[] {
  return s.funil.filter((f) => f.candidatoId === candidatoId);
}

export function avaliacoesDaCandidatura(s: State, candidaturaId: string): Avaliacao[] {
  return s.avaliacoes.filter((a) => a.candidaturaId === candidaturaId);
}

/** Quantos candidatos vivos (fora das etapas finais) cada vaga tem. */
export function candidatosEmProcesso(s: State, vagaId: string): number {
  return s.funil.filter((f) => f.vagaId === vagaId && f.status === "em_andamento").length;
}

/**
 * Regra 11: CPF é único. Antes de gravar, procura na base carregada
 * para poder oferecer o cadastro existente em vez de deixar o banco
 * devolver "duplicate key" na cara do usuário.
 */
export function candidatoPorCpf(s: State, cpf: string): Candidato | undefined {
  const alvo = (cpf ?? "").replace(/\D/g, "");
  if (alvo.length !== 11) return undefined;
  return s.candidatos.find((c) => c.cpf.replace(/\D/g, "") === alvo);
}

// ============================================================
// Ações — vagas
// ============================================================
export type VagaInput = {
  titulo: string;
  cargoId: string | null;
  setor: string;
  projetoId: string | null;
  tipoContratacao: string;
  quantidadePosicoes: number;
  jornada: string;
  localTrabalho: string;
  cidade: string;
  uf: string;
  salarioConfidencial: boolean;
  beneficios: string;
  descricao: string;
  requisitos: string;
  diferenciais: string;
  motivoAbertura: string;
  dataPrevistaInicio: string | null;
  dataLimite: string | null;
  responsavelRhId: string | null;
  faixaMin: number | null;
  faixaMax: number | null;
};

function payloadVaga(input: VagaInput) {
  return {
    titulo: input.titulo.trim(),
    cargo_id: input.cargoId,
    setor: input.setor,
    projeto_id: input.projetoId,
    tipo_contratacao: input.tipoContratacao,
    quantidade_posicoes: Math.max(1, input.quantidadePosicoes),
    jornada: input.jornada,
    local_trabalho: input.localTrabalho,
    cidade: input.cidade,
    uf: input.uf.toUpperCase().slice(0, 2),
    salario_confidencial: input.salarioConfidencial,
    beneficios: input.beneficios,
    descricao: input.descricao,
    requisitos: input.requisitos,
    diferenciais: input.diferenciais,
    motivo_abertura: input.motivoAbertura,
    data_prevista_inicio: input.dataPrevistaInicio,
    data_limite: input.dataLimite,
    responsavel_rh_id: input.responsavelRhId,
  };
}

/**
 * A faixa salarial mora em rh_vaga_faixa. Quem não é Diretoria nem RH
 * não consegue escrever lá — e não deve mesmo. O upsert falhar por
 * permissão não é erro: é a regra funcionando, então não vira toast.
 */
async function salvarFaixa(vagaId: string, min: number | null, max: number | null) {
  if (min === null && max === null) return;
  await supabase
    .from("rh_vaga_faixa")
    .upsert({ vaga_id: vagaId, minimo: min, maximo: max }, { onConflict: "vaga_id" });
}

export const rhActions = {
  async criarVaga(input: VagaInput): Promise<Resultado<string>> {
    const { data, error } = await supabase
      .from("rh_vagas")
      .insert({ ...payloadVaga(input), status: "rascunho" })
      .select("id")
      .single();
    if (error) return falha(error);
    const id = txt((data as Row).id);
    await salvarFaixa(id, input.faixaMin, input.faixaMax);
    await fetchTudo();
    return { ok: true, dado: id };
  },

  async atualizarVaga(id: string, input: VagaInput): Promise<Resultado> {
    const { error } = await supabase.from("rh_vagas").update(payloadVaga(input)).eq("id", id);
    if (error) return falha(error);
    await salvarFaixa(id, input.faixaMin, input.faixaMax);
    await fetchTudo();
    return { ok: true };
  },

  /** Duplicar vaga: o código novo é gerado pelo banco, não copiado. */
  async duplicarVaga(id: string): Promise<Resultado<string>> {
    const origem = state.vagas.find((v) => v.id === id);
    if (!origem) return { ok: false, erro: "Vaga não encontrada." };
    const { data, error } = await supabase
      .from("rh_vagas")
      .insert({
        titulo: `${origem.titulo} (cópia)`,
        cargo_id: origem.cargoId,
        setor: origem.setor,
        projeto_id: origem.projetoId,
        tipo_contratacao: origem.tipoContratacao,
        quantidade_posicoes: origem.quantidadePosicoes,
        jornada: origem.jornada,
        local_trabalho: origem.localTrabalho,
        cidade: origem.cidade,
        uf: origem.uf,
        salario_confidencial: origem.salarioConfidencial,
        beneficios: origem.beneficios,
        descricao: origem.descricao,
        requisitos: origem.requisitos,
        diferenciais: origem.diferenciais,
        motivo_abertura: origem.motivoAbertura,
        responsavel_rh_id: origem.responsavelRhId,
        status: "rascunho",
      })
      .select("id")
      .single();
    if (error) return falha(error);
    const novo = txt((data as Row).id);
    await salvarFaixa(novo, origem.faixaMin, origem.faixaMax);
    await fetchTudo();
    return { ok: true, dado: novo };
  },

  /** Status de vaga não é UPDATE: é a função do banco, que exige a nota. */
  async moverVaga(id: string, status: VagaStatus, nota: string): Promise<Resultado> {
    const { error } = await supabase.rpc("rh_mover_vaga", {
      p_vaga: id,
      p_status: status,
      p_nota: nota,
    });
    if (error) return falha(error);
    await fetchTudo();
    return { ok: true };
  },

  async publicarVaga(id: string, nota: string): Promise<Resultado> {
    const { error } = await supabase.rpc("rh_publicar_vaga", { p_vaga: id, p_nota: nota });
    if (error) return falha(error);
    await fetchTudo();
    return { ok: true };
  },

  async despublicarVaga(id: string, nota: string): Promise<Resultado> {
    const { error } = await supabase.rpc("rh_despublicar_vaga", { p_vaga: id, p_nota: nota });
    if (error) return falha(error);
    await fetchTudo();
    return { ok: true };
  },

  async inativarVaga(id: string): Promise<Resultado> {
    const { error } = await supabase.from("rh_vagas").update({ ativo: false }).eq("id", id);
    if (error) return falha(error);
    await fetchTudo();
    return { ok: true };
  },

  // ==========================================================
  // Candidatos
  // ==========================================================
  async criarCandidato(input: CandidatoInput): Promise<Resultado<string>> {
    const { data, error } = await supabase
      .from("rh_candidatos")
      .insert(payloadCandidato(input))
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          erro: "Já existe candidato com este CPF. Abra o cadastro existente em vez de criar outro.",
        };
      }
      return falha(error);
    }
    const id = txt((data as Row).id);
    await salvarPretensao(id, input.pretensao);
    await fetchTudo();
    return { ok: true, dado: id };
  },

  async atualizarCandidato(id: string, input: CandidatoInput): Promise<Resultado> {
    const { error } = await supabase
      .from("rh_candidatos")
      .update(payloadCandidato(input))
      .eq("id", id);
    if (error) {
      if (error.code === "23505") {
        return { ok: false, erro: "Já existe outro candidato com este CPF." };
      }
      return falha(error);
    }
    await salvarPretensao(id, input.pretensao);
    await fetchTudo();
    return { ok: true };
  },

  /** Banco de talentos, indisponível, reativar: só muda o status do candidato. */
  async mudarStatusCandidato(id: string, status: string): Promise<Resultado> {
    const { error } = await supabase.from("rh_candidatos").update({ status }).eq("id", id);
    if (error) return falha(error);
    await fetchTudo();
    return { ok: true };
  },

  /** Regra 13: expurgo anonimiza, não apaga. A estatística continua de pé. */
  async anonimizarCandidato(id: string, nota: string): Promise<Resultado> {
    const { error } = await supabase.rpc("rh_anonimizar_candidato", {
      p_candidato: id,
      p_nota: nota,
    });
    if (error) return falha(error);
    await fetchTudo();
    return { ok: true };
  },

  // ==========================================================
  // Funil
  // ==========================================================
  async inscreverCandidato(candidatoId: string, vagaId: string, nota: string): Promise<Resultado> {
    const { error } = await supabase.rpc("rh_inscrever_candidato", {
      p_candidato: candidatoId,
      p_vaga: vagaId,
      p_nota: nota,
    });
    if (error) {
      if (error.code === "23505") {
        return { ok: false, erro: "Este candidato já está inscrito nesta vaga." };
      }
      return falha(error);
    }
    await fetchTudo();
    return { ok: true };
  },

  /**
   * A movimentação do Kanban. A nota vai junto e o banco recusa sem
   * ela — não existe caminho alternativo, nem para o administrador.
   */
  async moverCandidatura(
    candidaturaId: string,
    etapaId: string,
    nota: string,
    motivoId?: string | null,
    motivoTexto?: string | null,
  ): Promise<Resultado> {
    const { error } = await supabase.rpc("rh_mover_candidatura", {
      p_candidatura: candidaturaId,
      p_etapa: etapaId,
      p_nota: nota,
      p_motivo_id: motivoId ?? null,
      p_motivo_texto: motivoTexto ?? null,
    });
    if (error) return falha(error);
    await fetchTudo();
    return { ok: true };
  },

  // ==========================================================
  // Pareceres
  // ==========================================================
  async salvarAvaliacao(input: AvaliacaoInput): Promise<Resultado> {
    const nota = mediaCriterios(input.criterios);
    const payload = {
      candidatura_id: input.candidaturaId,
      tipo: input.tipo,
      avaliador_id: input.avaliadorId,
      avaliador_nome: input.avaliadorNome,
      data_hora: input.dataHora,
      local: input.local,
      criterios: input.criterios,
      nota_final: nota,
      parecer: input.parecer.trim(),
      recomendacao: input.recomendacao,
      status: input.status,
    };
    const { error } = input.id
      ? await supabase.from("rh_avaliacoes").update(payload).eq("id", input.id)
      : await supabase.from("rh_avaliacoes").insert(payload);
    if (error) return falha(error);
    // O score da candidatura é recalculado por trigger no banco — o
    // engenheiro que registra o parecer não tem permissão de escrever
    // em rh_candidaturas, então não daria para fazer daqui.
    await fetchTudo();
    return { ok: true };
  },
};

export type CandidatoInput = {
  nome: string;
  cpf: string;
  rg: string;
  dataNascimento: string | null;
  email: string;
  telefone: string;
  whatsapp: string;
  cidade: string;
  uf: string;
  cargoPretendido: string;
  disponibilidade: string;
  disponibilidadeViagem: boolean;
  possuiCnh: boolean;
  categoriaCnh: string;
  nrsDeclaradas: { nr: string; validade: string | null }[];
  escolaridade: string;
  experienciaResumo: string;
  linkedin: string;
  origem: string;
  origemDetalhe: string;
  indicadoPor: string;
  observacoes: string;
  lgpdConsentimento: boolean;
  pretensao: number | null;
};

function payloadCandidato(input: CandidatoInput) {
  return {
    nome: input.nome.trim(),
    cpf: input.cpf.trim(),
    rg: input.rg,
    data_nascimento: input.dataNascimento,
    email: input.email.trim().toLowerCase(),
    telefone: input.telefone,
    whatsapp: input.whatsapp,
    cidade: input.cidade,
    uf: input.uf.toUpperCase().slice(0, 2),
    cargo_pretendido: input.cargoPretendido,
    disponibilidade: input.disponibilidade,
    disponibilidade_viagem: input.disponibilidadeViagem,
    possui_cnh: input.possuiCnh,
    categoria_cnh: input.categoriaCnh,
    nrs_declaradas: input.nrsDeclaradas,
    escolaridade: input.escolaridade,
    experiencia_resumo: input.experienciaResumo,
    linkedin: input.linkedin,
    origem: input.origem,
    origem_detalhe: input.origemDetalhe,
    indicado_por: input.indicadoPor,
    observacoes: input.observacoes,
    lgpd_consentimento: input.lgpdConsentimento,
    // Data e prazo de retenção só fazem sentido com consentimento dado.
    lgpd_data: input.lgpdConsentimento ? new Date().toISOString() : null,
    lgpd_retencao_ate: input.lgpdConsentimento ? emMeses(24) : null,
  };
}

function emMeses(meses: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + meses);
  return d.toISOString().slice(0, 10);
}

async function salvarPretensao(candidatoId: string, valor: number | null) {
  if (valor === null) return;
  await supabase
    .from("rh_candidato_pretensao")
    .upsert({ candidato_id: candidatoId, valor }, { onConflict: "candidato_id" });
}

export type AvaliacaoInput = {
  id?: string;
  candidaturaId: string;
  tipo: string;
  avaliadorId: string | null;
  avaliadorNome: string;
  dataHora: string | null;
  local: string;
  criterios: CriterioNota[];
  parecer: string;
  recomendacao: string | null;
  status: string;
};

// ============================================================
// Histórico — carregado sob demanda, não fica no estado
// ============================================================
export async function listarHistoricoCandidatura(
  candidaturaId: string,
): Promise<HistoricoCandidatura[]> {
  const { data, error } = await supabase
    .from("rh_candidatura_historico")
    .select("*")
    .eq("candidatura_id", candidaturaId)
    .order("created_at", { ascending: false });
  toastErr("Falha ao carregar o histórico", error);
  return ((data ?? []) as Row[]).map((r) => ({
    id: txt(r.id),
    candidaturaId: txt(r.candidatura_id),
    etapaAnteriorId: opt(r.etapa_anterior_id),
    etapaNovaId: opt(r.etapa_nova_id),
    statusAnterior: txt(r.status_anterior),
    statusNovo: txt(r.status_novo),
    nota: txt(r.nota),
    autorNome: txt(r.autor_nome),
    criadoEm: txt(r.created_at),
  }));
}

export async function listarHistoricoVaga(vagaId: string): Promise<HistoricoVaga[]> {
  const { data, error } = await supabase
    .from("rh_vaga_historico")
    .select("*")
    .eq("vaga_id", vagaId)
    .order("created_at", { ascending: false });
  toastErr("Falha ao carregar o histórico da vaga", error);
  return ((data ?? []) as Row[]).map((r) => ({
    id: txt(r.id),
    vagaId: txt(r.vaga_id),
    statusAnterior: txt(r.status_anterior),
    statusNovo: txt(r.status_novo),
    nota: txt(r.nota),
    autorNome: txt(r.autor_nome),
    criadoEm: txt(r.created_at),
  }));
}
