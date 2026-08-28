// ============================================================
// Dashboard de Ponto — as contas
// ------------------------------------------------------------
// Puro: entra `DadosPonto`, sai número. Não sabe o que é Supabase,
// React ou fuso horário do servidor. É o que permite conferir uma
// conta discutível — turnover, "trabalhando agora" — sem subir a tela.
//
// A REGRA DE OURO DESTE ARQUIVO: ausência de dado nunca vira zero.
// Zero é uma afirmação ("ninguém está de férias"); dado que não
// chegou é outra coisa, e cada métrica que pode estar nesse estado
// devolve `null` para a tela dizer "não sei" em vez de mentir.
// ============================================================
import type {
  AfastamentoPonto,
  BatidaPonto,
  ColaboradorPortalPonto,
  DadosPonto,
  DocumentoVencePonto,
  FuncionarioPonto,
  HorarioPonto,
} from "@/lib/ponto-dados";
import { competenciaDe, competenciaMais } from "@/lib/ponto-dados";
import { soDigitos } from "@/lib/documento";

// ------------------------------------------------------------
// Filtros
// ------------------------------------------------------------
export type FiltroPonto = {
  /** Primeiro dia do mês, yyyy-mm-01. */
  competencia: string;
  /** Nome do departamento da Secullum. Vazio = todas. */
  obra: string;
  /** Nome da função. Vazio = todas. */
  funcao: string;
};

export const TODAS = "";

function passaNoFiltro(f: FuncionarioPonto, filtro: FiltroPonto): boolean {
  if (filtro.obra !== TODAS && f.departamento !== filtro.obra) return false;
  if (filtro.funcao !== TODAS && f.funcao !== filtro.funcao) return false;
  return true;
}

// ------------------------------------------------------------
// Utilidades de data
// ------------------------------------------------------------
/** Domingo = 0. Lê a data ISO sem passar por Date, que muda com o fuso. */
export function diaDaSemana(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).getDay();
}

export const NOME_DIA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** Idade em anos completos na data de referência. */
export function idadeEm(nascimento: string, referencia: string): number {
  const [an, mn, dn] = nascimento.split("-").map(Number);
  const [ar, mr, dr] = referencia.split("-").map(Number);
  let idade = ar - an;
  if (mr < mn || (mr === mn && dr < dn)) idade -= 1;
  return idade;
}

/** Meses completos entre duas datas ISO. */
export function mesesEntre(de: string, ate: string): number {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  let meses = (a2 - a1) * 12 + (m2 - m1);
  if (d2 < d1) meses -= 1;
  return meses;
}

export function minutosParaHoras(min: number): string {
  const sinal = min < 0 ? "-" : "";
  const abs = Math.abs(Math.round(min));
  return `${sinal}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}`;
}

// ------------------------------------------------------------
// Escala: quem trabalha em qual dia
// ------------------------------------------------------------
/**
 * A pessoa trabalha neste dia da semana?
 *
 * Três respostas, não duas. `null` é "não sei" — a Secullum não mandou
 * a escala daquele horário, ou a pessoa não tem horário. A diferença
 * importa porque é ela que separa o tile "Em folga" de uma contagem
 * inventada: sem escala, quem não bateu ponto num domingo seria
 * classificado como faltante.
 */
export function trabalhaNoDia(horario: HorarioPonto | undefined, dia: number): boolean | null {
  if (!horario || horario.dias.length === 0) return null;
  // A Secullum devolve a semana começando no domingo. Escala mais
  // curta que sete posições é escala que não entendemos: melhor "não
  // sei" que um palpite silencioso.
  if (horario.dias.length < 7) return null;
  const v = (horario.dias[dia] ?? "").trim().toLowerCase();
  if (!v) return null;
  // Folga aparece como "folga", "0", "-" ou vazio conforme a conta.
  if (["folga", "0", "-", "descanso", "dsr", "false", "nao", "não"].includes(v)) return false;
  return true;
}

// ------------------------------------------------------------
// Afastamentos: as três famílias
// ------------------------------------------------------------
export type FamiliaAfastamento = "ferias" | "afastado" | "justificada";

/**
 * Em qual tile o afastamento cai.
 *
 * A classificação mora AQUI, e não no job de sincronização, de
 * propósito: a justificativa é texto livre digitado no Ponto Web, a
 * regra vai errar e vai precisar de ajuste. Classificando na leitura,
 * corrigir a regra é editar esta função; classificando na gravação,
 * seria re-sincronizar tudo — e o histórico antigo continuaria com a
 * regra velha.
 */
export function familiaDoAfastamento(justificativa: string): FamiliaAfastamento {
  const j = justificativa.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (j.includes("ferias")) return "ferias";
  if (
    j.includes("afastamento") ||
    j.includes("inss") ||
    j.includes("auxilio") ||
    j.includes("licenca") ||
    j.includes("maternidade") ||
    j.includes("paternidade") ||
    j.includes("acidente")
  ) {
    return "afastado";
  }
  // Atestado, falta abonada, folga concedida e o resto do texto livre.
  return "justificada";
}

function vigenteEm(a: AfastamentoPonto, dia: string): boolean {
  return a.inicio <= dia && (!a.fim || a.fim >= dia);
}

