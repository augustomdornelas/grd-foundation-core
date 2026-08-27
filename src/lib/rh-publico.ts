// ============================================================
// Site público e área do candidato
// ------------------------------------------------------------
// Esta é a única parte do módulo que fala com o banco sem login, e
// por isso ela quase não usa tabela: a leitura das vagas vem de uma
// view (vw_rh_vagas_publicas) e a inscrição inteira é uma chamada de
// função (rh_inscricao_publica), que valida CPF, LGPD, vaga aberta e
// duplicidade por dentro.
//
// O que a tela valida aqui é conveniência — mensagem melhor, antes de
// ir à rede. Quem recusa de verdade é o banco.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { cpfValido, apenasDigitos } from "@/lib/rh-regras";

type Row = Record<string, unknown>;
const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const opt = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const dec = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export type VagaPublica = {
  id: string;
  codigo: string;
  slug: string;
  titulo: string;
  setor: string;
  tipoContratacao: string;
  quantidadePosicoes: number;
  jornada: string;
  localTrabalho: string;
  cidade: string;
  uf: string;
  beneficios: string;
  descricao: string;
  requisitos: string;
  diferenciais: string;
  dataAbertura: string | null;
  dataPrevistaInicio: string | null;
  salarioConfidencial: boolean;
  /** Vem nulo quando a vaga é confidencial — o banco já zera na view. */
  faixaSalarialMin: number | null;
  faixaSalarialMax: number | null;
};

function mapVaga(r: Row): VagaPublica {
  return {
    id: txt(r.id),
    codigo: txt(r.codigo),
    slug: txt(r.slug),
    titulo: txt(r.titulo),
    setor: txt(r.setor),
    tipoContratacao: txt(r.tipo_contratacao),
    quantidadePosicoes: Number(r.quantidade_posicoes ?? 1) || 1,
    jornada: txt(r.jornada),
    localTrabalho: txt(r.local_trabalho),
    cidade: txt(r.cidade),
    uf: txt(r.uf),
    beneficios: txt(r.beneficios),
    descricao: txt(r.descricao),
    requisitos: txt(r.requisitos),
    diferenciais: txt(r.diferenciais),
    dataAbertura: opt(r.data_abertura),
    dataPrevistaInicio: opt(r.data_prevista_inicio),
    salarioConfidencial: r.salario_confidencial !== false,
    faixaSalarialMin: dec(r.faixa_salarial_min),
    faixaSalarialMax: dec(r.faixa_salarial_max),
  };
}

export async function listarVagasPublicas(): Promise<VagaPublica[]> {
  const { data, error } = await supabase
    .from("vw_rh_vagas_publicas")
    .select("*")
    .order("data_abertura", { ascending: false });
  if (error) {
    console.error("[rh-publico] listarVagasPublicas:", error.message);
    return [];
  }
  return ((data ?? []) as Row[]).map(mapVaga);
}

export async function vagaPorSlug(slug: string): Promise<VagaPublica | null> {
  const { data, error } = await supabase
    .from("vw_rh_vagas_publicas")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  return mapVaga(data as Row);
}

// ============================================================
// Inscrição
// ============================================================
export type InscricaoInput = {
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
  whatsapp: string;
  cidade: string;
  uf: string;
  cargoPretendido: string;
  disponibilidade: string;
  nrs: { nr: string; validade: string | null }[];
  experiencia: string;
  lgpd: boolean;
  vagaSlug: string | null;
  curriculo: File | null;
};

export type InscricaoResultado = {
  ok: boolean;
  erro?: string;
  jaInscrito?: boolean;
  email?: string;
};

const TAMANHO_MAX = 5 * 1024 * 1024;
const EXTENSOES = ["pdf", "doc", "docx", "jpg", "jpeg", "png"];

