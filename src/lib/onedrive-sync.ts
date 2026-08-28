// ============================================================
// Sincronização das pastas de orçamento do OneDrive — SÓ SERVIDOR
// ------------------------------------------------------------
// ETAPA 1, E SÓ A ETAPA 1: esta rotina NÃO ABRE ARQUIVO NENHUM. Ela
// detecta pasta nova dentro da pasta de orçamentos do Comercial e cria
// o orçamento em rascunho, com o que dá para saber olhando só o NOME
// da pasta. Valor, CNPJ, validade e tipo de serviço não estão no nome
// e ficam vazios — ler as planilhas PPU_*.xlsx é a etapa seguinte.
//
// O QUE O NOME DA PASTA ENTREGA, E O QUE NÃO ENTREGA
//
//   numero  — "ORC 091_2026". A numeração da PASTA é a oficial; o
//             `proximoNumero()` do orcamentos-store, que gera
//             "ORC-001", vale para o que nasce dentro do Portal.
//   obra    — todo o resto do nome, depois do separador.
//   cliente — NUNCA vai para o campo `cliente`. Vai para
//             `cliente_sugerido`, e só quando bate com exatamente um
//             cadastro. Ver "O CLIENTE" abaixo.
//
// AS ARMADILHAS DO NOME, todas verificadas em pastas de verdade em
// 28/08/2026 — cada uma tem código dedicado aqui embaixo:
//
//   a) O SEPARADOR NÃO É SEMPRE HÍFEN. Convivem "-" (U+002D) e "–"
//      (U+2013) no mesmo nome. Uma regex que só reconheça "-" perde
//      dezenas de pastas. Ver SEPARADORES.
//   b) HÁ ESPAÇO DUPLO E TRIPLO no meio. Ver normalizarNome().
//   c) O SUFIXO "V01" / "- V01" é frequente e não faz parte da obra.
//      Ver RE_VERSAO — e repare que ele é guardado na observação, não
//      jogado fora: é informação real da pasta.
//   d) A BUSCA POR "ORC" TAMBÉM DEVOLVE ARQUIVO (existe um ORC.jpg no
//      drive). Só item com a faceta `folder` é processado.
//   e) EXISTE A PASTA DE 2025, com o mesmo padrão. O ano é PARÂMETRO,
//      não constante — e vem do próprio nome da pasta, não da pasta
//      pai, para funcionar tanto com MS_PASTA_ORCAMENTOS apontando
//      para "ORÇAMENTOS 2026" quanto para a pasta que contém as duas.
//
// O CLIENTE — POR QUE NÃO EXISTE HEURÍSTICA DE "ÚLTIMO TRECHO"
//
// O acervo tem contraexemplo para os dois lados:
//   "ORC 090_2026 - ORC BUDGET ESCADA VIVEIRO AVAI - MATHEUS"
//      MATHEUS é uma pessoa, não um cliente.
//   "ORC 068_2026 - EXECUÇÃO DE CALÇADA ... DEXCO AGUDOS - COMDEZ - V01"
//      dois nomes de empresa no mesmo título; qual é o contratante não
//      dá para deduzir do texto.
// Então a comparação é contra a tabela `clientes` do próprio Portal,
// por palavra inteira. Bateu com UM cadastro: vira `cliente_sugerido`.
// Bateu com nenhum ou com dois: o campo fica vazio e a pasta é marcada
// "cliente a definir", com os candidatos escritos na observação para
// quem for conferir. NUNCA se escolhe no chute.
//
// RODAR DUAS VEZES NÃO DUPLICA. A chave de idempotência é
// `orcamentos.drive_item_id`, que é o id do item no Graph — e não o
// nome, que muda quando alguém renomeia a pasta para "- V02". A
// garantia final é o índice único no banco; a filtragem em JS aqui
// existe para o diário poder dizer quantas eram novas de verdade.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

if (typeof window !== "undefined") {
  throw new Error("onedrive-sync.ts é código de servidor.");
}

import { supabaseAdmin } from "@/lib/supabase-admin";
import { lerDelta, lerFilhos, OneDriveErro, type ItemDrive } from "@/lib/onedrive-client";

// ------------------------------------------------------------
// Normalização do nome
// ------------------------------------------------------------
/** Os separadores que aparecem de verdade: hífen, travessão e o
 *  travessão longo, que ainda não apareceu mas custa um caractere. */
const SEPARADORES = "\\u002D\\u2013\\u2014";

/**
 * Espaço duplo vira simples, espaço "duro" vira espaço comum.
 *
 * ISTO VEM ANTES DE QUALQUER REGEX. "ORC 047_2026 – ATERRO LINHA
 * ITAPETININGA   – DEXCO ITAPETININGA  - V01" tem três espaços no meio
 * e dois antes do "- V01"; sem esta passagem, cada regex abaixo
 * precisaria carregar um `\s+` a mais e uma delas ia esquecer.
 */
