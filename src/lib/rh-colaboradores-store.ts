// ============================================================
// Store de colaboradores — ficha, documentos, aptidão e histórico
// ------------------------------------------------------------
// A aptidão para entrar em obra NÃO é calculada aqui. Ela vem de
// vw_rh_alocacao, que recalcula a cada leitura chamando
// rh_pendencias_alocacao() no banco. A coluna funcionarios.apto_alocacao
// é só um cache mantido por trigger e pode estar velha entre o dia em
// que um documento venceu e o próximo recálculo — por isso a tela usa
// a view, e não a coluna.
//
// Alocar em obra também é função no banco (rh_alocar_funcionario), que
// recusa quando falta ASO, NR do cargo ou EPI com termo assinado. É a
// regra 8, e ela precisa valer para quem chamar a API direto também.
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
export type SituacaoColaborador = "experiencia" | "ativo" | "afastado" | "desligado";

export type Colaborador = {
  id: string;
  nome: string;
  cpf: string;
  rg: string;
  cargo: string;
  cargoId: string | null;
  setor: string;
  matricula: string;
  dataAdmissao: string | null;
  situacao: SituacaoColaborador;
  ativo: boolean;
  observacoes: string;
  dataNascimento: string | null;
  estadoCivil: string;
  nomeMae: string;
  nacionalidade: string;
  naturalidade: string;
  pisNis: string;
  ctpsNumero: string;
  ctpsSerie: string;
  ctpsUf: string;
  tituloEleitor: string;
  reservista: string;
  escolaridade: string;
  endereco: Record<string, unknown>;
  telefone: string;
  email: string;
  fotoPath: string | null;
  contatoEmergenciaNome: string;
  contatoEmergenciaTelefone: string;
  contatoEmergenciaParentesco: string;
  banco: string;
  agencia: string;
  conta: string;
  tipoConta: string;
  pix: string;
  tipoContratacao: string;
  jornada: string;
  projetoId: string | null;
  gestorId: string | null;
  dataDesligamento: string | null;
  motivoDesligamento: string;
  candidatoId: string | null;
  admissaoId: string | null;
  aptoCache: boolean;
};

/** Linha de vw_rh_alocacao: a verdade fresca sobre quem pode entrar em obra. */
export type Alocacao = {
  funcionarioId: string;
  apto: boolean;
  pendencias: string[];
};

export type DocumentoColaborador = {
  id: string;
  funcionarioId: string;
  tipoDocumentoId: string;
  numero: string;
  emissor: string;
  dataEmissao: string | null;
  dataVencimento: string | null;
  arquivoPath: string | null;
  status: string;
  observacao: string;
  ativo: boolean;
  criadoEm: string;
};

export type Dependente = {
  id: string;
  funcionarioId: string;
  nome: string;
  parentesco: string;
  dataNascimento: string | null;
  cpf: string;
  paraIr: boolean;
  paraSalarioFamilia: boolean;
  documentoPath: string | null;
  ativo: boolean;
};

export type HistoricoColaborador = {
  id: string;
  funcionarioId: string;
  tipo: string;
  descricao: string;
  valorAnterior: string;
  valorNovo: string;
  dataEvento: string;
  autorNome: string;
  criadoEm: string;
};

export type Remuneracao = {
  id: string;
  funcionarioId: string;
  salario: number;
  vigenciaInicio: string;
  vigenciaFim: string | null;
  motivo: string;
  cargoId: string | null;
  autorNome: string;
};

/** Documento com a situação recalculada na leitura, de vw_rh_documentos_vencimento. */
export type DocumentoVencimento = {
  documentoId: string;
  funcionarioId: string;
  funcionarioNome: string;
  matricula: string;
  cargo: string;
  setor: string;
  projetoId: string | null;
  situacao: string;
  tipoDocumentoId: string;
  tipoNome: string;
  tipoCategoria: string;
  bloqueiaAlocacao: boolean;
  numero: string;
  dataEmissao: string | null;
  dataVencimento: string | null;
  arquivoPath: string | null;
  diasParaVencer: number | null;
  situacaoDocumento: "sem_vencimento" | "vencido" | "critico" | "a_vencer" | "valido";
};

