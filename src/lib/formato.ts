// ============================================================
// Formatação de números — padrão pt-BR
// ------------------------------------------------------------
// Fonte única para todo o site. Antes cada tela tinha o seu
// `brl` local e eles não concordavam entre si: o de
// mock-data.ts usava maximumFractionDigits: 0, então o mesmo
// valor aparecia sem centavos no card do projeto e com centavos
// na tabela do comercial.
//
// Regras:
//  - dinheiro e medidas (quantidade, metragem): SEMPRE 2 casas;
//  - percentuais: até 1 casa, sem zero à toa (12% e não 12,0%);
//  - contagens: inteiro, sem casa decimal nenhuma.
// ============================================================

const LOCALE = "pt-BR";

/** O que aparece no lugar de um número que não dá para mostrar. */
export const VAZIO = "—";

/**
 * Rede de segurança: null/undefined/NaN/Infinity chegando de uma
 * conta com dado ruim não pode virar "NaN" na tela nem quebrar o
 * render. Colunas `numeric` do Postgres também chegam como string.
 */
function finito(n: unknown): number | null {
  // null e "" precisam sair antes do Number(): os dois viram 0, e um
  // valor ausente mostrado como "R$ 0,00" é pior que um travessão —
  // parece um número conferido, quando na verdade não veio nada.
  if (n === null || n === undefined || n === "") return null;
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : null;
}

/** Dinheiro: 1234.5 → "R$ 1.234,50". Sempre com centavos. */
export function brl(n: number | string | null | undefined): string {
  const v = finito(n);
  if (v === null) return VAZIO;
  return v.toLocaleString(LOCALE, {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Número sem símbolo: 1234.5 → "1.234,50".
 * Usado em quantidade e metragem, que seguem a mesma regra do dinheiro.
 *
 * `casasMin` existe para campos onde a casa decimal só aparece quando
 * é significativa (percentuais); por padrão acompanha `casas`.
 */
export function num(
  n: number | string | null | undefined,
  casas = 2,
  casasMin = casas,
): string {
  const v = finito(n);
  if (v === null) return VAZIO;
  return v.toLocaleString(LOCALE, {
    minimumFractionDigits: Math.min(casasMin, casas),
    maximumFractionDigits: casas,
  });
}

/**
 * Percentual: 12.5 → "12,5%", 12 → "12%".
 * Recebe o número já em pontos percentuais (12.5 e não 0.125).
 */
export function pct(n: number | string | null | undefined, casas = 1): string {
  const v = finito(n);
  if (v === null) return VAZIO;
  return `${num(v, casas, 0)}%`;
}

/** Contagem: 1234 → "1.234". Nunca ganha casa decimal. */
export function inteiro(n: number | string | null | undefined): string {
  return num(n, 0, 0);
}

/**
 * Forma curta para eixo de gráfico: 1250000 → "1,3 mi", 45000 → "45 mil".
 * O valor cheio continua aparecendo no tooltip — no eixo ele não caberia.
 */
export function compacto(n: number | string | null | undefined, moeda = false): string {
  const v = finito(n);
  if (v === null) return VAZIO;
  const abs = Math.abs(v);
  const sinal = v < 0 ? "-" : "";
  const simbolo = moeda ? "R$ " : "";
  if (abs >= 1_000_000) return `${sinal}${simbolo}${num(abs / 1_000_000, 1, 0)} mi`;
  if (abs >= 1_000) return `${sinal}${simbolo}${num(abs / 1_000, abs >= 10_000 ? 0 : 1, 0)} mil`;
  return `${sinal}${simbolo}${num(abs, 0, 0)}`;
}

/** Atalho de `compacto` para eixos de valor em reais. */
export function brlCompacto(n: number | string | null | undefined): string {
  return compacto(n, true);
}

/**
 * Lê um número digitado em pt-BR. Devolve null quando não há nada
 * aproveitável — quem chama decide se isso é 0 ou "campo em branco".
 *
 * O ponto só é separador de milhar quando existe vírgula na string;
 * sem vírgula, "12.5" é 12,5 e não 125. É a mesma regra que já valia
 * em app.comercial.tsx e em planejamento-campos.ts, agora num lugar só.
 */
export function paraNumero(texto: string | number | null | undefined): number | null {
  if (typeof texto === "number") return Number.isFinite(texto) ? texto : null;
  if (texto === null || texto === undefined) return null;
  const limpo = String(texto).trim().replace(/\s|R\$|%/g, "");
  if (!limpo || limpo === "-") return null;
  // Dois ou mais pontos não têm ambiguidade nenhuma: número não tem duas
  // casas decimais, então em "1.234.567" todos são separador de milhar.
  const soMilhar = limpo.includes(",") || (limpo.match(/\./g)?.length ?? 0) > 1;
  const normalizado = soMilhar
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/**
 * Caminho inverso: número → texto editável ("1.234,50").
 * Zero vira string vazia porque campo de valor em branco lê melhor
 * que "0,00" — quem precisa do zero explícito digita.
 */
export function paraTexto(n: number | null | undefined, casas = 2): string {
  const v = finito(n);
  if (v === null || v === 0) return "";
  return num(v, casas);
}
