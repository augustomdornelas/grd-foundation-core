// ============================================================
// Dashboard de Ponto — a leitura, e só ela
// ------------------------------------------------------------
// A REGRA QUE MANDA NESTE ARQUIVO: nada aqui fala com a Secullum.
// Todo dado sai das tabelas locais que os jobs alimentam de
// madrugada. A API deles tem teto de requisições por hora; uma tela
// que a consultasse a cada F5 gastaria a cota do dia numa manhã e
// derrubaria o próprio sync junto.
//
// O preço é o dado ser de ontem, e o preço aparece: `frescor` sai da
// view vw_secullum_frescor, calculada NO BANCO — no navegador ela
// dependeria do relógio da máquina de quem olha, que numa obra está
// errado com frequência.
//
// Este arquivo só busca e tipa. Quem calcula é ponto-metricas.ts, que
// é puro e não sabe o que é Supabase. A separação é o que permite
// conferir uma conta sem subir a tela inteira.
// ============================================================
import { supabase } from "@/integrations/supabase/client";

// ------------------------------------------------------------
// Datas — sempre no fuso de quem olha, nunca em UTC
// ------------------------------------------------------------
/**
 * Hoje em yyyy-mm-dd, no fuso LOCAL.
 *
 * `toISOString().slice(0,10)` seria o caminho curto e está errado: às
 * 21h de Brasília ele já devolve a data de amanhã, e a faixa de hoje
 * apareceria vazia justamente no fim do turno da tarde — o momento em
 * que alguém mais provavelmente olha a tela.
 */
