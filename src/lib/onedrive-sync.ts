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
import { lerDelta, OneDriveErro, type ItemDrive } from "@/lib/onedrive-client";

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
    // Acontece de verdade, e mais do que se imaginaria: o acervo tem
    // "ORC 062_2026 - ..." dentro de "ORC 063_2026 - ...", e pastas
    // repetidas dentro de si mesmas. Sem este filtro, 17 subpastas
    // viravam orçamento na varredura de 28/08/2026.
    if (dentroDeOutroOrcamento(item)) {
      descartar(descartados, "subpasta de outro orçamento");
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
  /** Pastas do ano pedido encontradas no delta. */
  pastas: number;
  importados: number;
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
    importados: 0,
    jaExistentes: 0,
    ignorados: 0,
    requisicoes: 0,
    detalhe: "",
  };

  try {
    const anterior = opcoes.completo ? null : await ultimoDeltaLink(db);
    const delta = await lerDelta(anterior);
    const clientes = await lerClientes(db);

    const { candidatas, descartados } = triar(delta.itens, ano);
    const ignorados = [...descartados.values()].reduce((a, b) => a + b, 0);

    const existentes = await jaImportados(
      db,
      candidatas.map((c) => c.item.id),
    );
    // O casamento é calculado UMA vez por pasta e carregado adiante: ele
    // alimenta a linha do banco e as contas do diário, e recalculá-lo
    // nos dois lugares seria abrir espaço para os dois discordarem.
    const novas = candidatas
      .filter((c) => !existentes.has(c.item.id))
      .map((c) => ({ ...c, casamento: escolherCliente(c.nome.obra, clientes) }));

    let importados = 0;
    for (const lote of emLotes(novas, LOTE)) {
      const linhas = lote.map((c) => montarLinha(c, c.casamento));
      // `ignoreDuplicates` é a rede, não o plano: a filtragem acima já
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

    // Só chega aqui quem gravou tudo o que viu. Ver `ultimoDeltaLink()`.
    const semCliente = novas.filter((c) => c.casamento.cliente === null).length;
    // O acerto por aproximação (regra 2) sai contado à parte no diário:
    // ele é um palpite mais fraco que o casamento inteiro, e quem for
    // conferir merece saber quantos são antes de abrir a listagem.
    const porAproximacao = novas.filter((c) => c.casamento.como === "parcial").length;

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
      `${candidatas.length} pasta(s) de ${ano} no delta`,
      `${importados} importada(s)`,
      `${candidatas.length - novas.length} já existia(m)`,
    ];
    if (semCliente) partes.push(`${semCliente} com cliente a definir`);
    if (porAproximacao) partes.push(`${porAproximacao} com cliente por aproximação`);
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
      ok: true,
      ano,
      // "parcial" quando alguma pasta nova entrou sem cliente: o job
      // funcionou, mas deixou trabalho de conferência para alguém. A
      // tela mostra os dois estados separados.
      status: semCliente ? "parcial" : "ok",
      pastas: candidatas.length,
      importados,
      jaExistentes: candidatas.length - novas.length,
      ignorados,
      requisicoes: delta.requisicoes,
      detalhe: partes.join(" · "),
    };
    await fecharDiario(db, diario, resultado, delta.deltaLink);
    return resultado;
  } catch (e) {
    const resultado: ResultadoOnedriveSync = { ...vazio, erro: mensagem(e) };
    // deltaLink null de propósito: a próxima execução volta a ler o
    // token da última que fechou, e o que não foi gravado é revisto.
    await fecharDiario(db, diario, resultado, null);
    return resultado;
  }
}