/**
 * Sobe o currículo antes de chamar a função de inscrição.
 *
 * O caminho é sempre `publico/<aleatório>.<ext>`: é a única pasta em
 * que a policy do bucket deixa alguém sem login escrever, e o nome
 * aleatório evita que uma pessoa sobrescreva o arquivo de outra.
 * Ninguém consegue LER de volta — a leitura do bucket exige login.
 */
async function enviarCurriculo(arquivo: File): Promise<{ path: string | null; erro?: string }> {
  if (arquivo.size > TAMANHO_MAX) {
    return { path: null, erro: "O currículo passa de 5 MB. Envie um arquivo menor." };
  }
  const ext =
    arquivo.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") ?? "";
  if (!EXTENSOES.includes(ext)) {
    return { path: null, erro: "Formato não aceito. Envie PDF, DOC, DOCX ou foto (JPG/PNG)." };
  }
  const aleatorio =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const path = `publico/${aleatorio}.${ext}`;
  const { error } = await supabase.storage
    .from("curriculos")
    .upload(path, arquivo, { contentType: arquivo.type || undefined, upsert: false });
  if (error) return { path: null, erro: `Não foi possível enviar o currículo: ${error.message}` };
  return { path };
}

export async function inscrever(input: InscricaoInput): Promise<InscricaoResultado> {
  if (!input.lgpd) {
    return { ok: false, erro: "É preciso aceitar o aviso de privacidade para se candidatar." };
  }
  if (input.nome.trim().length < 3) {
    return { ok: false, erro: "Informe seu nome completo." };
  }
  if (apenasDigitos(input.cpf).length !== 11 || !cpfValido(input.cpf)) {
    return { ok: false, erro: "CPF inválido. Confira os números." };
  }
  if (!input.email.trim() && !input.telefone.trim()) {
    return {
      ok: false,
      erro: "Deixe ao menos um e-mail ou telefone para a gente entrar em contato.",
    };
  }

  let curriculoPath: string | null = null;
  if (input.curriculo) {
    const envio = await enviarCurriculo(input.curriculo);
    if (envio.erro) return { ok: false, erro: envio.erro };
    curriculoPath = envio.path;
  }

  const { data, error } = await supabase.rpc("rh_inscricao_publica", {
    p_nome: input.nome,
    p_cpf: input.cpf,
    p_email: input.email,
    p_telefone: input.telefone,
    p_cidade: input.cidade,
    p_uf: input.uf,
    p_cargo_pretendido: input.cargoPretendido,
    p_lgpd: input.lgpd,
    p_vaga_slug: input.vagaSlug,
    p_whatsapp: input.whatsapp,
    p_disponibilidade: input.disponibilidade,
    p_nrs: input.nrs,
    p_curriculo_path: curriculoPath,
    p_experiencia: input.experiencia,
    p_origem_detalhe: input.vagaSlug ? `Vaga ${input.vagaSlug}` : "Banco de talentos",
  });

  if (error) return { ok: false, erro: error.message };
  const r = (data ?? {}) as Row;
  return { ok: true, jaInscrito: Boolean(r.ja_inscrito), email: txt(r.email) };
}

// ============================================================
// Área do candidato
// ============================================================
export type MinhaCandidatura = {
  candidaturaId: string;
  vagaId: string;
  status: string;
  dataInscricao: string;
  dataUltimaMovimentacao: string;
  vagaCodigo: string;
  vagaTitulo: string;
  cidade: string;
  uf: string;
  localTrabalho: string;
  tipoContratacao: string;
  vagaSlug: string | null;
  etapaNome: string;
  etapaTipo: string;
  etapaOrdem: number;
  admissaoId: string | null;
  admissaoCodigo: string | null;
  admissaoStatus: string | null;
  dataPrevistaAdmissao: string | null;
};

export type ItemDoCandidato = {
  id: string;
  admissaoId: string;
  titulo: string;
  categoria: string;
  obrigatorio: boolean;
  status: string;
  arquivoPath: string | null;
  instrucoes: string;
};