// ------------------------------------------------------------
// Origem das batidas
// ------------------------------------------------------------
/** O enum de fonte_origem da Secullum, documentado na migration do cache. */
export const ORIGEM_BATIDA: Record<number, string> = {
  1: "Relógio de ponto",
  2: "Inclusão manual",
  5: "Central web",
  6: "Aplicativo",
  7: "Aplicativo",
  8: "Integração",
};

export function nomeDaOrigem(codigo: number | null): string {
  if (codigo === null) return "Não informada";
  return ORIGEM_BATIDA[codigo] ?? `Código ${codigo}`;
}

// ------------------------------------------------------------
// Contagem genérica, ordenada
// ------------------------------------------------------------
export type Fatia = { chave: string; valor: number };

function contar(itens: string[]): Fatia[] {
  const mapa = new Map<string, number>();
  for (const i of itens) mapa.set(i, (mapa.get(i) ?? 0) + 1);
  return [...mapa.entries()]
    .map(([chave, valor]) => ({ chave, valor }))
    .sort((a, b) => b.valor - a.valor || a.chave.localeCompare(b.chave, "pt-BR"));
}

/**
 * Agrupa a cauda em "Outros" a partir da sétima categoria.
 *
 * Sete cores é o limite da paleta. A oitava série teria que repetir uma
 * cor, e duas séries da mesma cor num gráfico empilhado é pior que não
 * mostrar a oitava.
 */
export function comOutros(fatias: Fatia[], limite = 6): Fatia[] {
  if (fatias.length <= limite + 1) return fatias;
  const cabeca = fatias.slice(0, limite);
  const resto = fatias.slice(limite).reduce((s, f) => s + f.valor, 0);
  return resto > 0 ? [...cabeca, { chave: "Outros", valor: resto }] : cabeca;
}

// ============================================================
// A FAIXA DE HOJE
// ============================================================
export type PessoaHoje = {
  cpf: string;
  nome: string;
  obra: string;
  funcao: string;
  telefone: string;
};

export type BatidaHoje = {
  nome: string;
  obra: string;
  horario: string;
  origem: string;
};

export type FaixaHoje = {
  dia: string;
  /** O número principal: quantos registraram ponto hoje. */
  colaboradoresDoDia: number;
  /** Entrada sem saída correspondente hoje. `null` quando não há batida nenhuma. */
  trabalhandoAgora: number;
  escaladosHoje: number | null;
  faltantes: number | null;
  emFolga: number | null;
  /** true quando nenhuma escala é conhecida: folga e faltante viram "não sei". */
  escalaDesconhecida: boolean;
  deFerias: number;
  afastados: number;
  ausenciaJustificada: number;
  solicitacoesPendentes: number;
  porObra: Fatia[];
  quemFaltou: PessoaHoje[];
  batidas: BatidaHoje[];
};

export function calcularHoje(dados: DadosPonto, filtro: FiltroPonto, hoje: string): FaixaHoje {
  const ativos = dados.funcionarios.filter((f) => f.ativo && passaNoFiltro(f, filtro));
  const porCpf = new Map(ativos.map((f) => [f.cpf, f]));

  const telefonePorCpf = new Map(
    dados.colaboradoresPortal.map((c) => [soDigitos(c.cpf), c.telefone]),
  );

  const horarioPorNumero = new Map(dados.horarios.map((h) => [h.numero, h]));

  const batidasHoje = dados.batidas.filter((b) => b.data === hoje && porCpf.has(b.cpf));

  // ---------- quem apareceu ----------
  const cpfsComBatida = new Set(batidasHoje.map((b) => b.cpf));

  // ---------- trabalhando agora ----------
  // Número ÍMPAR de batidas no dia = a última foi entrada e não houve
  // a saída correspondente. É a mesma definição do painel da Secullum,
  // "dentro da empresa neste instante" — e não "veio hoje". Se usarmos
  // outra e não dissermos, os dois painéis discordam e ninguém confia
  // em nenhum dos dois. A tela repete isso no tooltip.
  const porPessoa = new Map<string, number>();
  for (const b of batidasHoje) porPessoa.set(b.cpf, (porPessoa.get(b.cpf) ?? 0) + 1);
  const trabalhandoAgora = [...porPessoa.values()].filter((n) => n % 2 === 1).length;

  // ---------- afastados hoje ----------
  const afastadosHoje = dados.afastamentos.filter((a) => vigenteEm(a, hoje) && porCpf.has(a.cpf));
  const cpfsAfastados = new Set(afastadosHoje.map((a) => a.cpf));
  const familia = (fam: FamiliaAfastamento) =>
    afastadosHoje.filter((a) => familiaDoAfastamento(a.justificativa) === fam).length;

  // ---------- escala ----------
  const dia = diaDaSemana(hoje);
  let escalados = 0;
  let folga = 0;
  let semEscala = 0;
  const faltantes: PessoaHoje[] = [];

  for (const f of ativos) {
    if (cpfsAfastados.has(f.cpf)) continue; // afastado não é nem folga nem falta
    const trabalha = trabalhaNoDia(
      f.horarioNumero === null ? undefined : horarioPorNumero.get(f.horarioNumero),
      dia,
    );
    if (trabalha === null) {
      semEscala += 1;
      continue;
    }
    if (!trabalha) {
      folga += 1;
      continue;
    }
    escalados += 1;
    if (!cpfsComBatida.has(f.cpf)) {
      faltantes.push({
        cpf: f.cpf,
        nome: f.nome,
        obra: f.departamento,
        funcao: f.funcao,
        telefone: telefonePorCpf.get(f.cpf) ?? "",
      });
    }
  }

  // Nenhuma escala conhecida: folga e faltante não são calculáveis. A
  // tela mostra travessão, não zero.
  const escalaDesconhecida = semEscala > 0 && escalados === 0 && folga === 0;

  // ---------- por obra ----------
  const porObra = contar(
    [...cpfsComBatida].map((cpf) => porCpf.get(cpf)?.departamento || "Sem obra"),
  );

  // ---------- lista de batidas ----------
  const batidas: BatidaHoje[] = batidasHoje
    .map((b) => ({
      nome: porCpf.get(b.cpf)?.nome ?? b.cpf,
      obra: porCpf.get(b.cpf)?.departamento ?? "",
      horario: b.horario.slice(0, 5),
      origem: nomeDaOrigem(b.fonteOrigem),
    }))
    .sort((a, b) => b.horario.localeCompare(a.horario) || a.nome.localeCompare(b.nome, "pt-BR"));

  return {
    dia: hoje,
    colaboradoresDoDia: cpfsComBatida.size,
    trabalhandoAgora,
    escaladosHoje: escalaDesconhecida ? null : escalados,
    faltantes: escalaDesconhecida ? null : faltantes.length,
    emFolga: escalaDesconhecida ? null : folga,
    escalaDesconhecida,
    deFerias: familia("ferias"),
    afastados: familia("afastado"),
    ausenciaJustificada: familia("justificada"),
    solicitacoesPendentes: dados.pendencias.length,
    porObra,
    quemFaltou: faltantes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    batidas,
  };
}