export function hojeLocal(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Primeiro dia do mês de uma data ISO. É a chave de `competencia`. */
export function competenciaDe(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Desloca uma competência em N meses. Aceita negativo. */
export function competenciaMais(competencia: string, meses: number): string {
  const [a, m] = competencia.split("-").map(Number);
  const d = new Date(a, m - 1 + meses, 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-01`;
}

// ------------------------------------------------------------
// O que vem de cada tabela
// ------------------------------------------------------------
export type FuncionarioPonto = {
  secullumId: number | null;
  nome: string;
  cpf: string;
  numeroFolha: string;
  admissao: string | null;
  demissao: string | null;
  departamento: string;
  funcao: string;
  horarioNumero: number | null;
  nascimento: string | null;
  sexo: string;
  ativo: boolean;
  projetoId: string | null;
  funcionarioId: string | null;
};

export type BatidaPonto = {
  cpf: string;
  data: string;
  horario: string;
  fonteTipo: number | null;
  fonteOrigem: number | null;
  equipamento: string;
};

export type TotalPonto = {
  cpf: string;
  competencia: string;
  coluna: string;
  minutos: number;
};

export type AfastamentoPonto = {
  cpf: string;
  justificativa: string;
  inicio: string;
  fim: string | null;
  observacao: string;
};

export type PendenciaPonto = {
  cpf: string;
  dataReferencia: string | null;
  tipo: string;
  descricao: string;
  solicitadoEm: string | null;
};

export type HorarioPonto = {
  numero: number;
  descricao: string;
  /** Vazio = a Secullum não mandou a escala. Não é "não trabalha nunca". */
  dias: string[];
  desativar: boolean;
};

export type FrescorPonto = {
  tipo: string;
  ultimaConclusao: string | null;
  ultimoStatus: string | null;
  ultimosRegistros: number | null;
  ultimoErro: string | null;
  horasDesde: number | null;
  atrasado: boolean;
};

/**
 * O lado Portal do colaborador.
 *
 * Entra aqui por três motivos concretos, e não por completude: o
 * telefone da lista "quem faltou hoje" só existe deste lado; a
 * conciliação por CPF compara os dois cadastros; e o bloqueio por ASO
 * ou NR vencida é documento do Portal, não da Secullum.
 */
export type ColaboradorPortalPonto = {
  id: string;
  nome: string;
  cpf: string;
  telefone: string;
  matricula: string;
  situacao: string;
  ativo: boolean;
  projetoId: string | null;
  cargo: string;
};

/**
 * Documento com data de vencimento. Só os que TÊM vencimento e estão
 * ativos: documento sem validade nunca vence, e incluí-lo obrigaria
 * cada leitura a filtrar de novo.
 */
export type DocumentoVencePonto = {
  funcionarioId: string;
  tipoNome: string;
  categoria: string;
  bloqueiaAlocacao: boolean;
  vencimento: string | null;
};

/** Ocupação do plano do Ponto Web. NULL = a Secullum não informou. */
export type LicencaPonto = { limite: number | null; emUso: number | null };

/**
 * Salário vigente, para o custo da hora extra.
 *
 * Vem de rh_funcionario_remuneracao, que existe como tabela separada só
 * para isolar o salário via RLS: a policy de lá exige Diretoria ou RH.
 * Por isso NÃO há checagem de perfil neste arquivo — para os demais a
 * consulta simplesmente volta vazia, e a aba esconde o cartão. Quem
 * decide é o banco, não a tela.
 */
export type RemuneracaoPonto = {
  funcionarioId: string;
  salario: number;
  vigenciaInicio: string;
  vigenciaFim: string | null;
};

export type DadosPonto = {
  funcionarios: FuncionarioPonto[];
  batidas: BatidaPonto[];
  totais: TotalPonto[];
  afastamentos: AfastamentoPonto[];
  pendencias: PendenciaPonto[];
  horarios: HorarioPonto[];
  frescor: FrescorPonto[];
  colaboradoresPortal: ColaboradorPortalPonto[];
  documentos: DocumentoVencePonto[];
  licenca: LicencaPonto | null;
  remuneracoes: RemuneracaoPonto[];
  /** Primeiro erro de leitura, se houve. A tela mostra em vez de fingir zero. */
  erro: string | null;
};

export const DADOS_VAZIOS: DadosPonto = {
  funcionarios: [],
  batidas: [],
  totais: [],
  afastamentos: [],
  pendencias: [],
  horarios: [],
  frescor: [],
  colaboradoresPortal: [],
  documentos: [],
  licenca: null,
  remuneracoes: [],
  erro: null,
};

// ------------------------------------------------------------
// Busca
// ------------------------------------------------------------
// O Supabase corta cada resposta em 1000 linhas. Batidas passam disso
// com folga: 20 pessoas × 4 marcações × 13 meses já são mais de 30
// mil. Sem paginar, a maior parte do período simplesmente não chegaria
// — e os gráficos por mês ficariam com os meses antigos vazios, o que
// parece dado real e não é.
const PAGINA = 1000;

async function buscarPaginado<T>(
  montar: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
  mapear: (linha: Record<string, unknown>) => T,
): Promise<{ linhas: T[]; erro: string | null }> {
  const linhas: T[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await montar(offset, offset + PAGINA - 1);
    if (error) {
      const msg = (error as { message?: string }).message ?? String(error);
      return { linhas, erro: msg };
    }
    const lote = data ?? [];
    for (const l of lote) linhas.push(mapear(l as Record<string, unknown>));
    if (lote.length < PAGINA) return { linhas, erro: null };
  }
}

const txt = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Quantos meses de histórico a tela carrega.
 *
 * 13 e não 12: os gráficos de doze meses precisam do mês corrente MAIS
 * os doze anteriores para que a barra mais antiga não apareça pela
 * metade. Treze meses de batidas de uma equipe de vinte pessoas são
 * ~30 mil linhas — grande, mas paginado e de uma vez só, o que é
 * melhor que refazer a consulta a cada troca de aba.
 */
export const MESES_DE_HISTORICO = 13;

export async function buscarDadosPonto(hoje = hojeLocal()): Promise<DadosPonto> {
  const desde = competenciaMais(competenciaDe(hoje), -(MESES_DE_HISTORICO - 1));

  const [func, bat, tot, afa, pen, hor, fre, port, doc, lic, rem] = await Promise.all([
    buscarPaginado(
      (de, ate) =>
        supabase
          .from("secullum_funcionarios")
          .select(
            "secullum_id,nome,cpf,numero_folha,admissao,demissao,departamento,funcao," +
              "horario_numero,nascimento,sexo,ativo,projeto_id,funcionario_id",
          )
          .order("nome", { ascending: true })
          .range(de, ate),
      (r): FuncionarioPonto => ({
        secullumId: num(r.secullum_id),
        nome: txt(r.nome),
        cpf: txt(r.cpf),
        numeroFolha: txt(r.numero_folha),
        admissao: (r.admissao as string) ?? null,
        demissao: (r.demissao as string) ?? null,
        departamento: txt(r.departamento),
        funcao: txt(r.funcao),
        horarioNumero: num(r.horario_numero),
        nascimento: (r.nascimento as string) ?? null,
        sexo: txt(r.sexo),
        ativo: r.ativo === true,
        projetoId: (r.projeto_id as string) ?? null,
        funcionarioId: (r.funcionario_id as string) ?? null,
      }),
    ),
    buscarPaginado(
      (de, ate) =>
        supabase
          .from("ponto_batidas")
          .select("cpf,data,horario,fonte_tipo,fonte_origem,equipamento")
          .gte("data", desde)
          .order("data", { ascending: false })
          .order("cpf", { ascending: true })
          .order("horario", { ascending: true })
          .range(de, ate),
      (r): BatidaPonto => ({
        cpf: txt(r.cpf),
        data: txt(r.data),
        horario: txt(r.horario),
        fonteTipo: num(r.fonte_tipo),
        fonteOrigem: num(r.fonte_origem),
        equipamento: txt(r.equipamento),
      }),
    ),
    buscarPaginado(
      (de, ate) =>
        supabase
          .from("ponto_totais")
          .select("cpf,competencia,coluna,valor_minutos")
          .gte("competencia", desde)
          .order("competencia", { ascending: false })
          .range(de, ate),
      (r): TotalPonto => ({
        cpf: txt(r.cpf),
        competencia: txt(r.competencia),
        coluna: txt(r.coluna),
        minutos: num(r.valor_minutos) ?? 0,
      }),
    ),
    buscarPaginado(
      (de, ate) =>
        supabase
          .from("secullum_afastamentos")
          .select("cpf,justificativa,inicio,fim,observacao")
          .order("inicio", { ascending: false })
          .range(de, ate),
      (r): AfastamentoPonto => ({
        cpf: txt(r.cpf),
        justificativa: txt(r.justificativa),
        inicio: txt(r.inicio),
        fim: (r.fim as string) ?? null,
        observacao: txt(r.observacao),
      }),
    ),
    buscarPaginado(
      (de, ate) =>
        supabase
          .from("secullum_pendencias")
          .select("cpf,data_referencia,tipo,descricao,solicitado_em")
          .order("data_referencia", { ascending: false })
          .range(de, ate),
      (r): PendenciaPonto => ({
        cpf: txt(r.cpf),
        dataReferencia: (r.data_referencia as string) ?? null,
        tipo: txt(r.tipo),
        descricao: txt(r.descricao),
        solicitadoEm: (r.solicitado_em as string) ?? null,
      }),
    ),
    buscarPaginado(
      (de, ate) =>
        supabase
          .from("secullum_horarios")
          .select("numero,descricao,dias,desativar")
          .order("numero", { ascending: true })
          .range(de, ate),
      (r): HorarioPonto => ({
        numero: num(r.numero) ?? 0,
        descricao: txt(r.descricao),
        dias: Array.isArray(r.dias) ? (r.dias as unknown[]).map(txt) : [],
        desativar: r.desativar === true,
      }),
    ),
    buscarPaginado(
      (de, ate) => supabase.from("vw_secullum_frescor").select("*").range(de, ate),
      (r): FrescorPonto => ({
        tipo: txt(r.tipo),
        ultimaConclusao: (r.ultima_conclusao as string) ?? null,
        ultimoStatus: (r.ultimo_status as string) ?? null,
        ultimosRegistros: num(r.ultimos_registros),
        ultimoErro: (r.ultimo_erro as string) ?? null,
        horasDesde: num(r.horas_desde),
        atrasado: r.atrasado === true,
      }),
    ),
    buscarPaginado(
      (de, ate) =>
        supabase
          .from("funcionarios")
          .select("id,nome,cpf,telefone,matricula,situacao,ativo,projeto_id,cargo")
          .order("nome", { ascending: true })
          .range(de, ate),
      (r): ColaboradorPortalPonto => ({
        id: txt(r.id),
        nome: txt(r.nome),
        cpf: txt(r.cpf),
        telefone: txt(r.telefone),
        matricula: txt(r.matricula),
        situacao: txt(r.situacao),
        ativo: r.ativo === true,
        projetoId: (r.projeto_id as string) ?? null,
        cargo: txt(r.cargo),
      }),
    ),
    // Só documento ATIVO e COM vencimento. Documento sem validade nunca
    // vence, e trazê-lo obrigaria cada leitura a filtrar de novo — além
    // de arrastar anexo de admissão que não interessa a esta tela.
    buscarPaginado(
      (de, ate) =>
        supabase
          .from("rh_funcionario_documentos")
          .select(
            "funcionario_id,data_vencimento," +
              "rh_tipos_documento(nome,categoria,bloqueia_alocacao)",
          )
          .eq("ativo", true)
          .not("data_vencimento", "is", null)
          .order("data_vencimento", { ascending: true })
          .range(de, ate),
      (r): DocumentoVencePonto => {
        const tipo = (r.rh_tipos_documento ?? {}) as Record<string, unknown>;
        return {
          funcionarioId: txt(r.funcionario_id),
          tipoNome: txt(tipo.nome),
          categoria: txt(tipo.categoria),
          bloqueiaAlocacao: tipo.bloqueia_alocacao === true,
          vencimento: (r.data_vencimento as string) ?? null,
        };
      },
    ),
    buscarPaginado(
      (de, ate) => supabase.from("secullum_licenca").select("limite,em_uso").range(de, ate),
      (r): LicencaPonto => ({ limite: num(r.limite), emUso: num(r.em_uso) }),
    ),
    buscarPaginado(
      (de, ate) =>
        supabase
          .from("rh_funcionario_remuneracao")
          .select("funcionario_id,salario,vigencia_inicio,vigencia_fim")
          .order("vigencia_inicio", { ascending: false })
          .range(de, ate),
      (r): RemuneracaoPonto => ({
        funcionarioId: txt(r.funcionario_id),
        salario: num(r.salario) ?? 0,
        vigenciaInicio: txt(r.vigencia_inicio),
        vigenciaFim: (r.vigencia_fim as string) ?? null,
      }),
    ),
  ]);

  // O primeiro erro basta: se a RLS barrou uma tabela, barrou todas, e
  // seis mensagens iguais na tela não ajudam ninguém.
  const erro =
    func.erro ??
    bat.erro ??
    tot.erro ??
    afa.erro ??
    pen.erro ??
    hor.erro ??
    fre.erro ??
    port.erro ??
    doc.erro ??
    lic.erro ??
    null;

  return {
    funcionarios: func.linhas,
    batidas: bat.linhas,
    totais: tot.linhas,
    afastamentos: afa.linhas,
    pendencias: pen.linhas,
    horarios: hor.linhas,
    frescor: fre.linhas,
    colaboradoresPortal: port.linhas,
    documentos: doc.linhas,
    licenca: lic.linhas[0] ?? null,
    remuneracoes: rem.linhas,
    erro,
  };
}
