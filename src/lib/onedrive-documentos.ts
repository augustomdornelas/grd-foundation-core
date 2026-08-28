// ============================================================
// Ler os documentos da pasta do orçamento — SÓ SERVIDOR
// ------------------------------------------------------------
// ETAPA 2. A etapa 1 leu o NOME da pasta; esta abre os arquivos de
// dentro e tenta preencher o que ficou vazio. Continua sendo SÓ LEITURA:
// nada é escrito no OneDrive, em lugar nenhum.
//
// ------------------------------------------------------------
// O ACHADO QUE MOLDA ESTE ARQUIVO
// ------------------------------------------------------------
// Texto real do documento do ORC 091_2026:
//
//     Item 1  Pintura da Parede/teto     R$ 13.280,00
//     TOTAL GERAL                        R$ 10.080,00
//
// O ITEM AVULSO É MAIOR QUE O TOTAL. Um extrator que pegasse o primeiro
// "R$" da página, ou o maior, mandaria R$ 13.280 para o pipeline
// comercial — e ninguém conferiria, porque o número é plausível.
//
// Daí as três regras que mandam aqui, e nenhuma delas é preferência de
// estilo:
//
//   1. ANCORAR SEMPRE num rótulo explícito de total ("TOTAL GERAL" e
//      equivalentes). Valor sem âncora não é lido. Ver `ROTULOS_TOTAL`.
//   2. NORMALIZAR O ESPAÇAMENTO ANTES DE CONVERTER. O mesmo documento
//      extrai como "R$ 1 0 . 0 80,00" — o Word quebra o número com
//      marcações no meio, e `Number()` sobre isso dá NaN ou, pior, um
//      número errado. Ver `desespacar()`.
//   3. EMPATE NÃO É ESCOLHA. Dois candidatos a total com valores
//      diferentes => valor VAZIO, e os candidatos vão para a observação.
//      Escolher um deles seria exatamente o erro que a regra 1 evita.
//
// E mais uma, aprendida no mesmo documento: ele escreve "tez mil" onde
// queria "dez mil". Por isso NENHUM valor sai de extenso — só de
// algarismo ancorado.
//
// ------------------------------------------------------------
// AS BIBLIOTECAS, E POR QUE ESTAS
// ------------------------------------------------------------
// Medido no acervo em 28/08/2026, 95 pastas e 439 arquivos:
//   .docx em 94% das pastas · .xlsx/.xlsm em 77% · .pdf em 53%
//   PPU_*.xlsx em apenas 8% — e NENHUMA pasta depende só de PDF.
//
// XLSX: a biblioteca `xlsx` JÁ ERA DEPENDÊNCIA do projeto (o Comercial
// exporta com ela). Lê .xlsx e .xlsm, é JavaScript puro e não custa
// dependência nova.
//
// DOCX: leitor próprio, aqui embaixo, com `node:zlib`. Um .docx é um ZIP
// com `word/document.xml` dentro, e ler o ZIP pelo diretório central são
// ~80 linhas sem nenhuma dependência — o que importa porque o alvo é a
// Hostinger, onde dependência nativa é risco de deploy.
//
// Mas o motivo principal não é economia: é que a conversão precisa
// PRESERVAR A LINHA DA TABELA. "TOTAL GERAL" e "R$ 10.080,00" são duas
// células da MESMA linha, e qualquer extrator genérico de texto entrega
// isso como texto corrido, onde a âncora perde o vínculo com o número.
// Aqui `</w:tc>` vira tabulação e `</w:tr>` vira quebra de linha, então
// a linha da tabela sobrevive à leitura — que é justamente o que a
// regra 1 precisa.
//
// PDF: NÃO ADOTADO, de propósito. Nenhuma das 95 pastas tem só PDF, então
// um leitor de PDF acrescentaria zero de cobertura hoje, em troca de uma
// dependência pesada. `escolherFonte()` já ignora PDF; quando fizer
// falta, é aqui que entra.
//
// NADA DISTO VAI PARA O NAVEGADOR: este módulo é importado só por
// onedrive-sync.ts (servidor), e a guarda abaixo é barulhenta.
// ============================================================

import { inflateRawSync } from "node:zlib";

if (typeof window !== "undefined") {
  throw new Error("onedrive-documentos.ts é código de servidor.");
}

