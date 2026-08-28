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
    if (nome in r) return r[nome];
    const achado = Object.keys(r).find((k) => k.toLowerCase() === nome.toLowerCase());
    if (achado !== undefined) return r[achado];
  }
  return undefined;
}

export function texto(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
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
