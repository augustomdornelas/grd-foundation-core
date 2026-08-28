// ============================================================
// Leitura tolerante do JSON da Secullum
// ------------------------------------------------------------
// Estas funções nasceram dentro de secullum-sync.ts. Saíram de lá
// quando a carga inicial passou a precisar das mesmas: três cópias do
// mesmo `campo()` seriam três lugares para o mapeamento divergir em
// silêncio.
//
// POR QUE A LEITURA É TOLERANTE, e não um parser estrito
//
// A API da Secullum não tem contrato publicado campo a campo. O
// diagnóstico de 27/08/2026 confirmou o formato de /Funcionarios,
// /Departamentos, /Funcoes, /Horarios e /Empresas; NÃO confirmou
// /Batidas nem /Calcular/SomenteTotais. Além disso a mesma informação
// aparece com nomes diferentes conforme o endpoint — ora
// `DepartamentoId`, ora `DepartamentoDescricao`.
//
// Um parser estrito quebraria a carga inteira por causa de uma letra
// maiúscula. Estas funções aceitam variação de nome e de caixa e
// devolvem vazio quando não reconhecem — e quem chama registra a
// amostra do que não soube ler, em vez de gravar lixo.
//
// Este arquivo é puro: não toca em rede, banco nem process.env, e
// serve tanto ao servidor quanto à tela.
// ============================================================

type Registro = Record<string, unknown>;

/**
 * Lê um campo aceitando variação de nome e de caixa.
 * `campo(f, "DepartamentoDescricao", "Departamento")` acha qualquer um
 * dos dois, e acha também `departamentoDescricao`.
 */
export function campo(obj: unknown, ...nomes: string[]): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const r = obj as Registro;
  for (const nome of nomes) {
    const chave =
      nome in r ? nome : Object.keys(r).find((k) => k.toLowerCase() === nome.toLowerCase());
    if (chave === undefined) continue;
    // Chave presente com valor nulo não encerra a busca. Um registro
    // com `DepartamentoDescricao: null` e `Departamento: {...}` existe,
    // e antes daqui parava no primeiro e devolvia nulo — o nome da obra
    // sumia mesmo estando no payload, uma linha abaixo.
    const valor = r[chave];
    if (valor !== null && valor !== undefined) return valor;
  }
  return undefined;
}

/**
 * Coerção para texto que NUNCA inventa texto.
 *
 * A versão anterior era `String(v)`. Foi ela que gravou "[object
 * Object]" no cargo e no setor dos 19 da carga inicial, e no nome das
 * obras e cargos criados junto: quando a Secullum entrega
 * `Departamento` como objeto em vez de string, `String({...})` devolve
 * algo que PARECE dado — passa por "não vazio", passa por `.trim()`,
 * passa pelo `NOT NULL` do banco — e só aparece quando alguém abre a
 * ficha meses depois.
 *
 * Objeto e array agora devolvem vazio, que é o contrato declarado no
 * cabeçalho deste arquivo: quem chama cai no caminho alternativo, ou
 * registra o campo como ausente. Vazio é recuperável; lixo com cara de
 * dado, não. Para o objeto que legitimamente carrega a descrição
 * existe `descricao()`.
 */
export function texto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString();
  return "";
}

/**
 * O NOME de um item, venha ele como texto solto ou dentro de um objeto.
 *
 * `DepartamentoDescricao` e `FuncaoDescricao` são string no funcionário
 * — mas nem todo registro os traz, e aí o que sobra é `Departamento` /
 * `Funcao` como `{ Id, Descricao }`. Esta função grava o campo, nunca o
 * objeto.
 */
export function descricao(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
    return texto(campo(v, "Descricao", "descricao", "Nome", "nome")).trim();
  }
  return texto(v).trim();
}

export function inteiro(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * ISO ou "2026-08-27T00:00:00" viram "2026-08-27". Vazio vira null.
 *
 * O recorte por regex vem ANTES do `new Date()` de propósito: com
 * "2026-08-27T00:00:00" sem fuso, o construtor interpreta como horário
 * local e o `toISOString()` seguinte pode voltar um dia — a admissão
 * de 1º de setembro viraria 31 de agosto no cadastro.
 */
export function data(v: unknown): string | null {
  const t = texto(v).trim();
  if (!t) return null;
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** "07:58", "07:58:00" ou ISO com hora viram "07:58:00". */
export function hora(v: unknown): string | null {
  const t = texto(v).trim();
  if (!t) return null;
  const hm = t.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!hm) return null;
  const h = hm[1].padStart(2, "0");
  return `${h}:${hm[2]}:${hm[3] ?? "00"}`;
}

/**
 * "08:48" vira 528 minutos. Aceita negativo ("-01:30"), que aparece em
 * coluna de saldo. Número puro é tratado como minutos.
 */
export function paraMinutos(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  const t = texto(v).trim();
  if (!t) return 0;
  const m = t.match(/^(-)?(\d{1,4}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const sinal = m[1] ? -1 : 1;
    return sinal * (Number(m[2]) * 60 + Number(m[3]));
  }
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/**
 * A chave de comparação de NOME entre os dois sistemas.
 *
 * Departamento e função chegam da Secullum como texto livre, digitado
 * por alguém no Ponto Web; do lado do Portal vêm de outro cadastro,
 * digitado por outra pessoa. "Dexco - HH", "DEXCO-HH" e "dexco  hh"
 * são a mesma obra e precisam casar, senão a carga cria três obras
 * onde existe uma.
 *
 * Tira acento, caixa e pontuação, e colapsa espaço. Não tenta ser
 * esperto além disso: nome parecido mas não igual continua sendo obra
 * diferente, e a tela mostra o que vai criar antes de criar.
 */
export function chaveDeNome(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}