// ------------------------------------------------------------
// ZIP: só o suficiente para um .docx
// ------------------------------------------------------------
// Lido pelo DIRETÓRIO CENTRAL, e não pelos cabeçalhos locais. Os locais
// podem trazer tamanho zerado e mandar o tamanho real num "data
// descriptor" depois dos dados — comum em quem grava em streaming, e uma
// fonte clássica de leitor que funciona em quase todo arquivo. O
// diretório central sempre tem os tamanhos corretos.

function u16(b: Uint8Array, p: number): number {
  return b[p] | (b[p + 1] << 8);
}
function u32(b: Uint8Array, p: number): number {
  return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
}

/** Extrai UMA entrada do zip pelo nome. null quando não existe. */
export function lerDoZip(zip: Uint8Array, alvo: string): Uint8Array | null {
  // Fim do diretório central: assinatura 0x06054b50, nos últimos 64 KB.
  let fim = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) {
    if (u32(zip, i) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) return null;

  const quantas = u16(zip, fim + 10);
  let p = u32(zip, fim + 16);

  for (let i = 0; i < quantas; i++) {
    if (u32(zip, p) !== 0x02014b50) return null;
    const metodo = u16(zip, p + 10);
    const compress = u32(zip, p + 20);
    const nomeLen = u16(zip, p + 28);
    const extraLen = u16(zip, p + 30);
    const comentLen = u16(zip, p + 32);
    const desloc = u32(zip, p + 42);
    const nome = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nomeLen));

    if (nome === alvo) {
      // No cabeçalho local, só os campos de tamanho variável interessam:
      // os dados começam depois deles.
      if (u32(zip, desloc) !== 0x04034b50) return null;
      const nomeLocal = u16(zip, desloc + 26);
      const extraLocal = u16(zip, desloc + 28);
      const ini = desloc + 30 + nomeLocal + extraLocal;
      const dados = zip.subarray(ini, ini + compress);
      if (metodo === 0) return dados; // guardado sem compressão
      if (metodo === 8) return new Uint8Array(inflateRawSync(dados));
      return null; // método exótico: não adivinha
    }
    p += 46 + nomeLen + extraLen + comentLen;
  }
  return null;
}

// ------------------------------------------------------------
// DOCX -> texto com as linhas da tabela preservadas
// ------------------------------------------------------------
/**
 * O `word/document.xml` vira texto onde célula é tabulação e linha de
 * tabela é quebra de linha. É essa forma que deixa "TOTAL GERAL" e o
 * número na MESMA linha, que é do que a ancoragem depende.
 */