/** Liga o login recém-criado ao cadastro que já existe, pelo e-mail. */
export async function vincularCandidato(): Promise<string | null> {
  const { data, error } = await supabase.rpc("rh_vincular_candidato");
  if (error) {
    console.error("[rh-publico] vincularCandidato:", error.message);
    return null;
  }
  return data ? String(data) : null;
}

export async function minhasCandidaturas(): Promise<MinhaCandidatura[]> {
  const { data, error } = await supabase
    .from("vw_rh_minhas_candidaturas")
    .select("*")
    .order("data_inscricao", { ascending: false });
  if (error) {
    console.error("[rh-publico] minhasCandidaturas:", error.message);
    return [];
  }
  return ((data ?? []) as Row[]).map((r) => ({
    candidaturaId: txt(r.candidatura_id),
    vagaId: txt(r.vaga_id),
    status: txt(r.status),
    dataInscricao: txt(r.data_inscricao),
    dataUltimaMovimentacao: txt(r.data_ultima_movimentacao),
    vagaCodigo: txt(r.vaga_codigo),
    vagaTitulo: txt(r.vaga_titulo),
    cidade: txt(r.cidade),
    uf: txt(r.uf),
    localTrabalho: txt(r.local_trabalho),
    tipoContratacao: txt(r.tipo_contratacao),
    vagaSlug: opt(r.vaga_slug),
    etapaNome: txt(r.etapa_nome),
    etapaTipo: txt(r.etapa_tipo),
    etapaOrdem: Number(r.etapa_ordem ?? 0) || 0,
    admissaoId: opt(r.admissao_id),
    admissaoCodigo: opt(r.admissao_codigo),
    admissaoStatus: opt(r.admissao_status),
    dataPrevistaAdmissao: opt(r.data_prevista_admissao),
  }));
}

/** Só os itens que o candidato tem de enviar; a conferência é do RH. */
export async function meusItensDeAdmissao(admissaoId: string): Promise<ItemDoCandidato[]> {
  const { data, error } = await supabase
    .from("rh_admissao_itens")
    .select(
      "id, admissao_id, titulo, categoria, obrigatorio, status, arquivo_path, instrucoes, ordem",
    )
    .eq("admissao_id", admissaoId)
    .eq("responsavel", "candidato")
    .order("ordem", { ascending: true });
  if (error) {
    console.error("[rh-publico] meusItensDeAdmissao:", error.message);
    return [];
  }
  return ((data ?? []) as Row[]).map((r) => ({
    id: txt(r.id),
    admissaoId: txt(r.admissao_id),
    titulo: txt(r.titulo),
    categoria: txt(r.categoria),
    obrigatorio: r.obrigatorio !== false,
    status: txt(r.status),
    arquivoPath: opt(r.arquivo_path),
    instrucoes: txt(r.instrucoes),
  }));
}