export function normalizarNome(bruto: string): string {
  return bruto
    .normalize("NFC")
    .replace(/[\u00A0\u2007\u202F\u200B]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "ORC 091_2026" no começo. O ano é capturado para o filtro de ano. */
const RE_NUMERO = new RegExp(`^ORC\\s*(\\d{1,4})\\s*[_/.${SEPARADORES}]\\s*((?:19|20)\\d{2})(?!\\d)`, "i");

/** Separador solto logo depois do número. */
const RE_SEPARADOR_INICIAL = new RegExp(`^\\s*[${SEPARADORES}]\\s*`);

/**
 * O "- V01" do fim. O `\b` antes do V não é decoração: sem ele,
 * "...ITAPETININGAV01" também casaria, e obra perderia uma letra.
 */
const RE_VERSAO = new RegExp(`\\s*[${SEPARADORES}]?\\s*\\bV\\s*(\\d{1,3})\\s*$`, "i");

export type NomeInterpretado = {
  /** "ORC 091_2026", já normalizado. */
  numero: string;
  ano: number;
  /** Tudo o que vem depois do número, sem o sufixo de versão. */
  obra: string;
  /** "V01" quando existia, "" quando não. Vai para a observação. */
  versao: string;
};

/**
 * Lê o que o nome da pasta entrega. `null` quando não é uma pasta de
 * orçamento — e "não é" inclui a própria pasta pai, que também aparece
 * no delta.
 *
 * A OBRA FICA INTEIRA, com o trecho do cliente dentro. Cortar o último
 * pedaço exigiria decidir que ele É o cliente, que é exatamente a
 * decisão que este arquivo se recusa a tomar no chute. Quem conferir vê
 * o nome como ele é.
 */
export function interpretarNome(bruto: string): NomeInterpretado | null {
  const nome = normalizarNome(bruto);
  const m = RE_NUMERO.exec(nome);
  if (!m) return null;

  const resto = nome.slice(m[0].length).replace(RE_SEPARADOR_INICIAL, "");
  const versaoM = RE_VERSAO.exec(resto);
  const obra = (versaoM ? resto.slice(0, versaoM.index) : resto).trim();

  return {
    numero: `ORC ${m[1]}_${m[2]}`,
    ano: Number(m[2]),
    obra,
    versao: versaoM ? `V${versaoM[1]}` : "",
  };
}

// ------------------------------------------------------------
// O cliente, comparado contra o cadastro
// ------------------------------------------------------------
/** Sem acento, maiúsculas, e tudo o que não é letra ou dígito vira
 *  espaço — para "DEXCO S/A" e "DEXCO S.A." darem no mesmo. */
function chave(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036F]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * Palavras que não identificam ninguém. Se sobrarem só elas, o cadastro
 * é ignorado na comparação — melhor não sugerir do que sugerir a
 * empresa errada porque as duas são "LTDA".
 */
const VAZIAS = new Set([
  "LTDA", "EIRELI", "EPP", "MEI", "CIA", "COMPANHIA", "INC", "LTD",
  "DOS", "DAS", "COM", "IND", "SERVICOS", "SERVICO", "EMPRESA",
]);

export type ClienteCadastrado = {
  id: string;
  nome: string;
  /** Palavras que precisam TODAS aparecer no nome da pasta. */
  termos: string[];
};

/** Termos de busca de um cadastro. Palavra com menos de três letras é
 *  descartada: "SP" sozinho casaria com meia lista de obras. */
export function termosDoCliente(nome: string): string[] {
  return chave(nome)
    .split(" ")
    .filter((t) => t.length >= 3 && !VAZIAS.has(t) && !/^\d+$/.test(t));
}

/**
 * Quais cadastros o nome da pasta menciona.
 *
 * POR PALAVRA INTEIRA, e não por `includes`: sem isso "ULTRA" casaria
 * dentro de "ULTRASSOM" e "CSB" dentro de qualquer sigla. Um cadastro
 * de duas palavras ("BOSS CONTAINERS", "CASA CASTILHO") só bate quando
 * as duas aparecem.
 *
 * Devolve TODOS os que batem, de propósito: é quem chama que aplica a
 * regra de "exatamente um", e o diário precisa saber quantos eram para
 * poder dizer por que ficou a definir.
 */
export function casarClientes(obra: string, clientes: ClienteCadastrado[]): ClienteCadastrado[] {
  const texto = ` ${chave(obra)} `;
  return clientes.filter(
    (c) => c.termos.length > 0 && c.termos.every((t) => texto.includes(` ${t} `)),
  );
}

/** Quantos termos deste cadastro aparecem na obra. Base da regra 2. */
function termosPresentes(obra: string, cliente: ClienteCadastrado): number {
  const texto = ` ${chave(obra)} `;
  return cliente.termos.filter((t) => texto.includes(` ${t} `)).length;
}

/** `a` contém TODOS os termos de `b` e ainda tem mais. Base da regra 1. */
function contemEstritamente(a: ClienteCadastrado, b: ClienteCadastrado): boolean {
  const dele = new Set(a.termos);
  return b.termos.length < dele.size && b.termos.every((t) => dele.has(t));
}

/**
 * Como se chegou (ou não) ao cliente. Vai para a observação do
 * orçamento, porque quem confere precisa saber o quanto confiar.
 */
export type ComoCasou = "exato" | "especificidade" | "parcial" | "ambiguo" | "nenhum";

export type Casamento = {
  /** O cadastro escolhido, ou null quando fica "cliente a definir". */
  cliente: ClienteCadastrado | null;
  como: ComoCasou;
  /** Quem disputou. Escrito na observação quando fica a definir. */
  candidatos: ClienteCadastrado[];
  /** Só em "parcial": quantas das palavras do cadastro apareceram. */
  parcial?: { presentes: number; total: number };
};

/**
 * A escolha do cliente, em duas regras — e nenhuma delas olha para a
 * POSIÇÃO do nome no texto. "Último trecho é o cliente" é a heurística
 * que o acervo desmente: em "ORC 090_2026 - ... - MATHEUS" o último
 * trecho é uma pessoa, e em "ORC 068_2026 - ... DEXCO AGUDOS - COMDEZ"
 * são duas empresas.
 *
 * REGRA 1 — ESPECIFICIDADE, quando mais de um cadastro casa inteiro.
 *
 * Vence o cadastro cujos termos contêm estritamente os do outro. É
 * continência de conjunto, não leitura de texto: "DEXCO FLORESTAL
 * AGUDOS" contém "DEXCO AGUDOS" e diz mais sobre a mesma pasta, então
 * ganha. A causa desses empates é mecânica — "BRACELL LP" perde o "LP"
 * por ter duas letras e sobra como `[BRACELL]`, casando com toda pasta
 * da Bracell.
 *
 * A regra NÃO desempata conjunto disjunto, e é isso que a mantém
 * honesta: em "ASMONTEC BRACELL LP" nenhum contém o outro, e a pasta
 * continua "a definir". Eram 5 assim em 28/08/2026 — as únicas em que o
 * título realmente cita duas empresas diferentes.
 *
 * REGRA 2 — CASAMENTO PARCIAL, quando nenhum cadastro casa inteiro.
 *
 * Vence o cadastro com MAIS palavras presentes, desde que seja o único
 * com esse número. A pasta diz "DEXCO BOTUCATU" e o cadastro é "DEXCO
 * PORTINARI BOTUCATU": duas das três palavras batem, e nenhum outro
 * cadastro chega a duas.
 *
 * Empate volta a ser "a definir", e isso acontece de verdade: "DEXCO
 * FLORESTAL" bate 2 de 3 tanto com "DEXCO FLORESTAL AGUDOS" quanto com
 * "DEXCO FLORESTAL ITAPETININGA", e a pasta não diz qual das duas.
 *
 * Um acerto parcial é MENOS forte que um acerto inteiro, e a observação
 * do orçamento diz isso com todas as letras — ver `montarObservacao`.
 * Ele nunca vai para o campo `cliente`, como nenhum dos outros.
 */
export function escolherCliente(obra: string, clientes: ClienteCadastrado[]): Casamento {
  const completos = casarClientes(obra, clientes);

  if (completos.length > 0) {
    // Regra 1: fora quem é contido por outro que também casou.
    const especificos = completos.filter(
      (c) => !completos.some((d) => d !== c && contemEstritamente(d, c)),
    );
    if (especificos.length === 1) {
      return {
        cliente: especificos[0],
        como: completos.length === 1 ? "exato" : "especificidade",
        candidatos: completos,
      };
    }
    return { cliente: null, como: "ambiguo", candidatos: especificos };
  }

  // Regra 2: ninguém casou inteiro; quem chegou mais perto?
  const parciais = clientes
    .map((c) => ({ c, presentes: termosPresentes(obra, c) }))
    .filter((x) => x.presentes > 0);
  if (parciais.length === 0) return { cliente: null, como: "nenhum", candidatos: [] };

  const maximo = Math.max(...parciais.map((x) => x.presentes));
  const melhores = parciais.filter((x) => x.presentes === maximo);
  if (melhores.length === 1) {
    return {
      cliente: melhores[0].c,
      como: "parcial",
      candidatos: [melhores[0].c],
      parcial: { presentes: maximo, total: melhores[0].c.termos.length },
    };
  }
  return { cliente: null, como: "ambiguo", candidatos: melhores.map((x) => x.c) };
}

async function lerClientes(db: SupabaseClient): Promise<ClienteCadastrado[]> {
  // Sem filtrar por `ativo`: um cliente inativo hoje continua sendo o
  // contratante de uma obra de 2026, e deixá-lo de fora transformaria
  // um acerto em "cliente a definir".
  const { data, error } = await db.from("clientes").select("id, nome");
  if (error) throw new Error(`Falha ao ler os clientes cadastrados: ${error.message}`);

  return ((data as { id: string; nome: string | null }[] | null) ?? [])
    .map((c) => ({ id: c.id, nome: (c.nome ?? "").trim(), termos: termosDoCliente(c.nome ?? "") }))
    .filter((c) => c.nome !== "");
}

// ------------------------------------------------------------
// Triagem: o que do delta é pasta de orçamento do ano pedido
// ------------------------------------------------------------
/** O `parentReference.path` chega como "/drive/root:/Comercial/ORÇAMENTOS 2026",
 *  às vezes com escape de URL. Decodificar é melhor esforço: um path
 *  ilegível não pode derrubar o job. */
function caminhoLegivel(path: string | undefined): string {
  if (!path) return "";
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * A pasta está dentro de OUTRA pasta de orçamento?
 *
 * O delta do Graph é RECURSIVO: ele devolve a subárvore inteira, e as
 * pastas de dentro de cada orçamento (que vão de 3 a 10 itens, com
 * subpastas) vêm junto. O filtro por profundidade fixa não serve —
 * MS_PASTA_ORCAMENTOS tanto pode apontar para "ORÇAMENTOS 2026" quanto
 * para a pasta que contém 2025 e 2026. O que vale sempre é a regra do
 * negócio: pasta de orçamento não mora dentro de pasta de orçamento.
 */
function dentroDeOutroOrcamento(item: ItemDrive): boolean {
  return caminhoLegivel(item.parentReference?.path)
    .split("/")
    .some((segmento) => RE_NUMERO.test(normalizarNome(segmento)));
}

type Candidata = { item: ItemDrive; nome: NomeInterpretado };

type Triagem = {
  candidatas: Candidata[];
  descartados: Map<string, number>;
};

function descartar(mapa: Map<string, number>, motivo: string): void {
  mapa.set(motivo, (mapa.get(motivo) ?? 0) + 1);
}

function triar(itens: ItemDrive[], ano: number): Triagem {
  const candidatas: Candidata[] = [];
  const descartados = new Map<string, number>();

  // DEDUPLICAÇÃO PRIMEIRO, E EM SILÊNCIO.
  //
  // O delta repete itens entre páginas: a varredura de 28/08/2026 trouxe
  // 826 entradas para 729 itens, e a própria pasta raiz apareceu nas
  // quatro páginas. Isso é o protocolo funcionando, não anomalia — se
  // entrasse na conta de descartes, o diário mostraria dezenas de "repetidos" a
  // cada varredura completa e pareceria defeito.
  //
  // Fica ANTES dos outros filtros porque o critério é a identidade do
  // item, e não o que ele é.
  const vistos = new Set<string>();
  const unicos = itens.filter((i) => {
    if (vistos.has(i.id)) return false;
    vistos.add(i.id);
    return true;
  });

  for (const item of unicos) {
    if (item.deleted) {
      // Pasta apagada no OneDrive NÃO apaga orçamento aqui. Um
      // orçamento já importado virou trabalho de gente — nota, custo,
      // projeto. Some do diário, e alguém decide.
      descartar(descartados, "apagado no OneDrive");
      continue;
    }
    // Armadilha (d): a busca por "ORC" também devolve arquivo.
    if (!item.folder) {
      descartar(descartados, "não é pasta (arquivo)");
      continue;
    }
    // O ANINHAMENTO É TESTADO ANTES DO NOME, e a ordem é escolha de
    // legenda, não de comportamento — os dois caminhos descartam.
    //
    // Invertida, a conta ficava enganosa: as 52 pastas de trabalho
    // ("PROJETOS", "Fotos do projeto", "PROPOSTA REVISADA") caíam em
    // "fora do padrão", e o diário anunciava 53 pastas fora do padrão
    // como se houvesse orçamento perdido lá dentro. Nesta ordem, "fora
    // do padrão" quer dizer o que se espera que queira dizer: coisa de
    // primeiro nível que não parece orçamento — e sobra 1, a própria
    // pasta raiz, que o delta sempre devolve.
    //
    // O aninhamento acontece de verdade, e mais do que se imaginaria: o
    // acervo tem "ORC 062_2026 - ..." dentro de "ORC 063_2026 - ..." e
    // pastas repetidas dentro de si mesmas.
    if (dentroDeOutroOrcamento(item)) {
      descartar(descartados, "subpasta de outro orçamento");
      continue;
    }
    const nome = interpretarNome(item.name ?? "");
    if (!nome) {
      descartar(descartados, "fora do padrão ORC NNN_AAAA");
      continue;
    }
    // Armadilha (e): 2025 tem o mesmo padrão e fica de fora nesta etapa.
    if (nome.ano !== ano) {
      descartar(descartados, `de outro ano (${nome.ano})`);
      continue;
    }
    candidatas.push({ item, nome });
  }

  return { candidatas, descartados };
}

// ------------------------------------------------------------
// A linha que nasce
// ------------------------------------------------------------
/** A marca visível. Uma constante só, porque ela aparece na observação
 *  do orçamento e no selo da listagem do Comercial. */
export const MARCA_IMPORTADO = "IMPORTADO DO ONEDRIVE — A CONFERIR";

function dataDeHoje(): string {
  return new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/**
 * A observação diz COMO o cliente foi escolhido, e não só qual.
 *
 * Um acerto inteiro e um acerto de 2 palavras em 3 não valem a mesma
 * coisa na hora de conferir, e um texto que dissesse "Cliente sugerido:
 * X" nos dois casos esconderia justamente a diferença que faz alguém
 * abrir a pasta para checar.
 */
function montarObservacao(
  nomeOriginal: string,
  nome: NomeInterpretado,
  casamento: Casamento,
): string {
  const linhas = [`${MARCA_IMPORTADO} (${dataDeHoje()})`, `Pasta: ${normalizarNome(nomeOriginal)}`];
  if (nome.versao) linhas.push(`Versão indicada na pasta: ${nome.versao}`);

  const outros = casamento.candidatos
    .filter((c) => c !== casamento.cliente)
    .map((c) => c.nome)
    .join(", ");

  if (casamento.como === "exato" && casamento.cliente) {
    linhas.push(
      `Cliente sugerido pelo nome da pasta: ${casamento.cliente.nome}. ` +
        "Confira antes de gravar no campo Cliente.",
    );
  } else if (casamento.como === "especificidade" && casamento.cliente) {
    linhas.push(
      `Cliente sugerido pelo nome da pasta: ${casamento.cliente.nome} — escolhido por ser ` +
        `o cadastro mais específico entre os que batem (o outro era ${outros}). ` +
        "Confira antes de gravar no campo Cliente.",
    );
  } else if (casamento.como === "parcial" && casamento.cliente && casamento.parcial) {
    linhas.push(
      `Cliente sugerido POR APROXIMAÇÃO: ${casamento.cliente.nome} — ` +
        `${casamento.parcial.presentes} de ${casamento.parcial.total} palavras do cadastro ` +
        "aparecem no nome da pasta, e nenhum outro cadastro chegou perto. " +
        "Palpite mais fraco que os demais: confira na pasta antes de aceitar.",
    );
  } else if (casamento.como === "nenhum") {
    linhas.push("Cliente a definir: o nome da pasta não menciona nenhum cliente cadastrado.");
  } else {
    linhas.push(
      "Cliente a definir: o nome da pasta não distingue entre " +
        `${casamento.candidatos.map((c) => c.nome).join(" e ")}. ` +
        "Qual é o contratante não sai do texto.",
    );
  }
  return linhas.join("\n");
}

function montarLinha(candidata: Candidata, casamento: Casamento) {
  const { item, nome } = candidata;

  return {
    numero: nome.numero,
    obra: nome.obra,
    // Vazios de propósito: nenhum destes está no nome da pasta, e
    // inventá-los agora daria a quem abre a tela a impressão de dado
    // conferido. A etapa 2 preenche, lendo os arquivos.
    cliente: "",
    cnpj: "",
    tipo_servico: "",
    descricao: "",
    valor: 0,
    responsavel: "",
    data_emissao: null,
    prazo_validade: null,

    status: "LEVANTAMENTO",
    observacoes: montarObservacao(item.name ?? "", nome, casamento),

    drive_item_id: item.id,
    drive_url: item.webUrl ?? "",
    // Vazio sempre que as duas regras não chegaram a um só cadastro.
    // Ver o cabeçalho: dois candidatos não viram meio palpite, viram
    // campo vazio e a pasta marcada "cliente a definir".
    cliente_sugerido: casamento.cliente?.nome ?? "",
    importado_em: new Date().toISOString(),
  };
}

// ------------------------------------------------------------
// Diário
// ------------------------------------------------------------
export type ResultadoOnedriveSync = {
  ok: boolean;
  ano: number;
  status: "ok" | "parcial" | "erro";
  /** Pastas do ano vistas NESTA leitura. Na incremental é o que mudou,
   *  e não o total do drive — para o total, ver `pastasNoDrive`. */
  pastas: number;
  /** Quantas pastas do ano existem no drive AGORA, medido por /children
   *  no fim de toda execução. É o lado "drive" da conferência. */
  pastasNoDrive: number;
  /** Números das pastas do drive sem orçamento vinculado no Portal.
   *  Não vazio ⇒ status "erro", sempre. */
  faltando: string[];
  /** Rascunhos CRIADOS agora: pasta sem orçamento correspondente. */
  importados: number;
  /** Pastas anexadas a um orçamento que já estava lançado no Portal.
   *  Nenhum campo de negócio é tocado — ver "VINCULAR OU CRIAR". */
  vinculados: number;
  /** Números cujo orçamento já aponta para OUTRA pasta. Não são
   *  tocados: o job avisa e alguém decide. */
  conflitos: string[];
  /** Pastas que já estavam vinculadas antes desta execução. */
  jaExistentes: number;
  /** Itens do delta descartados na triagem. */
  ignorados: number;
  requisicoes: number;
  detalhe: string;
  erro?: string;
};

const TABELA_LOG = "onedrive_sync_log";

async function abrirDiario(
  db: SupabaseClient,
  ano: number,
  disparadoPor: string,
): Promise<string | null> {
  const { data } = await db
    .from(TABELA_LOG)
    .insert({ ano, status: "rodando", disparado_por: disparadoPor })
    .select("id")
    .single();
  return (data as { id?: string } | null)?.id ?? null;
}

async function fecharDiario(
  db: SupabaseClient,
  id: string | null,
  r: ResultadoOnedriveSync,
  deltaLink: string | null,
): Promise<void> {
  if (!id) return;
  await db
    .from(TABELA_LOG)
    .update({
      terminado_em: new Date().toISOString(),
      status: r.status,
      pastas: r.pastas,
      importados: r.importados,
      ja_existentes: r.jaExistentes,
      ignorados: r.ignorados,
      requisicoes: r.requisicoes,
      delta_link: deltaLink,
      detalhe: r.detalhe.slice(0, 2000),
      erro: r.erro?.slice(0, 2000) ?? null,
    })
    .eq("id", id);
}

/**
 * O `@odata.deltaLink` da última execução que gravou tudo o que viu.
 *
 * O TOKEN SÓ AVANÇA QUANDO A GRAVAÇÃO FECHOU. Delta é destrutivo por
 * natureza: consumido o token, aquelas mudanças não voltam. Se o job
 * lesse 40 pastas, falhasse ao gravar 12 e guardasse o token mesmo
 * assim, as 12 sumiriam para sempre — não voltariam nem numa
 * reexecução, porque do lado do Graph nada mudou desde então. Guardar
 * só depois de gravar troca esse buraco por trabalho repetido, que o
 * índice único descarta de graça.
 */
async function ultimoDeltaLink(db: SupabaseClient): Promise<string | null> {
  const { data } = await db
    .from(TABELA_LOG)
    .select("delta_link")
    .not("delta_link", "is", null)
    .order("iniciado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { delta_link?: string } | null)?.delta_link ?? null;
}

// ------------------------------------------------------------
// Gravação
// ------------------------------------------------------------
/** Lotes pequenos: 100 ids num filtro `in` já fazem uma URL de 5 KB, e
 *  proxy nenhum promete aceitar isso. */
const LOTE = 50;

function emLotes<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

/** Quais drive_item_id já viraram orçamento. */
async function jaImportados(db: SupabaseClient, ids: string[]): Promise<Set<string>> {
  const achados = new Set<string>();
  for (const lote of emLotes(ids, LOTE)) {
    const { data, error } = await db
      .from("orcamentos")
      .select("drive_item_id")
      .in("drive_item_id", lote);
    if (error) throw new Error(`Falha ao conferir o que já foi importado: ${error.message}`);
    for (const linha of (data as { drive_item_id: string | null }[] | null) ?? []) {
      if (linha.drive_item_id) achados.add(linha.drive_item_id);
    }
  }
  return achados;
}

// ------------------------------------------------------------
// VINCULAR OU CRIAR — e por que não é só criar
// ------------------------------------------------------------
// A primeira execução real, em 28/08/2026, bateu numa constraint que
// não estava em migration nenhuma: `orcamentos_numero_unique`. O motivo
// era mais fundo que a constraint. O Comercial JÁ TINHA LANÇADO à mão
// 88 orçamentos com a mesma numeração das pastas — com cliente, valor,
// responsável e status de negociação, R$ 2,8 milhões numa linha só.
//
// Criar mais um orçamento para cada uma dessas pastas produziria 86
// duplicatas VAZIAS ao lado do trabalho de gente. A constraint impediu,
// e ainda bem.
//
// Então a pasta é casada com o orçamento que já existe PELO NÚMERO, e o
// que acontece depende do que se acha:
//
//   nada com esse número          -> CRIA o rascunho (o caso da spec)
//   existe e sem drive_item_id    -> VINCULA: grava só a origem
//   existe e já com ESTE item     -> nada a fazer, já vinculado
//   existe e com OUTRO item       -> CONFLITO: não toca, e o diário diz
//
// VINCULAR ESCREVE TRÊS COLUNAS E MAIS NENHUMA: drive_item_id,
// drive_url e conferido_em. Não encosta em cliente, valor, obra, status
// nem observações — quem digitou aquilo sabia mais que este job, e o
// papel dele aqui é anexar a pasta, não opinar.
//
// `importado_em` fica NULL no vínculo, de propósito: o job não criou
// essa linha. É essa coluna que acende o selo "a conferir", e uma linha
// preenchida à mão não tem o que conferir.
const NUMERO_LOTE = 50;

type LinhaExistente = { id: string; numero: string; drive_item_id: string | null };

/** Os orçamentos que já existem para estes números. A busca é por
 *  número porque é a chave que o Comercial e o OneDrive compartilham —
 *  `drive_item_id` só existe depois do primeiro vínculo. */
async function existentesPorNumero(
  db: SupabaseClient,
  numeros: string[],
): Promise<Map<string, LinhaExistente>> {
  const mapa = new Map<string, LinhaExistente>();
  for (const lote of emLotes([...new Set(numeros)], NUMERO_LOTE)) {
    const { data, error } = await db
      .from("orcamentos")
      .select("id, numero, drive_item_id")
      .in("numero", lote);
    if (error) throw new Error(`Falha ao ler os orçamentos já lançados: ${error.message}`);
    for (const linha of (data as LinhaExistente[] | null) ?? []) {
      mapa.set((linha.numero ?? "").trim(), linha);
    }
  }
  return mapa;
}

/** Todo drive_item_id que o banco já conhece. É o lado "banco" da
 *  conferência final; sem paginação porque a tabela inteira do Comercial
 *  cabe numa resposta e o que vem é uma coluna só. */
async function idsVinculados(db: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await db
    .from("orcamentos")
    .select("drive_item_id")
    .not("drive_item_id", "is", null);
  if (error) throw new Error(`Falha ao conferir o que está vinculado: ${error.message}`);
  const ids = new Set<string>();
  for (const l of (data as { drive_item_id: string | null }[] | null) ?? []) {
    if (l.drive_item_id) ids.add(l.drive_item_id);
  }
  return ids;
}

/** Anexa a pasta a um orçamento que já existe. Três colunas, e olhe lá. */
async function vincular(db: SupabaseClient, linhaId: string, item: ItemDrive): Promise<void> {
  const { error } = await db
    .from("orcamentos")
    .update({
      drive_item_id: item.id,
      drive_url: item.webUrl ?? "",
      // Já foi conferido por quem digitou. Sem isto, 86 orçamentos
      // fechados apareceriam na listagem pedindo conferência.
      conferido_em: new Date().toISOString(),
      conferido_por: "lançado no Portal antes da integração",
    })
    .eq("id", linhaId);
  if (error) throw new Error(`Falha ao vincular a pasta ao orçamento: ${error.message}`);
}

function mensagem(e: unknown): string {
  if (e instanceof OneDriveErro) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

// ------------------------------------------------------------
// O job
// ------------------------------------------------------------
export type OpcoesSync = {
  /** Ano das pastas a importar. PARÂMETRO, nunca constante: 2025 existe
   *  no mesmo drive, com o mesmo padrão de nome. */
  ano?: number;
  /** Ignora o delta guardado e varre a pasta inteira de novo. É o que
   *  se usa quando alguém desconfia de que o job perdeu uma pasta. */
  completo?: boolean;
  /** Quem disparou, para o diário. */
  disparadoPor?: string;
};

/** O ano corrente em São Paulo — e não o do relógio do servidor, que na
 *  Hostinger e no Cloudflare está em UTC e vira o ano três horas cedo. */
function anoCorrente(): number {
  return Number(
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 4),
  );
}

export async function sincronizarOnedrive(
  opcoes: OpcoesSync = {},
): Promise<ResultadoOnedriveSync> {
  const ano = opcoes.ano ?? anoCorrente();
  const db = supabaseAdmin();
  const diario = await abrirDiario(db, ano, opcoes.disparadoPor ?? "");

  const vazio: ResultadoOnedriveSync = {
    ok: false,
    ano,
    status: "erro",
    pastas: 0,
    pastasNoDrive: 0,
    faltando: [],
    importados: 0,
    vinculados: 0,
    conflitos: [],
    jaExistentes: 0,
    ignorados: 0,
    requisicoes: 0,
    detalhe: "",
  };

  try {
    // DOIS MODOS, e a diferença não é de intensidade, é de pergunta.
    //
    // incremental (delta)  — "o que mexeu desde a última vez?". Barato,
    //   é o do agendador. Consumido o token, o que não mudou não volta.
    // completo (/children) — "o que existe agora?". É a reconciliação:
    //   varre a pasta inteira e não depende de token nenhum, então
    //   recupera qualquer pasta que tenha ficado para trás.
    //
    // O modo completo NÃO grava delta_link: sem chamada de delta não há
    // token novo, e escrever null aqui é inofensivo porque
    // `ultimoDeltaLink()` procura a última execução COM token. O
    // incremental seguinte retoma de onde o último delta parou.
    const anterior = opcoes.completo ? null : await ultimoDeltaLink(db);
    const leitura = opcoes.completo
      ? { ...(await lerFilhos()), deltaLink: null }
      : await lerDelta(anterior);
    const clientes = await lerClientes(db);

    const { candidatas, descartados } = triar(leitura.itens, ano);
    const ignorados = [...descartados.values()].reduce((a, b) => a + b, 0);

    const existentes = await jaImportados(
      db,
      candidatas.map((c) => c.item.id),
    );
    const porNumeroNoPortal = await existentesPorNumero(
      db,
      candidatas.map((c) => c.nome.numero),
    );

    // Triagem da escrita: quem cria, quem vincula, quem já está pronto.
    // Ver o bloco "VINCULAR OU CRIAR" acima.
    const aCriar: (Candidata & { casamento: Casamento })[] = [];
    const aVincular: { candidata: Candidata; linhaId: string }[] = [];
    const conflitos: string[] = [];
    let jaVinculados = 0;

    for (const c of candidatas) {
      if (existentes.has(c.item.id)) {
        jaVinculados += 1;
        continue;
      }
      const noPortal = porNumeroNoPortal.get(c.nome.numero);
      if (!noPortal) {
        // O casamento é calculado UMA vez e carregado adiante: ele
        // alimenta a linha do banco e as contas do diário, e recalculá-lo
        // nos dois lugares abriria espaço para os dois discordarem.
        aCriar.push({ ...c, casamento: escolherCliente(c.nome.obra, clientes) });
      } else if (!noPortal.drive_item_id) {
        aVincular.push({ candidata: c, linhaId: noPortal.id });
      } else {
        // Mesmo número, outra pasta. Pode ser pasta duplicada no drive ou
        // número reaproveitado; das duas, nenhuma se resolve no escuro.
        conflitos.push(c.nome.numero);
      }
    }

    let importados = 0;
    for (const lote of emLotes(aCriar, LOTE)) {
      const linhas = lote.map((c) => montarLinha(c, c.casamento));
      // `ignoreDuplicates` é a rede, não o plano: a triagem acima já
      // tirou o que existe. Ele cobre a corrida entre o agendador das
      // cinco e alguém que apertou "Sincronizar agora" no mesmo minuto —
      // e é o índice único do banco que a torna impossível de errar.
      const { data, error } = await db
        .from("orcamentos")
        .upsert(linhas, { onConflict: "drive_item_id", ignoreDuplicates: true })
        .select("id");
      if (error) throw new Error(`Falha ao criar os orçamentos: ${error.message}`);
      importados += ((data as unknown[] | null) ?? []).length;
    }

    // Um UPDATE por linha, e não um upsert em lote: o upsert por `id`
    // que errasse o alvo INSERIRIA um orçamento em branco, e nenhuma
    // economia de requisição paga esse risco numa tabela que é o
    // Comercial inteiro. São ~86 na primeira execução e zero nas
    // seguintes. Em lotes de 10 para não abrir 86 conexões de uma vez.
    let vinculados = 0;
    for (const lote of emLotes(aVincular, 10)) {
      await Promise.all(lote.map((v) => vincular(db, v.linhaId, v.candidata.item)));
      vinculados += lote.length;
    }

    // ------------------------------------------------------------
    // CONFERÊNCIA FINAL — o diário não pode dizer "ok" com pasta faltando
    // ------------------------------------------------------------
    // Em 28/08/2026 duas execuções incrementais reportaram
    // "ok · pastas=1 · 1 já vinculada". Estava certo e se lia como "tudo
    // sincronizado": o delta só devolve o que mudou, então `pastas` não é
    // o total do drive, e ninguém tem como saber disso lendo a tela.
    //
    // Então toda execução — inclusive a incremental — termina perguntando
    // ao drive quantas pastas existem AGORA, por /children, e compara com
    // o que o banco tem vinculado. Custa uma requisição. Sem ela, a única
    // forma de descobrir uma pasta faltando é alguém reparar na tela, que
    // foi exatamente como este defeito apareceu.
    //
    // A comparação é por drive_item_id, e não por contagem: contagem
    // igual com conjuntos diferentes existe, e o que interessa é PODER
    // DIZER QUAL pasta faltou.
    const auditoria = opcoes.completo
      ? { itens: leitura.itens, requisicoes: 0 }
      : await lerFilhos();
    const noDrive = triar(auditoria.itens, ano).candidatas;
    const vinculadosNoBanco = await idsVinculados(db);
    const faltando = noDrive.filter((c) => !vinculadosNoBanco.has(c.item.id));

    // Só chega aqui quem gravou tudo o que viu. Ver `ultimoDeltaLink()`.
    //
    // As contas de cliente são sobre o que foi CRIADO, e não sobre o que
    // foi vinculado: quem vinculou já tem o cliente digitado por gente, e
    // contá-lo como "a definir" faria a tela pedir conferência de uma
    // linha que está fechada.
    const semCliente = aCriar.filter((c) => c.casamento.cliente === null).length;
    // O acerto por aproximação (regra 2) sai contado à parte no diário:
    // ele é um palpite mais fraco que o casamento inteiro, e quem for
    // conferir merece saber quantos são antes de abrir a listagem.
    const porAproximacao = aCriar.filter((c) => c.casamento.como === "parcial").length;

    // Número repetido não é erro do job, é o que está no drive: em
    // 28/08/2026 havia duas pastas "ORC 001_2026", uma delas o modelo
    // "NOME DA OBRA - CLIENTE". A idempotência é por drive_item_id, não
    // por número, então as duas entram — e o diário diz quais, porque
    // dois orçamentos com o mesmo número confundem quem abre a listagem
    // e ninguém descobriria o motivo sem esta linha.
    const porNumero = new Map<string, number>();
    for (const c of candidatas) porNumero.set(c.nome.numero, (porNumero.get(c.nome.numero) ?? 0) + 1);
    const repetidos = [...porNumero.entries()].filter(([, n]) => n > 1).map(([n]) => n);

    const partes = [
      // "no delta" era enganoso na incremental: ali `candidatas` é o que
      // MUDOU, não o que existe. A conferência abaixo é que diz o total.
      `${candidatas.length} pasta(s) de ${ano} ${opcoes.completo ? "na varredura" : "no delta"}`,
      `${importados} criada(s)`,
      `${vinculados} vinculada(s) a orçamento já lançado`,
      `${jaVinculados} já vinculada(s) antes`,
      `CONFERÊNCIA: ${noDrive.length} pasta(s) no drive, ${noDrive.length - faltando.length} vinculada(s) no Portal`,
    ];
    if (faltando.length) {
      partes.push(
        `FALTANDO ${faltando.length}: ${faltando.map((f) => f.nome.numero).join(", ")}` +
          " — rode a varredura completa",
      );
    }
    if (semCliente) partes.push(`${semCliente} das criadas com cliente a definir`);
    if (porAproximacao) partes.push(`${porAproximacao} com cliente por aproximação`);
    if (conflitos.length) {
      partes.push(`CONFLITO — número já vinculado a outra pasta: ${conflitos.join(", ")}`);
    }
    if (repetidos.length) {
      partes.push(`número repetido no drive: ${repetidos.join(", ")}`);
    }
    if (anterior) partes.push("delta incremental");
    else partes.push("varredura completa");
    if (descartados.size) {
      partes.push(
        "descartados: " +
          [...descartados.entries()].map(([motivo, n]) => `${n} ${motivo}`).join(", "),
      );
    }

    const resultado: ResultadoOnedriveSync = {
      // `ok` é do TRANSPORTE: a execução rodou até o fim sem estourar.
      // Pasta faltando não é falha de transporte, é divergência de
      // estado — por isso ela aparece no `status`, e não aqui.
      ok: true,
      ano,
      // A ORDEM DESTA CONDIÇÃO É A REGRA DO PASSO 3.
      //
      // "erro" quando falta pasta: é o único desfecho em que o Portal
      // NÃO tem o que o drive tem, e ele precisa gritar — foi assim que
      // "tudo sincronizado" com 11 faltando passou batido. "parcial"
      // quando só sobrou trabalho de conferência para gente. "ok" exige
      // as duas coisas: drive e banco batendo, e nada pendente.
      status: faltando.length ? "erro" : semCliente || conflitos.length ? "parcial" : "ok",
      pastas: candidatas.length,
      /** O total real do drive, medido na conferência. */
      pastasNoDrive: noDrive.length,
      faltando: faltando.map((f) => f.nome.numero),
      importados,
      vinculados,
      conflitos,
      jaExistentes: jaVinculados,
      ignorados,
      requisicoes: leitura.requisicoes + auditoria.requisicoes,
      detalhe: partes.join(" · "),
      erro: faltando.length
        ? `${faltando.length} pasta(s) do drive sem orçamento no Portal: ${faltando.map((f) => f.nome.numero).join(", ")}.`
        : undefined,
    };
    await fecharDiario(db, diario, resultado, leitura.deltaLink);
    return resultado;
  } catch (e) {
    const resultado: ResultadoOnedriveSync = { ...vazio, erro: mensagem(e) };
    // deltaLink null de propósito: a próxima execução volta a ler o
    // token da última que fechou, e o que não foi gravado é revisto.
    await fecharDiario(db, diario, resultado, null);
    return resultado;
  }
}