// ============================================================
// EQUIPE
// ============================================================
export type Equipe = {
  efetivo: number;
  porObra: Fatia[];
  porFuncao: Fatia[];
  tempoDeCasa: Fatia[];
  faixaEtaria: Fatia[];
  semNascimento: number;
  semAdmissao: number;
  licenca: { limite: number | null; emUso: number; pct: number | null };
};

const FAIXAS_CASA: [string, number, number][] = [
  ["Até 3 meses", 0, 3],
  ["3 a 6 meses", 3, 6],
  ["6 a 12 meses", 6, 12],
  ["1 a 2 anos", 12, 24],
  ["2 a 5 anos", 24, 60],
  ["5 anos ou mais", 60, Infinity],
];

const FAIXAS_IDADE: [string, number, number][] = [
  ["18 a 24", 18, 25],
  ["25 a 34", 25, 35],
  ["35 a 44", 35, 45],
  ["45 a 54", 45, 55],
  ["55 ou mais", 55, Infinity],
];

function emFaixa(valor: number, faixas: [string, number, number][]): string | null {
  for (const [nome, de, ate] of faixas) {
    if (valor >= de && valor < ate) return nome;
  }
  return null;
}

/** Ordena pelas faixas declaradas, e não pelo tamanho: faixa é escala. */
function naOrdemDasFaixas(mapa: Map<string, number>, faixas: [string, number, number][]): Fatia[] {
  return faixas
    .map(([nome]) => ({ chave: nome, valor: mapa.get(nome) ?? 0 }))
    .filter((f) => f.valor > 0);
}

export function calcularEquipe(dados: DadosPonto, filtro: FiltroPonto, hoje: string): Equipe {
  const ativos = dados.funcionarios.filter((f) => f.ativo && passaNoFiltro(f, filtro));

  const casa = new Map<string, number>();
  const idade = new Map<string, number>();
  let semNascimento = 0;
  let semAdmissao = 0;

  for (const f of ativos) {
    if (f.admissao) {
      const nome = emFaixa(mesesEntre(f.admissao, hoje), FAIXAS_CASA);
      if (nome) casa.set(nome, (casa.get(nome) ?? 0) + 1);
    } else {
      semAdmissao += 1;
    }
    if (f.nascimento) {
      const nome = emFaixa(idadeEm(f.nascimento, hoje), FAIXAS_IDADE);
      if (nome) idade.set(nome, (idade.get(nome) ?? 0) + 1);
    } else {
      semNascimento += 1;
    }
  }

  // Em uso vem do que a Secullum contou, não do que temos espelhado:
  // quem não tem CPF válido não entra no nosso espelho e mesmo assim
  // ocupa licença lá. Sem o número deles, o nosso é o piso.
  const emUso = dados.licenca?.emUso ?? dados.funcionarios.filter((f) => f.ativo).length;
  const limite = dados.licenca?.limite ?? null;

  return {
    efetivo: ativos.length,
    porObra: contar(ativos.map((f) => f.departamento || "Sem obra")),
    porFuncao: comOutros(contar(ativos.map((f) => f.funcao || "Sem função"))),
    tempoDeCasa: naOrdemDasFaixas(casa, FAIXAS_CASA),
    faixaEtaria: naOrdemDasFaixas(idade, FAIXAS_IDADE),
    semNascimento,
    semAdmissao,
    licenca: {
      limite,
      emUso,
      pct: limite && limite > 0 ? Math.round((emUso / limite) * 100) : null,
    },
  };
}