type State = {
  carregado: boolean;
  carregando: boolean;
  colaboradores: Colaborador[];
  alocacao: Alocacao[];
  documentos: DocumentoColaborador[];
  vencimentos: DocumentoVencimento[];
  dependentes: Dependente[];
  remuneracoes: Remuneracao[];
};

const SSR: State = {
  carregado: false,
  carregando: false,
  colaboradores: [],
  alocacao: [],
  documentos: [],
  vencimentos: [],
  dependentes: [],
  remuneracoes: [],
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
// Mapeamento
// ============================================================
type Row = Record<string, unknown>;
const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const opt = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const num = (v: unknown) => Number(v ?? 0) || 0;

function mapColaborador(r: Row): Colaborador {
  return {
    id: txt(r.id),
    nome: txt(r.nome),
    cpf: txt(r.cpf),
    rg: txt(r.rg),
    cargo: txt(r.cargo),
    cargoId: opt(r.cargo_id),
    setor: txt(r.setor),
    matricula: txt(r.matricula),
    dataAdmissao: opt(r.data_admissao),
    situacao: (txt(r.situacao) || "ativo") as SituacaoColaborador,
    ativo: r.ativo !== false,
    observacoes: txt(r.observacoes),
    dataNascimento: opt(r.data_nascimento),
    estadoCivil: txt(r.estado_civil),
    nomeMae: txt(r.nome_mae),
    nacionalidade: txt(r.nacionalidade),
    naturalidade: txt(r.naturalidade),
    pisNis: txt(r.pis_nis),
    ctpsNumero: txt(r.ctps_numero),
    ctpsSerie: txt(r.ctps_serie),
    ctpsUf: txt(r.ctps_uf),
    tituloEleitor: txt(r.titulo_eleitor),
    reservista: txt(r.reservista),
    escolaridade: txt(r.escolaridade),
    endereco: (r.endereco && typeof r.endereco === "object" ? r.endereco : {}) as Record<
      string,
      unknown
    >,
    telefone: txt(r.telefone),
    email: txt(r.email),
    fotoPath: opt(r.foto_path),
    contatoEmergenciaNome: txt(r.contato_emergencia_nome),
    contatoEmergenciaTelefone: txt(r.contato_emergencia_telefone),
    contatoEmergenciaParentesco: txt(r.contato_emergencia_parentesco),
    banco: txt(r.banco),
    agencia: txt(r.agencia),
    conta: txt(r.conta),
    tipoConta: txt(r.tipo_conta),
    pix: txt(r.pix),
    tipoContratacao: txt(r.tipo_contratacao) || "clt",
    jornada: txt(r.jornada),
    projetoId: opt(r.projeto_id),
    gestorId: opt(r.gestor_id),
    dataDesligamento: opt(r.data_desligamento),
    motivoDesligamento: txt(r.motivo_desligamento),
    candidatoId: opt(r.candidato_id),
    admissaoId: opt(r.admissao_id),
    aptoCache: Boolean(r.apto_alocacao),
  };
}

function mapVencimento(r: Row): DocumentoVencimento {
  return {
    documentoId: txt(r.documento_id),
    funcionarioId: txt(r.funcionario_id),
    funcionarioNome: txt(r.funcionario_nome),
    matricula: txt(r.matricula),
    cargo: txt(r.cargo),
    setor: txt(r.setor),
    projetoId: opt(r.projeto_id),
    situacao: txt(r.situacao),
    tipoDocumentoId: txt(r.tipo_documento_id),
    tipoNome: txt(r.tipo_nome),
    tipoCategoria: txt(r.tipo_categoria),
    bloqueiaAlocacao: Boolean(r.bloqueia_alocacao),
    numero: txt(r.numero),
    dataEmissao: opt(r.data_emissao),
    dataVencimento: opt(r.data_vencimento),
    arquivoPath: opt(r.arquivo_path),
    diasParaVencer:
      r.dias_para_vencer === null || r.dias_para_vencer === undefined
        ? null
        : Number(r.dias_para_vencer),
    situacaoDocumento: (txt(r.situacao_documento) ||
      "valido") as DocumentoVencimento["situacaoDocumento"],
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
    const [fu, al, doc, vc, dep, rem] = await Promise.all([
      supabase.from("funcionarios").select("*").order("nome", { ascending: true }),
      supabase.from("vw_rh_alocacao").select("*"),
      supabase
        .from("rh_funcionario_documentos")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("vw_rh_documentos_vencimento").select("*"),
      supabase.from("rh_funcionario_dependentes").select("*").order("nome", { ascending: true }),
      // Remuneração: a RLS devolve vazio para quem não é Diretoria nem RH.
      supabase
        .from("rh_funcionario_remuneracao")
        .select("*")
        .order("vigencia_inicio", { ascending: false }),
    ]);
    toastErr("Falha ao carregar colaboradores", fu.error);
    toastErr("Falha ao carregar a aptidão para alocação", al.error);
    toastErr("Falha ao carregar documentos", doc.error);

    state = {
      carregado: true,
      carregando: false,
      colaboradores: ((fu.data ?? []) as Row[]).map(mapColaborador),
      alocacao: ((al.data ?? []) as Row[]).map((r) => ({
        funcionarioId: txt(r.funcionario_id),
        apto: Boolean(r.apto),
        pendencias: Array.isArray(r.pendencias) ? (r.pendencias as string[]) : [],
      })),
      documentos: ((doc.data ?? []) as Row[]).map((r) => ({
        id: txt(r.id),
        funcionarioId: txt(r.funcionario_id),
        tipoDocumentoId: txt(r.tipo_documento_id),
        numero: txt(r.numero),
        emissor: txt(r.emissor),
        dataEmissao: opt(r.data_emissao),
        dataVencimento: opt(r.data_vencimento),
        arquivoPath: opt(r.arquivo_path),
        status: txt(r.status),
        observacao: txt(r.observacao),
        ativo: r.ativo !== false,
        criadoEm: txt(r.created_at),
      })),
      vencimentos: ((vc.data ?? []) as Row[]).map(mapVencimento),
      dependentes: ((dep.data ?? []) as Row[]).map((r) => ({
        id: txt(r.id),
        funcionarioId: txt(r.funcionario_id),
        nome: txt(r.nome),
        parentesco: txt(r.parentesco),
        dataNascimento: opt(r.data_nascimento),
        cpf: txt(r.cpf),
        paraIr: Boolean(r.para_ir),
        paraSalarioFamilia: Boolean(r.para_salario_familia),
        documentoPath: opt(r.documento_path),
        ativo: r.ativo !== false,
      })),
      remuneracoes: ((rem.data ?? []) as Row[]).map((r) => ({
        id: txt(r.id),
        funcionarioId: txt(r.funcionario_id),
        salario: num(r.salario),
        vigenciaInicio: txt(r.vigencia_inicio),
        vigenciaFim: opt(r.vigencia_fim),
        motivo: txt(r.motivo),
        cargoId: opt(r.cargo_id),
        autorNome: txt(r.autor_nome),
      })),
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
// Seletores
// ============================================================
export function colaboradorPorId(s: State, id: string | null): Colaborador | undefined {
  return id ? s.colaboradores.find((c) => c.id === id) : undefined;
}

/** A verdade fresca. Sem linha na view (colaborador inativo), trata como inapto. */
export function aptidaoDe(s: State, funcionarioId: string): Alocacao {
  return (
    s.alocacao.find((a) => a.funcionarioId === funcionarioId) ?? {
      funcionarioId,
      apto: false,
      pendencias: ["Sem dados de aptidão"],
    }
  );
}

export function documentosDe(s: State, funcionarioId: string): DocumentoColaborador[] {
  return s.documentos.filter((d) => d.funcionarioId === funcionarioId && d.ativo);
}

export function vencimentosDe(s: State, funcionarioId: string): DocumentoVencimento[] {
  return s.vencimentos.filter((d) => d.funcionarioId === funcionarioId);
}

export function dependentesDe(s: State, funcionarioId: string): Dependente[] {
  return s.dependentes.filter((d) => d.funcionarioId === funcionarioId && d.ativo);
}

export function remuneracaoAtual(s: State, funcionarioId: string): Remuneracao | undefined {
  return s.remuneracoes
    .filter((r) => r.funcionarioId === funcionarioId)
    .sort((a, b) => b.vigenciaInicio.localeCompare(a.vigenciaInicio))[0];
}

export function historicoRemuneracao(s: State, funcionarioId: string): Remuneracao[] {
  return s.remuneracoes
    .filter((r) => r.funcionarioId === funcionarioId)
    .sort((a, b) => b.vigenciaInicio.localeCompare(a.vigenciaInicio));
}

// ============================================================
// Ações
// ============================================================
export const colaboradorActions = {
  async atualizar(id: string, patch: Record<string, unknown>): Promise<Resultado> {
    const { error } = await supabase.from("funcionarios").update(patch).eq("id", id);
    if (error) return falha(error);
    await fetchColaboradores();
    return { ok: true };
  },

  /** Regra 8: quem recusa é o banco, com a lista exata do que falta. */
  async alocar(funcionarioId: string, projetoId: string | null, nota: string): Promise<Resultado> {
    const { error } = await supabase.rpc("rh_alocar_funcionario", {
      p_funcionario: funcionarioId,
      p_projeto: projetoId,
      p_nota: nota,
    });
    if (error) return falha(error);
    await fetchColaboradores();
    return { ok: true };
  },

  async salvarDocumento(input: {
    id?: string;
    funcionarioId: string;
    tipoDocumentoId: string;
    numero: string;
    emissor: string;
    dataEmissao: string | null;
    dataVencimento: string | null;
    observacao: string;
    arquivoPath?: string | null;
  }): Promise<Resultado<string>> {
    const linha = {
      funcionario_id: input.funcionarioId,
      tipo_documento_id: input.tipoDocumentoId,
      numero: input.numero,
      emissor: input.emissor,
      data_emissao: input.dataEmissao,
      data_vencimento: input.dataVencimento,
      observacao: input.observacao,
      ...(input.arquivoPath !== undefined ? { arquivo_path: input.arquivoPath } : {}),
      // A situação real é recalculada na view a cada leitura; isto é o
      // carimbo inicial, para a lista não abrir com o valor errado.
      status:
        input.dataVencimento && input.dataVencimento < new Date().toISOString().slice(0, 10)
          ? "vencido"
          : "valido",
    };
    const { data, error } = input.id
      ? await supabase
          .from("rh_funcionario_documentos")
          .update(linha)
          .eq("id", input.id)
          .select("id")
          .single()
      : await supabase.from("rh_funcionario_documentos").insert(linha).select("id").single();
    if (error) return falha<string>(error);
    await fetchColaboradores();
    return { ok: true, dado: txt((data as Row).id) };
  },

  /** Documento não se apaga: vira "substituido" e sai das listas. */
  async substituirDocumento(id: string): Promise<Resultado> {
    const { error } = await supabase
      .from("rh_funcionario_documentos")
      .update({ status: "substituido", ativo: false })
      .eq("id", id);
    if (error) return falha(error);
    await fetchColaboradores();
    return { ok: true };
  },

  async enviarArquivoDocumento(
    documentoId: string,
    funcionarioId: string,
    arquivo: File,
  ): Promise<Resultado<string>> {
    const limite = 10 * 1024 * 1024;
    if (arquivo.size > limite) {
      return { ok: false, erro: "Arquivo acima de 10 MB." };
    }
    const extensao =
      arquivo.name
        .split(".")
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "bin";
    const caminho = `${funcionarioId}/documentos/${documentoId}.${extensao}`;
    const { error: erroUpload } = await supabase.storage
      .from("documentos-rh")
      .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type || undefined });
    if (erroUpload) return falha<string>(erroUpload);
    const { error } = await supabase
      .from("rh_funcionario_documentos")
      .update({ arquivo_path: caminho })
      .eq("id", documentoId);
    if (error) return falha<string>(error);
    await fetchColaboradores();
    return { ok: true, dado: caminho };
  },

  async salvarDependente(input: {
    id?: string;
    funcionarioId: string;
    nome: string;
    parentesco: string;
    dataNascimento: string | null;
    cpf: string;
    paraIr: boolean;
    paraSalarioFamilia: boolean;
  }): Promise<Resultado> {
    const linha = {
      funcionario_id: input.funcionarioId,
      nome: input.nome,
      parentesco: input.parentesco,
      data_nascimento: input.dataNascimento,
      cpf: input.cpf,
      para_ir: input.paraIr,
      para_salario_familia: input.paraSalarioFamilia,
    };
    const { error } = input.id
      ? await supabase.from("rh_funcionario_dependentes").update(linha).eq("id", input.id)
      : await supabase.from("rh_funcionario_dependentes").insert(linha);
    if (error) return falha(error);
    await fetchColaboradores();
    return { ok: true };
  },

  async inativarDependente(id: string): Promise<Resultado> {
    const { error } = await supabase
      .from("rh_funcionario_dependentes")
      .update({ ativo: false })
      .eq("id", id);
    if (error) return falha(error);
    await fetchColaboradores();
    return { ok: true };
  },

  /** Mudança de salário: nova vigência, e a anterior é fechada. */
  async registrarRemuneracao(input: {
    funcionarioId: string;
    salario: number;
    vigenciaInicio: string;
    motivo: string;
    cargoId: string | null;
    autorId: string | null;
    autorNome: string;
  }): Promise<Resultado> {
    const anterior = state.remuneracoes
      .filter((r) => r.funcionarioId === input.funcionarioId && !r.vigenciaFim)
      .sort((a, b) => b.vigenciaInicio.localeCompare(a.vigenciaInicio))[0];

    if (anterior) {
      const fim = new Date(`${input.vigenciaInicio}T00:00:00`);
      fim.setDate(fim.getDate() - 1);
      await supabase
        .from("rh_funcionario_remuneracao")
        .update({ vigencia_fim: fim.toISOString().slice(0, 10) })
        .eq("id", anterior.id);
    }

    const { error } = await supabase.from("rh_funcionario_remuneracao").insert({
      funcionario_id: input.funcionarioId,
      salario: input.salario,
      vigencia_inicio: input.vigenciaInicio,
      motivo: input.motivo,
      cargo_id: input.cargoId,
      autor_id: input.autorId,
      autor_nome: input.autorNome,
    });
    if (error) return falha(error);

    // O histórico do colaborador registra que houve mudança, sem o
    // valor: é uma tabela que Engenharia lê, e o valor é confidencial.
    await supabase.from("rh_funcionario_historico").insert({
      funcionario_id: input.funcionarioId,
      tipo: "mudanca_salario",
      descricao: `Remuneração alterada (${input.motivo}).`,
      valor_anterior: anterior ? "confidencial" : "",
      valor_novo: "confidencial",
      data_evento: input.vigenciaInicio,
      autor_id: input.autorId,
      autor_nome: input.autorNome,
    });
    await fetchColaboradores();
    return { ok: true };
  },

  async desligar(input: {
    funcionarioId: string;
    data: string;
    motivo: string;
    autorId: string | null;
    autorNome: string;
  }): Promise<Resultado> {
    const { error } = await supabase
      .from("funcionarios")
      .update({
        situacao: "desligado",
        data_desligamento: input.data,
        motivo_desligamento: input.motivo,
        projeto_id: null,
        ativo: false,
      })
      .eq("id", input.funcionarioId);
    if (error) return falha(error);
    await supabase.from("rh_funcionario_historico").insert({
      funcionario_id: input.funcionarioId,
      tipo: "desligamento",
      descricao: input.motivo,
      data_evento: input.data,
      autor_id: input.autorId,
      autor_nome: input.autorNome,
    });
    await fetchColaboradores();
    return { ok: true };
  },

  async registrarEvento(input: {
    funcionarioId: string;
    tipo: string;
    descricao: string;
    dataEvento: string;
    autorId: string | null;
    autorNome: string;
  }): Promise<Resultado> {
    const { error } = await supabase.from("rh_funcionario_historico").insert({
      funcionario_id: input.funcionarioId,
      tipo: input.tipo,
      descricao: input.descricao,
      data_evento: input.dataEvento,
      autor_id: input.autorId,
      autor_nome: input.autorNome,
    });
    if (error) return falha(error);
    return { ok: true };
  },

  /**
   * Recalcula a aptidão de todo mundo e recarimba a situação dos
   * documentos. É o que um job diário faria; enquanto não existe job,
   * o botão do painel resolve.
   */
  async recalcularAptidao(): Promise<Resultado<number>> {
    const { data, error } = await supabase.rpc("rh_recalcula_aptidao_todos");
    if (error) return falha<number>(error);
    await fetchColaboradores();
    return { ok: true, dado: Number(data ?? 0) };
  },
};

export async function listarHistoricoColaborador(
  funcionarioId: string,
): Promise<HistoricoColaborador[]> {
  const { data, error } = await supabase
    .from("rh_funcionario_historico")
    .select("*")
    .eq("funcionario_id", funcionarioId)
    .order("data_evento", { ascending: false })
    .order("created_at", { ascending: false });
  toastErr("Falha ao carregar o histórico do colaborador", error);
  return ((data ?? []) as Row[]).map((r) => ({
    id: txt(r.id),
    funcionarioId: txt(r.funcionario_id),
    tipo: txt(r.tipo),
    descricao: txt(r.descricao),
    valorAnterior: txt(r.valor_anterior),
    valorNovo: txt(r.valor_novo),
    dataEvento: txt(r.data_evento),
    autorNome: txt(r.autor_nome),
    criadoEm: txt(r.created_at),
  }));
}

/** Entregas de EPI do colaborador — vem do módulo de EPIs, que já existia. */
export async function listarEpisDoColaborador(funcionarioId: string): Promise<
  {
    id: string;
    numeroTermo: string;
    dataEntrega: string;
    assinado: boolean;
    itens: string[];
  }[]
> {
  const { data: entregas, error } = await supabase
    .from("entregas_epi")
    .select("id, numero_termo, data_entrega, assinado")
    .eq("funcionario_id", funcionarioId)
    .order("data_entrega", { ascending: false });
  toastErr("Falha ao carregar entregas de EPI", error);
  const linhas = (entregas ?? []) as Row[];
  if (linhas.length === 0) return [];

  const { data: itens } = await supabase
    .from("entrega_epi_itens")
    .select("entrega_id, epi_nome")
    .in(
      "entrega_id",
      linhas.map((e) => txt(e.id)),
    );

  const porEntrega = new Map<string, string[]>();
  for (const i of (itens ?? []) as Row[]) {
    const chave = txt(i.entrega_id);
    porEntrega.set(chave, [...(porEntrega.get(chave) ?? []), txt(i.epi_nome)]);
  }

  return linhas.map((e) => ({
    id: txt(e.id),
    numeroTermo: txt(e.numero_termo),
    dataEntrega: txt(e.data_entrega),
    assinado: Boolean(e.assinado),
    itens: porEntrega.get(txt(e.id)) ?? [],
  }));
}

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

export const MOTIVO_REMUNERACAO_LABEL: Record<string, string> = {
  admissao: "Admissão",
  promocao: "Promoção",
  dissidio: "Dissídio",
  ajuste: "Ajuste",
  mudanca_cargo: "Mudança de cargo",
};

export const TIPO_HISTORICO_LABEL: Record<string, string> = {
  admissao: "Admissão",
  mudanca_obra: "Mudança de obra",
  mudanca_cargo: "Mudança de cargo",
  mudanca_salario: "Mudança de salário",
  afastamento: "Afastamento",
  retorno: "Retorno",
  advertencia: "Advertência",
  desligamento: "Desligamento",
  documento: "Documento",
};

export const SITUACAO_DOC_LABEL: Record<string, string> = {
  sem_vencimento: "Sem vencimento",
  vencido: "Vencido",
  critico: "Vence em 7 dias",
  a_vencer: "Vence em 30 dias",
  valido: "Válido",
};

export const SITUACAO_DOC_ESTILO: Record<string, string> = {
  sem_vencimento: "bg-muted text-muted-foreground",
  vencido: "bg-red-100 text-red-700",
  critico: "bg-red-50 text-red-600",
  a_vencer: "bg-amber-100 text-amber-800",
  valido: "bg-emerald-100 text-emerald-800",
};