export function textoDoDocx(bytes: Uint8Array): string | null {
  const xml = lerDoZip(bytes, "word/document.xml");
  if (!xml) return null;
  const bruto = new TextDecoder("utf-8").decode(xml);

  return (
    bruto
      // Quebras explícitas e fim de parágrafo viram linha.
      .replace(/<w:br\b[^>]*\/?>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      // Célula vira tabulação; linha de tabela, quebra.
      .replace(/<\/w:tc>/g, "\t")
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<w:tab\b[^>]*\/?>/g, "\t")
      // O resto da marcação some. O texto de verdade mora fora das tags.
      .replace(/<[^>]+>/g, "")
      // Entidades que aparecem de fato num documento do Word.
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/\r/g, "")
      // Espaço em excesso dentro da linha, sem colapsar as linhas.
      .split("\n")
      .map((l) => l.replace(/[ \t ]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
  );
}

// ------------------------------------------------------------
// XLSX/XLSM -> linhas
// ------------------------------------------------------------
/**
 * Cada linha da planilha vira uma linha de texto com as células
 * separadas por tabulação — o mesmo formato do docx, para as regras de
 * extração valerem para os dois sem saber de onde veio.
 */
export async function textoDoXlsx(bytes: Uint8Array): Promise<string | null> {
  // `await import` para a planilha não entrar em nenhum grafo que não
  // precise dela, e para o erro de leitura ficar contido aqui.
  const XLSX = await import("xlsx");
  let livro;
  try {
    livro = XLSX.read(bytes, { type: "array" });
  } catch {
    return null;
  }
  const partes: string[] = [];
  for (const nome of livro.SheetNames) {
    const aba = livro.Sheets[nome];
    if (!aba) continue;
    const linhas = XLSX.utils.sheet_to_json<unknown[]>(aba, { header: 1, blankrows: false });
    for (const linha of linhas) {
      if (!Array.isArray(linha)) continue;
      partes.push(linha.map((c) => (c === null || c === undefined ? "" : String(c))).join("\t"));
    }
  }
  return partes.length ? partes.join("\n") : null;
}

// ------------------------------------------------------------
// Normalização e leitura de dinheiro
// ------------------------------------------------------------
/**
 * Tira o espaçamento de dentro do número.
 *
 * "R$ 1 0 . 0 80,00" é texto REAL do acervo: o Word grava o número
 * partido em vários `<w:t>` e a concatenação devolve espaço no meio dos
 * dígitos. Sem esta passagem, o valor certo vira NaN — ou, pior, vira
 * "1" e passa como número válido.
 */
export function desespacar(s: string): string {
  return s.replace(/(?<=[\d.,])[  ]+(?=[\d.,])/g, "");
}

/**
 * "10.080,00" -> 10080. Formato brasileiro, e só ele: vírgula é decimal,
 * ponto é milhar. Devolve null quando não é um número que dê para ler
 * com certeza — inclusive quando falta a parte decimal, porque "R$ 10"
 * num orçamento de obra é quase sempre pedaço de outra coisa.
 */
export function paraNumeroBr(s: string): number | null {
  const limpo = desespacar(s).replace(/[R$\s]/gi, "");
  if (!/^\d{1,3}(\.\d{3})*,\d{2}$/.test(limpo) && !/^\d+,\d{2}$/.test(limpo)) return null;
  const n = Number(limpo.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Todo dinheiro de uma linha, na ordem em que aparece. */
export function dinheirosDaLinha(linha: string): number[] {
  const achados: number[] = [];
  for (const m of desespacar(linha).matchAll(/R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g)) {
    const n = paraNumeroBr(m[1]);
    if (n !== null) achados.push(n);
  }
  return achados;
}

// ------------------------------------------------------------
// As âncoras
// ------------------------------------------------------------
/**
 * Rótulos que significam "este é o total da proposta".
 *
 * A lista é DELIBERADAMENTE curta e explícita. "TOTAL" sozinho não entra:
 * ele aparece em "TOTAL DO ITEM", "SUBTOTAL" e no cabeçalho "TOTAL R$" de
 * coluna de tabela, e é exatamente aí que mora o R$ 13.280 do ORC 091.
 */
const ROTULOS_TOTAL = [
  /\bTOTAL\s+GERAL\b/i,
  /\bVALOR\s+TOTAL\s+(?:DA\s+)?(?:PROPOSTA|OBRA|SERVI[ÇC]OS?)\b/i,
  /\bTOTAL\s+(?:DA\s+)?PROPOSTA\b/i,
  /\bTOTAL\s+GLOBAL\b/i,
  /\bPRE[ÇC]O\s+TOTAL\s+(?:DA\s+)?(?:PROPOSTA|OBRA)\b/i,
  /\bVALOR\s+GLOBAL\b/i,
];

/** Rótulos que NÃO são total, mesmo contendo a palavra. Existem para o
 *  caso de um documento escrever "SUBTOTAL GERAL". */
const ANTI_ROTULOS = [/\bSUB\s*-?\s*TOTAL\b/i, /\bTOTAL\s+DO\s+ITEM\b/i, /\bTOTAL\s+UNIT/i];

export type CandidatoTotal = {
  /** O rótulo e o número, como estão no documento. Vai para a observação. */
  trecho: string;
  valor: number;
  linha: number;
};

/**
 * Procura o total ancorado num rótulo explícito.
 *
 * Olha a própria linha do rótulo e, se ela não tiver número, a seguinte —
 * porque em tabela de duas colunas o rótulo e o valor às vezes caem em
 * linhas diferentes na extração. Duas linhas, e não cinco: quanto mais
 * longe do rótulo, menos ele ancora coisa nenhuma.
 */
export function acharTotais(texto: string): CandidatoTotal[] {
  const linhas = texto.split("\n");
  const achados: CandidatoTotal[] = [];

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (ANTI_ROTULOS.some((r) => r.test(linha))) continue;
    if (!ROTULOS_TOTAL.some((r) => r.test(linha))) continue;

    let valores = dinheirosDaLinha(linha);
    let trecho = linha;
    if (!valores.length && i + 1 < linhas.length) {
      valores = dinheirosDaLinha(linhas[i + 1]);
      trecho = `${linha} / ${linhas[i + 1]}`;
    }
    // Linha de total com mais de um número (ex.: "TOTAL GERAL 3 R$ 10.080,00")
    // — o total é o ÚLTIMO, que é onde a coluna de valor fica. Mas se os
    // números forem todos diferentes e plausíveis, quem decide é o
    // desempate lá em `extrairDoTexto`, com todos os candidatos à vista.
    for (const v of valores) {
      achados.push({ trecho: trecho.slice(0, 200).trim(), valor: v, linha: i + 1 });
    }
  }
  return achados;
}

// ------------------------------------------------------------
// Os outros campos
// ------------------------------------------------------------
const MESES: Record<string, string> = {
  janeiro: "01", fevereiro: "02", "março": "03", marco: "03", abril: "04",
  maio: "05", junho: "06", julho: "07", agosto: "08", setembro: "09",
  outubro: "10", novembro: "11", dezembro: "12",
};

/**
 * Data de emissão, só quando ESCRITA. Aceita "12/03/2026" e
 * "Bauru, 12 de março de 2026".
 *
 * NÃO calcula nada. "Validade: 30 dias" continua sendo 30 dias, e não
 * vira data — sem data base explícita, somar 30 dias a alguma coisa é
 * inventar. Ver `extrairDoTexto`, que devolve `validadeTexto`.
 */
export function acharData(texto: string): { iso: string; trecho: string } | null {
  const linhas = texto.split("\n");
  for (const linha of linhas) {
    const rotulada = /\b(?:DATA|EMISS[ÃA]O|DATA\s+DE\s+EMISS[ÃA]O)\b\s*[:\-–]\s*(.+)/i.exec(linha);
    const alvo = rotulada ? rotulada[1] : linha;

    const numerica = /\b(\d{2})\/(\d{2})\/(\d{4})\b/.exec(alvo);
    if (numerica && (rotulada || /\b(?:DATA|EMISS)/i.test(linha))) {
      return { iso: `${numerica[3]}-${numerica[2]}-${numerica[1]}`, trecho: linha.slice(0, 160).trim() };
    }
    const extenso = /\b(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+(\d{4})\b/i.exec(alvo);
    if (extenso) {
      const mes = MESES[extenso[2].toLowerCase()];
      if (mes) {
        return {
          iso: `${extenso[3]}-${mes}-${extenso[1].padStart(2, "0")}`,
          trecho: linha.slice(0, 160).trim(),
        };
      }
    }
  }
  return null;
}

/**
 * Todo CNPJ do documento, com a linha em que apareceu.
 *
 * NÃO devolve "o CNPJ do cliente": a proposta é NOSSA, então o CNPJ que
 * mais aparece nela é o da própria GRD. Quem chama tem que descartar o
 * nosso antes de usar o resto — ver `CNPJ_PROPRIO` em onedrive-sync.ts.
 */
export function acharCnpjs(texto: string): { cnpj: string; trecho: string }[] {
  const achados: { cnpj: string; trecho: string }[] = [];
  const vistos = new Set<string>();
  for (const linha of texto.split("\n")) {
    for (const m of desespacar(linha).matchAll(/\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/g)) {
      if (vistos.has(m[1])) continue;
      vistos.add(m[1]);
      achados.push({ cnpj: m[1], trecho: linha.slice(0, 160).trim() });
    }
  }
  return achados;
}

/** "Validade: 30 dias" — o texto como está, sem virar data. */
export function acharValidade(texto: string): string | null {
  for (const linha of texto.split("\n")) {
    const m = /\bVALIDADE\b[^\n]{0,60}/i.exec(linha);
    if (m) return m[0].slice(0, 120).trim();
  }
  return null;
}

// ------------------------------------------------------------
// Escolher a fonte dentro da pasta
// ------------------------------------------------------------
export type ArquivoCandidato = { id: string; nome: string; tamanho: number };

/** Número de revisão do nome: "rev01", "_v2", "V03". 0 quando não tem. */
export function revisaoDe(nome: string): number {
  const m = /(?:\brev\s*\.?\s*|_v|\bv)(\d{1,3})\b/i.exec(nome);
  return m ? Number(m[1]) : 0;
}

export type Fonte = {
  arquivo: ArquivoCandidato;
  tipo: "ppu" | "docx" | "xlsx";
  /** Por que este e não outro. Vai para a observação. */
  porque: string;
};

/**
 * A ordem pedida: PPU_*.xlsx, depois a proposta .docx.
 *
 * PDF fica de fora — ver o cabeçalho: nenhuma pasta do acervo depende só
 * dele. Planilha que não seja PPU também fica de fora por enquanto: ela
 * existe em 77% das pastas, mas não está na ordem combinada, e escolher
 * uma "MD - Civil Canal Vinhaca_Rev1.xlsx" como fonte de valor seria
 * decisão minha, não sua.
 *
 * Havendo revisão, vence a maior — e `porque` registra qual foi usada,
 * para quem conferir não precisar adivinhar.
 */
export function escolherFonte(arquivos: ArquivoCandidato[]): Fonte | null {
  const naoTemporario = (a: ArquivoCandidato) => !/^~\$/.test(a.nome);

  const ppu = arquivos.filter(
    (a) => naoTemporario(a) && /^ppu/i.test(a.nome) && /\.xlsx?$/i.test(a.nome),
  );
  const docx = arquivos.filter((a) => naoTemporario(a) && /\.docx$/i.test(a.nome));

  const escolher = (lista: ArquivoCandidato[], tipo: Fonte["tipo"]): Fonte | null => {
    if (!lista.length) return null;
    const ordenada = [...lista].sort((x, y) => revisaoDe(y.nome) - revisaoDe(x.nome));
    const alvo = ordenada[0];
    const rev = revisaoDe(alvo.nome);
    const porque =
      lista.length === 1
        ? `único ${tipo === "ppu" ? "PPU" : tipo} da pasta`
        : `${tipo === "ppu" ? "PPU" : tipo} mais recente entre ${lista.length}` +
          (rev ? ` (revisão ${rev})` : " (nenhum tem número de revisão; usado o primeiro)");
    return { arquivo: alvo, tipo, porque };
  };

  return escolher(ppu, "ppu") ?? escolher(docx, "docx");
}

// ------------------------------------------------------------
// O DOCUMENTO É DESTE ORÇAMENTO MESMO?
// ------------------------------------------------------------
// A pergunta parece paranoia até se olhar o acervo. Medido em
// 28/08/2026, nas 90 pastas com fonte:
//
//   11 pastas têm um documento cujo NOME declara outro orçamento
//      (a pasta ORC 009_2026 guarda "ORC 005_2025 – REFORMA SALA DA
//      GERÊNCIA...", que é de outra obra e de outro cliente);
//   e há caso pior: a pasta ORC 007_2026 tem um arquivo com o nome
//      CERTO — "ORC 007_2026 – FINALIZAÇÃO DA AREA DE VIVÊNCIA LP1 –
//      BRACELL FLORESTAL LP - V01.docx" — cujo CONTEÚDO é a proposta da
//      ORC 005 (mesmo título, mesmo cliente, mesma data, mesmo total).
//      Alguém copiou o arquivo e trocou só o nome.
//
// Sem esta conferência, o extrator faz o que foi mandado fazer e grava
// R$ 21.373,43 em três orçamentos diferentes, dois deles errados. O
// número é plausível, ninguém confere, e o erro vira relatório.
//
// A CONFERÊNCIA É PELO CORPO, e não pelo nome do arquivo: o corpo pegou
// os 11 casos de nome e mais o da ORC 007, que o nome não pegaria.
// Comparação pelo NÚMERO, ignorando zeros à esquerda ("ORC 31_2026" é a
// pasta ORC 031_2026) e tolerando o ano — trocar 2025 por 2026 no nome
// é erro de digitação comum, e o número é o que identifica.

export type Pertencimento =
  | { ok: true; aviso?: string }
  | { ok: false; motivo: string; declarado: string };

/** As referências "ORC NNN_AAAA" que o documento faz a si mesmo. */
export function orcsCitados(texto: string): string[] {
  const achados = new Set<string>();
  for (const m of desespacar(texto).matchAll(/\bORC\s*(\d{1,4})\s*[_/.\-–—]\s*((?:19|20)\d{2})\b/gi)) {
    achados.add(`ORC ${String(Number(m[1])).padStart(3, "0")}_${m[2]}`);
  }
  return [...achados];
}

/**
 * O documento pode ser usado como fonte deste orçamento?
 *
 * Silêncio é aceitação: documento que não cita número nenhum é o caso
 * normal, e recusar por isso deixaria a maioria das pastas sem extração.
 * O que derruba é o documento AFIRMAR ser de outro orçamento.
 */
export function conferirPertence(numeroDaPasta: string, texto: string): Pertencimento {
  const citados = orcsCitados(texto);
  if (!citados.length) return { ok: true };

  const soNumero = (s: string) => Number(/(\d{1,4})_/.exec(s)?.[1] ?? -1);
  const meu = soNumero(numeroDaPasta);
  const bate = citados.filter((c) => soNumero(c) === meu);

  if (bate.length) {
    const anoDiferente = bate.find((c) => c !== numeroDaPasta);
    return anoDiferente
      ? {
          ok: true,
          aviso: `O documento se identifica como "${anoDiferente}", e a pasta é "${numeroDaPasta}" — mesmo número, ano diferente no arquivo.`,
        }
      : { ok: true };
  }

  return {
    ok: false,
    declarado: citados.join(", "),
    motivo:
      `O documento desta pasta se identifica como "${citados.join(", ")}", e não como "${numeroDaPasta}". ` +
      "Nada foi extraído dele — o arquivo parece ser de outro orçamento.",
  };
}

// ------------------------------------------------------------
// A extração
// ------------------------------------------------------------
export type Extracao = {
  valor: number | null;
  /** O trecho que ancorou o valor. Vazio quando não houve valor. */
  ancora: string;
  /** Todos os candidatos, quando houve mais de um e nada foi escolhido. */
  candidatos: CandidatoTotal[];
  dataEmissao: string | null;
  dataTrecho: string;
  cnpjs: { cnpj: string; trecho: string }[];
  validadeTexto: string | null;
  /** Coisas estranhas que merecem a atenção de quem confere. */
  avisos: string[];
  /** true quando o documento se identifica como sendo de OUTRO orçamento.
   *  Nada foi extraído, e o motivo está em `avisos`. */
  naoPertence?: boolean;
};

/**
 * Lê o texto já normalizado e devolve o que dá para afirmar.
 *
 * A REGRA DO EMPATE está aqui: candidatos com valores DIFERENTES deixam
 * `valor` em null. Candidatos repetidos com o MESMO valor não são empate
 * — é o mesmo total aparecendo no resumo e no rodapé, e aí dá para usar.
 */
export function extrairDoTexto(texto: string, numeroDaPasta?: string): Extracao {
  const avisos: string[] = [];

  // A CONFERÊNCIA VEM ANTES DE TUDO. Documento de outro orçamento não
  // rende meia extração: rende nenhuma. Aproveitar "só a data" dele
  // seria carimbar num orçamento a data de outro.
  if (numeroDaPasta) {
    const pertence = conferirPertence(numeroDaPasta, texto);
    if (!pertence.ok) {
      return {
        valor: null,
        ancora: "",
        candidatos: [],
        dataEmissao: null,
        dataTrecho: "",
        cnpjs: [],
        validadeTexto: null,
        avisos: [pertence.motivo],
        naoPertence: true,
      };
    }
    if (pertence.aviso) avisos.push(pertence.aviso);
  }
  const candidatos = acharTotais(texto);
  const distintos = [...new Set(candidatos.map((c) => c.valor))];

  let valor: number | null = null;
  let ancora = "";
  if (distintos.length === 1) {
    valor = distintos[0];
    ancora = candidatos[0].trecho;
  } else if (distintos.length > 1) {
    avisos.push(
      `Mais de um total no documento (${distintos.map((v) => brl(v)).join(" e ")}) — valor não preenchido.`,
    );
  } else {
    // NENHUM RÓTULO DE TOTAL, e o campo fica vazio — mas calar sobre os
    // valores que existem no documento seria esconder trabalho de quem
    // vai preencher.
    //
    // O ORC 001_2026 é o caso: a proposta não tem tabela nem "TOTAL
    // GERAL", só a frase "os honorários ... ficam em R$ 7.500,00". O
    // número está certo (bate com o que o Comercial lançou à mão), e
    // ainda assim a máquina não o escreve: uma frase em prosa não é
    // rótulo de total, e a lição do ORC 091 é que número plausível sem
    // âncora é como se erra com confiança. Então ele vai para a
    // observação, e quem confere resolve num clique.
    const todos = new Set<number>();
    for (const linha of texto.split("\n")) for (const v of dinheirosDaLinha(linha)) todos.add(v);
    const lista = [...todos].sort((a, b) => b - a).slice(0, 6);
    if (lista.length) {
      avisos.push(
        `Nenhum rótulo de total ("TOTAL GERAL" e equivalentes) no documento — valor não preenchido. ` +
          `Valores que aparecem: ${lista.map((v) => brl(v)).join(", ")}${todos.size > lista.length ? " e outros" : ""}.`,
      );
    } else {
      avisos.push("Nenhum valor em reais encontrado no documento.");
    }
  }

  // O aviso do ORC 091: item avulso maior que o total escolhido. Não
  // muda o valor — o total ancorado continua valendo —, mas quem confere
  // precisa saber que o documento tem essa contradição dentro.
  if (valor !== null) {
    let maior = 0;
    let linhaMaior = "";
    for (const linha of texto.split("\n")) {
      if (ROTULOS_TOTAL.some((r) => r.test(linha))) continue;
      for (const v of dinheirosDaLinha(linha)) {
        if (v > maior) {
          maior = v;
          linhaMaior = linha.slice(0, 120).trim();
        }
      }
    }
    if (maior > valor) {
      avisos.push(
        `O documento tem um item de ${brl(maior)} MAIOR que o total de ${brl(valor)} — "${linhaMaior}".`,
      );
    }
  }

  const data = acharData(texto);
  return {
    valor,
    ancora,
    candidatos: distintos.length > 1 ? candidatos : [],
    dataEmissao: data?.iso ?? null,
    dataTrecho: data?.trecho ?? "",
    cnpjs: acharCnpjs(texto),
    validadeTexto: acharValidade(texto),
    avisos,
    naoPertence: false,
  };
}

/** R$ no padrão brasileiro, para as mensagens deste módulo. */
export function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * O que o arquivo É, olhando por dentro — e não o que a extensão diz.
 *
 * NÃO É PRECIOSISMO. O ORC 002_2026 do acervo tem um arquivo chamado
 * "... - V01.docx" cujo zip contém `xl/workbook.xml`: é uma PLANILHA
 * salva com extensão de Word. Despachando por extensão, ele caía no
 * leitor de docx, que procurava `word/document.xml`, não achava, e
 * devolvia "não deu para ler" — um orçamento perdido por causa do nome
 * do arquivo.
 *
 * docx e xlsx são os dois zips, então a pergunta certa é qual entrada
 * existe lá dentro.
 */
export function tipoReal(bytes: Uint8Array): "docx" | "xlsx" | null {
  // PK\x03\x04: se não é zip, não é nenhum dos dois formatos modernos.
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return null;
  if (lerDoZip(bytes, "word/document.xml")) return "docx";
  if (lerDoZip(bytes, "xl/workbook.xml")) return "xlsx";
  return null;
}

/**
 * Texto do arquivo. `null` quando não deu para ler com segurança — e
 * "não deu" é resposta legítima: melhor a observação dizer que o
 * documento não foi lido do que devolver texto pela metade.
 */
export async function textoDoArquivo(
  _nome: string,
  bytes: Uint8Array,
): Promise<{ texto: string; tipo: "docx" | "xlsx" } | null> {
  const tipo = tipoReal(bytes);
  if (tipo === "docx") {
    const texto = textoDoDocx(bytes);
    return texto ? { texto, tipo } : null;
  }
  if (tipo === "xlsx") {
    const texto = await textoDoXlsx(bytes);
    return texto ? { texto, tipo } : null;
  }
  return null;
}