// ============================================================
// ROTATIVIDADE
// ============================================================
export type MesRotatividade = {
  competencia: string;
  rotulo: string;
  admissoes: number;
  demissoes: number;
  efetivoMedio: number;
  turnover: number | null;
};

export type Rotatividade = {
  meses: MesRotatividade[];
  porObra: { chave: string; admissoes: number; demissoes: number; turnover: number | null }[];
  sobrevivencia: { chave: string; valor: number }[];
  baseSobrevivencia: number;
  demissoesRecentes: { nome: string; obra: string; funcao: string; data: string; casa: string }[];
};

export function rotuloDeCompetencia(competencia: string): string {
  const meses = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  const [a, m] = competencia.split("-").map(Number);
  return `${meses[m - 1]}/${String(a).slice(2)}`;
}

/** Efetivo ativo num instante: admitido até a data e não demitido antes dela. */
function efetivoEm(pessoas: FuncionarioPonto[], dia: string): number {
  return pessoas.filter(
    (f) => (!f.admissao || f.admissao <= dia) && (!f.demissao || f.demissao >= dia),
  ).length;
}

export function calcularRotatividade(
  dados: DadosPonto,
  filtro: FiltroPonto,
  hoje: string,
  meses = 12,
): Rotatividade {
  // Rotatividade olha demitidos também — filtrar por `ativo` aqui
  // esconderia exatamente o que a aba existe para mostrar.
  const pessoas = dados.funcionarios.filter((f) => passaNoFiltro(f, filtro));
  const fimJanela = competenciaDe(hoje);

  const linhas: MesRotatividade[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const comp = competenciaMais(fimJanela, -i);
    const proximo = competenciaMais(comp, 1);
    const admissoes = pessoas.filter(
      (f) => f.admissao && f.admissao >= comp && f.admissao < proximo,
    ).length;
    const demissoes = pessoas.filter(
      (f) => f.demissao && f.demissao >= comp && f.demissao < proximo,
    ).length;

    const inicio = efetivoEm(pessoas, comp);
    const fim = efetivoEm(pessoas, competenciaMais(proximo, 0));
    const efetivoMedio = (inicio + fim) / 2;

    linhas.push({
      competencia: comp,
      rotulo: rotuloDeCompetencia(comp),
      admissoes,
      demissoes,
      efetivoMedio,
      // Turnover clássico: média de entradas e saídas sobre o efetivo
      // médio. `null` quando não havia ninguém — dividir por zero daria
      // Infinity, que num gráfico vira uma barra até o teto.
      turnover:
        efetivoMedio > 0
          ? Math.round((((admissoes + demissoes) / 2 / efetivoMedio) * 100 + Number.EPSILON) * 10) /
            10
          : null,
    });
  }

  // ---------- por obra ----------
  const janelaInicio = competenciaMais(fimJanela, -(meses - 1));
  const obras = new Map<string, { admissoes: number; demissoes: number }>();
  for (const f of pessoas) {
    const obra = f.departamento || "Sem obra";
    const atual = obras.get(obra) ?? { admissoes: 0, demissoes: 0 };
    if (f.admissao && f.admissao >= janelaInicio) atual.admissoes += 1;
    if (f.demissao && f.demissao >= janelaInicio) atual.demissoes += 1;
    obras.set(obra, atual);
  }
  const porObra = [...obras.entries()]
    .map(([chave, v]) => {
      const efetivo = pessoas.filter(
        (f) => (f.departamento || "Sem obra") === chave && f.ativo,
      ).length;
      return {
        chave,
        admissoes: v.admissoes,
        demissoes: v.demissoes,
        turnover:
          efetivo > 0 ? Math.round(((v.admissoes + v.demissoes) / 2 / efetivo) * 1000) / 10 : null,
      };
    })
    .filter((o) => o.admissoes > 0 || o.demissoes > 0)
    .sort((a, b) => b.demissoes - a.demissoes || b.admissoes - a.admissoes);

  // ---------- sobrevivência ----------
  // Só entra quem teve tempo de chegar ao marco: alguém admitido há 40
  // dias não "sobreviveu 90" nem "saiu antes de 90" — ainda está a
  // caminho. Contá-lo como sobrevivente inflaria o número.
  const marcos = [30, 90, 180];
  const elegiveis = pessoas.filter((f) => f.admissao);
  const sobrevivencia = marcos.map((d) => {
    const base = elegiveis.filter((f) => diasEntre(f.admissao!, hoje) >= d);
    const vivos = base.filter((f) => !f.demissao || diasEntre(f.admissao!, f.demissao) >= d);
    return {
      chave: `${d} dias`,
      valor: base.length > 0 ? Math.round((vivos.length / base.length) * 1000) / 10 : 0,
    };
  });

  // ---------- demissões recentes ----------
  const demissoesRecentes = pessoas
    .filter((f) => f.demissao)
    .sort((a, b) => (b.demissao ?? "").localeCompare(a.demissao ?? ""))
    .slice(0, 15)
    .map((f) => ({
      nome: f.nome,
      obra: f.departamento || "—",
      funcao: f.funcao || "—",
      data: f.demissao!,
      casa: f.admissao ? descreverMeses(mesesEntre(f.admissao, f.demissao!)) : "—",
    }));

  return {
    meses: linhas,
    porObra,
    sobrevivencia,
    baseSobrevivencia: elegiveis.length,
    demissoesRecentes,
  };
}