export async function enviarDocumentoDoCandidato(
  item: ItemDoCandidato,
  candidatoId: string,
  arquivo: File,
): Promise<{ ok: boolean; erro?: string }> {
  if (arquivo.size > TAMANHO_MAX) return { ok: false, erro: "Arquivo acima de 5 MB." };
  const ext =
    arquivo.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") ?? "bin";
  const path = `${candidatoId}/admissao/${item.id}.${ext}`;
  const { error: erroUpload } = await supabase.storage
    .from("documentos-rh")
    .upload(path, arquivo, { upsert: true, contentType: arquivo.type || undefined });
  if (erroUpload) return { ok: false, erro: erroUpload.message };

  const { error } = await supabase
    .from("rh_admissao_itens")
    .update({ arquivo_path: path, status: "enviado" })
    .eq("id", item.id);
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

export async function desistirDoProcesso(candidaturaId: string, motivo: string) {
  const { error } = await supabase.rpc("rh_candidato_desistir", {
    p_candidatura: candidaturaId,
    p_motivo: motivo,
  });
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

export async function responderProposta(candidaturaId: string, aceita: boolean, nota: string) {
  const { error } = await supabase.rpc("rh_candidato_responder_proposta", {
    p_candidatura: candidaturaId,
    p_aceita: aceita,
    p_nota: nota,
  });
  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}

// ============================================================
// Como o candidato lê o próprio estado
// ============================================================
/**
 * Tradução da etapa interna para o que o candidato vê. Ninguém de
 * fora precisa saber que existe "triagem de currículo" — precisa
 * saber se ainda está no processo e o que se espera dele agora.
 *
 * Etapa final negativa NUNCA diz o porquê: vira "processo encerrado".
 * O motivo é dado interno do RH e não sai daqui — nem sai do banco,
 * porque a view do candidato não tem essa coluna.
 */
export function situacaoParaCandidato(c: MinhaCandidatura): {
  titulo: string;
  detalhe: string;
  tom: "andamento" | "bom" | "encerrado";
} {
  if (c.status === "contratado") {
    return {
      titulo: "Contratado",
      detalhe: "Boas-vindas à GRD. Fale com o RH sobre o primeiro dia.",
      tom: "bom",
    };
  }
  if (c.status === "banco_talentos") {
    return {
      titulo: "No banco de talentos",
      detalhe: "Você não seguiu nesta vaga, mas seu cadastro fica com a gente para as próximas.",
      tom: "encerrado",
    };
  }
  if (c.status === "desistiu") {
    return {
      titulo: "Você desistiu deste processo",
      detalhe: "Se mudar de ideia, fale com o RH.",
      tom: "encerrado",
    };
  }
  if (c.status === "reprovado" || c.etapaTipo === "final_negativa") {
    return {
      titulo: "Processo encerrado",
      detalhe:
        "Não seguimos com sua candidatura nesta vaga. Obrigado por participar — seu cadastro continua conosco para vagas futuras.",
      tom: "encerrado",
    };
  }

  if (c.admissaoId) {
    return {
      titulo: "Admissão em andamento",
      detalhe:
        "Envie os documentos pedidos abaixo. Assim que estiver tudo conferido, o RH combina o primeiro dia com você.",
      tom: "bom",
    };
  }

  // Etapas do meio, traduzidas pelo nome configurado no funil.
  const nome = c.etapaNome.toLowerCase();
  if (nome.includes("inscrito")) {
    return {
      titulo: "Inscrição recebida",
      detalhe: "Recebemos sua candidatura. Em breve o RH analisa seu currículo.",
      tom: "andamento",
    };
  }
  if (nome.includes("triagem")) {
    return {
      titulo: "Currículo em análise",
      detalhe: "Seu currículo está sendo avaliado para esta vaga.",
      tom: "andamento",
    };
  }
  if (nome.includes("contato")) {
    return {
      titulo: "Vamos entrar em contato",
      detalhe: "O RH vai ligar ou mandar mensagem. Deixe o telefone à mão.",
      tom: "andamento",
    };
  }
  if (nome.includes("entrevista")) {
    return {
      titulo: "Entrevista",
      detalhe: "Você está na etapa de entrevista. O RH combina data e horário com você.",
      tom: "andamento",
    };
  }
  if (nome.includes("teste")) {
    return {
      titulo: "Teste prático",
      detalhe: "Você foi chamado para o teste prático. O RH combina o dia com você.",
      tom: "andamento",
    };
  }
  if (nome.includes("proposta")) {
    return {
      titulo: "Proposta enviada",
      detalhe: "Você recebeu uma proposta. Responda aqui embaixo ou fale com o RH.",
      tom: "bom",
    };
  }
  if (nome.includes("documenta") || nome.includes("exame")) {
    return {
      titulo: "Documentação e exames",
      detalhe: "Estamos reunindo seus documentos e agendando o exame admissional.",
      tom: "bom",
    };
  }
  return { titulo: "Em andamento", detalhe: "Sua candidatura está em análise.", tom: "andamento" };
}