/** Último dia da competência, para checar vigência de salário. */
function ultimoDiaDaCompetencia(competencia: string): string {
  const proximo = competenciaMais(competencia, 1);
  const [a, m] = proximo.split("-").map(Number);
  const d = new Date(a, m - 1, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

function descreverMeses(meses: number): string {
  if (meses < 1) return "menos de 1 mês";
  if (meses < 12) return `${meses} ${meses === 1 ? "mês" : "meses"}`;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  return resto === 0 ? `${anos} ano(s)` : `${anos}a ${resto}m`;
}

// ============================================================
// HORAS E EXTRAS
// ============================================================
/**
 * Como uma coluna do relatório da Secullum vira categoria nossa.
 *
 * O relatório /Calcular/SomenteTotais devolve colunas com nome livre,
 * e o formato NUNCA foi confirmado contra a conta da GRD. Por isso o
 * reconhecimento é por trecho de texto e tem uma saída explícita
 * ("outras"): coluna desconhecida aparece como "outras" na tela, o que
 * é um convite a ajustar o mapa — em vez de sumir sem ninguém notar.
 */
export type CategoriaHora = "normais" | "extras" | "noturnas" | "faltas" | "atrasos" | "outras";

export function categoriaDaColuna(coluna: string): CategoriaHora {
  const c = coluna.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (c.includes("extra") || c.includes("he ")) return "extras";
  if (c.includes("noturn") || c.includes("adic")) return "noturnas";
  if (c.includes("falta")) return "faltas";
  if (c.includes("atraso")) return "atrasos";
  if (c.includes("normal") || c.includes("trabalhad") || c.includes("normais")) return "normais";
  return "outras";
}

export const ROTULO_CATEGORIA: Record<CategoriaHora, string> = {
  normais: "Normais",
  extras: "Extras",
  noturnas: "Noturnas",
  faltas: "Faltas",
  atrasos: "Atrasos",
  outras: "Outras",
};

export type HorasExtras = {
  /** Por obra, minutos por categoria. Alimenta a barra empilhada. */
  composicaoPorObra: (Record<string, number> & { chave: string })[];
  categoriasPresentes: CategoriaHora[];
  extrasPorMes: { chave: string; valor: number }[];
  topExtras: { nome: string; obra: string; minutos: number }[];
  totalExtras: number;
  totalNormais: number;
  /**
   * Custo da extra por obra. Lista vazia = não há salário legível, e a
   * aba esconde o cartão em vez de mostrar R$ 0,00 — que seria uma
   * afirmação falsa sobre o custo.
   */
  custoPorObra: { chave: string; valor: number }[];
  /** Quantos dos que fizeram extra não têm salário vigente cadastrado. */
  semSalario: number;
  /** true quando ponto_totais não trouxe nada — a tela diz isso. */
  semDados: boolean;
};

export function calcularHoras(dados: DadosPonto, filtro: FiltroPonto): HorasExtras {
  const pessoas = dados.funcionarios.filter((f) => passaNoFiltro(f, filtro));
  const porCpf = new Map(pessoas.map((f) => [f.cpf, f]));

  const doPeriodo = dados.totais.filter(
    (t) => t.competencia === filtro.competencia && porCpf.has(t.cpf),
  );

  // ---------- composição por obra ----------
  const porObra = new Map<string, Map<CategoriaHora, number>>();
  const categorias = new Set<CategoriaHora>();
  for (const t of doPeriodo) {
    const obra = porCpf.get(t.cpf)?.departamento || "Sem obra";
    const cat = categoriaDaColuna(t.coluna);
    categorias.add(cat);
    const m = porObra.get(obra) ?? new Map<CategoriaHora, number>();
    m.set(cat, (m.get(cat) ?? 0) + t.minutos);
    porObra.set(obra, m);
  }

  const categoriasPresentes = (
    ["normais", "extras", "noturnas", "atrasos", "faltas", "outras"] as CategoriaHora[]
  ).filter((c) => categorias.has(c));

  const composicaoPorObra = [...porObra.entries()]
    .map(([chave, m]) => {
      const linha: Record<string, number> & { chave: string } = { chave } as never;
      for (const c of categoriasPresentes) linha[ROTULO_CATEGORIA[c]] = m.get(c) ?? 0;
      return linha;
    })
    .sort((a, b) => {
      const soma = (l: Record<string, number>) =>
        categoriasPresentes.reduce((s, c) => s + (l[ROTULO_CATEGORIA[c]] ?? 0), 0);
      return soma(b) - soma(a);
    });

  // ---------- extras por mês ----------
  const extrasMes = new Map<string, number>();
  for (const t of dados.totais) {
    if (!porCpf.has(t.cpf)) continue;
    if (categoriaDaColuna(t.coluna) !== "extras") continue;
    extrasMes.set(t.competencia, (extrasMes.get(t.competencia) ?? 0) + t.minutos);
  }
  const extrasPorMes = [...extrasMes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([comp, valor]) => ({ chave: rotuloDeCompetencia(comp), valor }));

  // ---------- top 10 ----------
  const extrasPessoa = new Map<string, number>();
  for (const t of doPeriodo) {
    if (categoriaDaColuna(t.coluna) !== "extras") continue;
    extrasPessoa.set(t.cpf, (extrasPessoa.get(t.cpf) ?? 0) + t.minutos);
  }
  const topExtras = [...extrasPessoa.entries()]
    .map(([cpf, minutos]) => ({
      nome: porCpf.get(cpf)?.nome ?? cpf,
      obra: porCpf.get(cpf)?.departamento ?? "—",
      minutos,
    }))
    .filter((p) => p.minutos > 0)
    .sort((a, b) => b.minutos - a.minutos)
    .slice(0, 10);

  // ---------- custo da extra ----------
  // A conta é deliberadamente simples e está declarada no tooltip da
  // aba: salário mensal ÷ 220 horas = valor da hora; hora extra pelo
  // valor da hora, sem adicional. NÃO é folha: não tem o percentual de
  // 60%/70% do acordo, nem encargo, nem DSR sobre extra. Serve para
  // comparar obras entre si, e é isso que o cartão promete.
  //
  // Quem não tem salário vigente fica FORA da soma e entra num
  // contador à parte. Tratar salário ausente como zero faria a obra
  // com cadastro incompleto parecer a mais barata.
  const salarioVigente = new Map<string, number>();
  for (const r of dados.remuneracoes) {
    if (r.vigenciaFim && r.vigenciaFim < filtro.competencia) continue;
    if (r.vigenciaInicio > ultimoDiaDaCompetencia(filtro.competencia)) continue;
    // A lista vem ordenada por vigência decrescente: a primeira que
    // sobrevive ao filtro é a vigente.
    if (!salarioVigente.has(r.funcionarioId)) salarioVigente.set(r.funcionarioId, r.salario);
  }
  const salarioPorCpf = new Map<string, number>();
  for (const f of pessoas) {
    if (!f.funcionarioId) continue;
    const sal = salarioVigente.get(f.funcionarioId);
    if (sal !== undefined && sal > 0) salarioPorCpf.set(f.cpf, sal);
  }

  const custo = new Map<string, number>();
  let semSalario = 0;
  const vistosSemSalario = new Set<string>();
  for (const [cpf, minutos] of extrasPessoa) {
    if (minutos <= 0) continue;
    const salario = salarioPorCpf.get(cpf);
    if (salario === undefined) {
      if (!vistosSemSalario.has(cpf)) {
        vistosSemSalario.add(cpf);
        semSalario += 1;
      }
      continue;
    }
    const obra = porCpf.get(cpf)?.departamento || "Sem obra";
    custo.set(obra, (custo.get(obra) ?? 0) + (minutos / 60) * (salario / 220));
  }
  const custoPorObra = [...custo.entries()]
    .map(([chave, valor]) => ({ chave, valor: Math.round(valor * 100) / 100 }))
    .sort((a, b) => b.valor - a.valor);

  const somar = (cat: CategoriaHora) =>
    doPeriodo.filter((t) => categoriaDaColuna(t.coluna) === cat).reduce((s, t) => s + t.minutos, 0);

  return {
    composicaoPorObra,
    categoriasPresentes,
    extrasPorMes,
    topExtras,
    totalExtras: somar("extras"),
    totalNormais: somar("normais"),
    custoPorObra,
    semSalario,
    semDados: dados.totais.length === 0,
  };
}

// ============================================================
// ABSENTEÍSMO
// ============================================================
export type Absenteismo = {
  porMes: { chave: string; valor: number | null }[];
  porObra: { chave: string; faltas: number; atrasos: number }[];
  porDiaDaSemana: { chave: string; valor: number }[];
  afastamentosAtivos: Fatia[];
  semDados: boolean;
};

export function calcularAbsenteismo(
  dados: DadosPonto,
  filtro: FiltroPonto,
  hoje: string,
): Absenteismo {
  const pessoas = dados.funcionarios.filter((f) => passaNoFiltro(f, filtro));
  const porCpf = new Map(pessoas.map((f) => [f.cpf, f]));

  // ---------- taxa por mês ----------
  // Minutos de falta sobre minutos previstos (falta + normais). É a
  // definição que os dois lados da conta vêm do mesmo relatório — sem
  // misturar jornada teórica, que não temos.
  const mes = new Map<string, { falta: number; base: number }>();
  for (const t of dados.totais) {
    if (!porCpf.has(t.cpf)) continue;
    const cat = categoriaDaColuna(t.coluna);
    if (cat !== "faltas" && cat !== "normais") continue;
    const atual = mes.get(t.competencia) ?? { falta: 0, base: 0 };
    if (cat === "faltas") atual.falta += t.minutos;
    atual.base += t.minutos;
    mes.set(t.competencia, atual);
  }
  const porMes = [...mes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([comp, v]) => ({
      chave: rotuloDeCompetencia(comp),
      valor: v.base > 0 ? Math.round((v.falta / v.base) * 1000) / 10 : null,
    }));

  // ---------- faltas e atrasos por obra ----------
  const obras = new Map<string, { faltas: number; atrasos: number }>();
  for (const t of dados.totais) {
    if (t.competencia !== filtro.competencia) continue;
    const f = porCpf.get(t.cpf);
    if (!f) continue;
    const cat = categoriaDaColuna(t.coluna);
    if (cat !== "faltas" && cat !== "atrasos") continue;
    const obra = f.departamento || "Sem obra";
    const atual = obras.get(obra) ?? { faltas: 0, atrasos: 0 };
    if (cat === "faltas") atual.faltas += t.minutos;
    else atual.atrasos += t.minutos;
    obras.set(obra, atual);
  }
  const porObra = [...obras.entries()]
    .map(([chave, v]) => ({ chave, ...v }))
    .sort((a, b) => b.faltas + b.atrasos - (a.faltas + a.atrasos));

  // ---------- faltas por dia da semana ----------
  // Aqui a fonte é batida, não relatório: dia com escala e sem batida
  // nenhuma da equipe inteira. Serve para achar o padrão da segunda-
  // feira, que é o que o RH procura.
  const diasComBatida = new Map<string, Set<string>>();
  for (const b of dados.batidas) {
    if (!porCpf.has(b.cpf)) continue;
    const s = diasComBatida.get(b.data) ?? new Set<string>();
    s.add(b.cpf);
    diasComBatida.set(b.data, s);
  }
  const horarioPorNumero = new Map(dados.horarios.map((h) => [h.numero, h]));
  const faltasDia = new Map<number, number>();
  for (const [data, presentes] of diasComBatida) {
    if (data > hoje) continue;
    const semana = diaDaSemana(data);
    let faltas = 0;
    for (const f of pessoas) {
      if (!f.ativo) continue;
      const trabalha = trabalhaNoDia(
        f.horarioNumero === null ? undefined : horarioPorNumero.get(f.horarioNumero),
        semana,
      );
      if (trabalha !== true) continue;
      if (!presentes.has(f.cpf)) faltas += 1;
    }
    faltasDia.set(semana, (faltasDia.get(semana) ?? 0) + faltas);
  }
  const porDiaDaSemana = NOME_DIA.map((nome, i) => ({
    chave: nome,
    valor: faltasDia.get(i) ?? 0,
  })).filter((d) => d.valor > 0);

  // ---------- afastamentos ativos ----------
  const ativosHoje = dados.afastamentos.filter((a) => vigenteEm(a, hoje) && porCpf.has(a.cpf));
  const afastamentosAtivos = contar(
    ativosHoje.map((a) => a.justificativa.trim() || "Sem justificativa"),
  );

  return {
    porMes,
    porObra,
    porDiaDaSemana,
    afastamentosAtivos,
    semDados: dados.totais.length === 0 && dados.batidas.length === 0,
  };
}

// ============================================================
// QUALIDADE DAS BATIDAS
// ============================================================
export type Qualidade = {
  porOrigemMes: (Record<string, number> & { chave: string })[];
  origensPresentes: string[];
  manuaisPorMes: { chave: string; valor: number; pct: number | null }[];
  porEquipamento: Fatia[];
  totalBatidas: number;
  totalManuais: number;
  semDados: boolean;
};

export function calcularQualidade(dados: DadosPonto, filtro: FiltroPonto): Qualidade {
  const pessoas = dados.funcionarios.filter((f) => passaNoFiltro(f, filtro));
  const porCpf = new Set(pessoas.map((f) => f.cpf));
  const batidas = dados.batidas.filter((b) => porCpf.has(b.cpf));

  const meses = new Map<string, Map<string, number>>();
  const origens = new Set<string>();
  for (const b of batidas) {
    const comp = competenciaDe(b.data);
    const origem = nomeDaOrigem(b.fonteOrigem);
    origens.add(origem);
    const m = meses.get(comp) ?? new Map<string, number>();
    m.set(origem, (m.get(origem) ?? 0) + 1);
    meses.set(comp, m);
  }

  const origensPresentes = [...origens].sort();
  const porOrigemMes = [...meses.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([comp, m]) => {
      const linha: Record<string, number> & { chave: string } = {
        chave: rotuloDeCompetencia(comp),
      } as never;
      for (const o of origensPresentes) linha[o] = m.get(o) ?? 0;
      return linha;
    });

  const manuaisPorMes = [...meses.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([comp, m]) => {
      const manuais = m.get("Inclusão manual") ?? 0;
      const total = [...m.values()].reduce((s, v) => s + v, 0);
      return {
        chave: rotuloDeCompetencia(comp),
        valor: manuais,
        pct: total > 0 ? Math.round((manuais / total) * 1000) / 10 : null,
      };
    });

  const porEquipamento = comOutros(
    contar(batidas.map((b) => b.equipamento.trim() || "Não informado")),
  );

  return {
    porOrigemMes,
    origensPresentes,
    manuaisPorMes,
    porEquipamento,
    totalBatidas: batidas.length,
    totalManuais: batidas.filter((b) => b.fonteOrigem === 2).length,
    semDados: batidas.length === 0,
  };
}

// ============================================================
// DIVERGÊNCIAS
// ============================================================
export type Divergencias = {
  conciliacao: {
    emAmbos: number;
    soNaSecullum: { nome: string; cpf: string; obra: string; funcao: string }[];
    soNoPortal: { nome: string; cpf: string; matricula: string }[];
    semCpfValido: number;
  };
  documentoVencido: {
    nome: string;
    obra: string;
    documento: string;
    vencimento: string;
    diasVencido: number;
    bloqueia: boolean;
    bateuNosUltimos30: boolean;
  }[];
  /** Nenhum documento com vencimento cadastrado — diferente de "está tudo em dia". */
  semDocumentosCadastrados: boolean;
};

export function calcularDivergencias(
  dados: DadosPonto,
  filtro: FiltroPonto,
  hoje: string,
): Divergencias {
  const secullumAtivos = dados.funcionarios.filter((f) => f.ativo && passaNoFiltro(f, filtro));
  const portalAtivos = dados.colaboradoresPortal.filter((c) => c.ativo);

  const cpfSecullum = new Map(
    secullumAtivos.filter((f) => f.cpf.length === 11).map((f) => [f.cpf, f]),
  );
  const cpfPortal = new Map(
    portalAtivos.map((c) => [soDigitos(c.cpf), c] as const).filter(([cpf]) => cpf.length === 11),
  );

  const emAmbos = [...cpfSecullum.keys()].filter((cpf) => cpfPortal.has(cpf)).length;

  const soNaSecullum = [...cpfSecullum.values()]
    .filter((f) => !cpfPortal.has(f.cpf))
    .map((f) => ({ nome: f.nome, cpf: f.cpf, obra: f.departamento, funcao: f.funcao }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const soNoPortal = [...cpfPortal.values()]
    .filter((c) => !cpfSecullum.has(soDigitos(c.cpf)))
    .map((c) => ({ nome: c.nome, cpf: soDigitos(c.cpf), matricula: c.matricula }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  // ---------- documento vencido de quem bate ponto ----------
  // A pergunta não é "quem tem documento vencido" — é "quem tem
  // documento vencido E ESTÁ TRABALHANDO". A segunda metade é o que
  // transforma a lista em ação: alguém entrou na obra hoje sem ASO.
  const trintaDiasAtras = deslocarDias(hoje, -30);
  const bateuRecente = new Set(
    dados.batidas.filter((b) => b.data >= trintaDiasAtras).map((b) => b.cpf),
  );
  const secullumPorFuncionarioId = new Map(
    secullumAtivos.filter((f) => f.funcionarioId).map((f) => [f.funcionarioId!, f]),
  );
  const portalPorId = new Map(portalAtivos.map((c) => [c.id, c]));

  const documentoVencido = dados.documentos
    .filter((d): d is DocumentoVencePonto & { vencimento: string } => !!d.vencimento)
    .filter((d) => d.vencimento < hoje)
    .map((d) => {
      const espelho = secullumPorFuncionarioId.get(d.funcionarioId);
      const portal = portalPorId.get(d.funcionarioId);
      const cpf = espelho?.cpf ?? soDigitos(portal?.cpf ?? "");
      return {
        nome: espelho?.nome ?? portal?.nome ?? "—",
        obra: espelho?.departamento ?? "—",
        documento: d.tipoNome,
        vencimento: d.vencimento,
        diasVencido: diasEntre(d.vencimento, hoje),
        bloqueia: d.bloqueiaAlocacao,
        bateuNosUltimos30: cpf ? bateuRecente.has(cpf) : false,
      };
    })
    .filter((d) => d.nome !== "—")
    .sort(
      (a, b) =>
        Number(b.bateuNosUltimos30) - Number(a.bateuNosUltimos30) ||
        Number(b.bloqueia) - Number(a.bloqueia) ||
        b.diasVencido - a.diasVencido,
    );

  return {
    conciliacao: {
      emAmbos,
      soNaSecullum,
      soNoPortal,
      semCpfValido: secullumAtivos.filter((f) => f.cpf.length !== 11).length,
    },
    documentoVencido,
    semDocumentosCadastrados: dados.documentos.length === 0,
  };
}

function deslocarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

// ============================================================
// Opções dos filtros
// ============================================================
export function opcoesDeFiltro(dados: DadosPonto): {
  obras: string[];
  funcoes: string[];
  competencias: string[];
} {
  const ativos = dados.funcionarios.filter((f) => f.ativo);
  const obras = [...new Set(ativos.map((f) => f.departamento).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const funcoes = [...new Set(ativos.map((f) => f.funcao).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const competencias = [...new Set(dados.totais.map((t) => t.competencia))].sort((a, b) =>
    b.localeCompare(a),
  );
  return { obras, funcoes, competencias };
}
