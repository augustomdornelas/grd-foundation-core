// ============================================================
// Campos de planejamento — modelo compartilhado
// ------------------------------------------------------------
// Os mesmos sete valores são preenchidos em dois lugares: no
// orçamento (onde o valor é montado) e direto no projeto (para
// projetos antigos ou criados sem orçamento). O estado de
// formulário, o parsing e as contas do preview moram aqui para
// que as duas telas não divirjam.
//
// A base dos percentuais é o CONTRATO (no orçamento, o valor do
// orçamento): os seis percentuais somam 100% e incluem imposto e
// lucro, então dividem o contrato inteiro. É a mesma base de
// planejamento-execucao.ts (BASE_PERCENTUAIS = "contrato"); se aquele
// arquivo mudar de base, o preview daqui precisa acompanhar.
//
// `custos` (coluna planejado_custos) continua no modelo só para ir e
// voltar do banco sem se perder: não aparece mais na tela nem entra
// em conta nenhuma.
// ============================================================
import { paraNumero, paraTexto } from "@/lib/formato";

/** Os sete campos como number, prontos para gravar. */
export type PlanejamentoValores = {
  custos: number;
  moPct: number;
  mtPct: number;
  terceirizadoPct: number;
  administrativoPct: number;
  impostoPct: number;
  lucroPct: number;
};

/** Os mesmos campos como texto, enquanto a pessoa digita. */
export type PlanejamentoForm = Record<keyof PlanejamentoValores, string>;

/** Percentuais na ordem em que aparecem na tela. */
export const CAMPOS_PCT: { chave: keyof PlanejamentoValores; rotulo: string }[] = [
  { chave: "moPct", rotulo: "Mão de obra" },
  { chave: "mtPct", rotulo: "Material" },
  { chave: "terceirizadoPct", rotulo: "Terceirizado" },
  { chave: "administrativoPct", rotulo: "Administrativo" },
  { chave: "impostoPct", rotulo: "Impostos" },
  { chave: "lucroPct", rotulo: "Lucro" },
];

/**
 * Lê um número digitado aceitando vírgula ou ponto como decimal.
 *
 * A regra em si mora em @/lib/formato, junto com o resto da formatação
 * do site. Aqui sobra só o contrato deste módulo: devolver 0 (e não
 * null) para campo vazio, e recusar negativo — custo e percentual de
 * planejamento não têm sinal.
 */
export function parseNumeroBR(texto: string): number {
  const n = paraNumero(texto);
  return n !== null && n >= 0 ? n : 0;
}

export function planejamentoFormVazio(): PlanejamentoForm {
  return {
    custos: "",
    moPct: "",
    mtPct: "",
    terceirizadoPct: "",
    administrativoPct: "",
    impostoPct: "",
    lucroPct: "",
  };
}

/**
 * Valor em R$ -> texto; zero vira campo vazio para não poluir a tela.
 *
 * Mantém SEMPRE a vírgula e os centavos: 195000 -> "195.000,00". Sem a
 * vírgula, "195.000" volta como 195 — paraNumero lê ponto sozinho como
 * decimal ("12.5" = 12,5). Era esse o bug que gravava o custo 1.000×
 * menor.
 */
function dinheiroParaTexto(v: number | null | undefined): string {
  return paraTexto(v, 2);
}

/**
 * Percentual -> texto sem casa decimal à toa: 10 sai "10", 23,5 sai
 * "23,5". Os ",00" só são cortados quando não há ponto de milhar — pela
 * mesma razão acima, "1.000" voltaria como 1.
 */
export function percentualParaTexto(v: number | null | undefined): string {
  const t = paraTexto(v, 2);
  return t.includes(".") ? t : t.replace(/,00$/, "").replace(/(,\d)0$/, "$1");
}

export function valoresParaForm(
  v: Partial<PlanejamentoValores> | null | undefined,
): PlanejamentoForm {
  if (!v) return planejamentoFormVazio();
  return {
    custos: dinheiroParaTexto(v.custos),
    moPct: percentualParaTexto(v.moPct),
    mtPct: percentualParaTexto(v.mtPct),
    terceirizadoPct: percentualParaTexto(v.terceirizadoPct),
    administrativoPct: percentualParaTexto(v.administrativoPct),
    impostoPct: percentualParaTexto(v.impostoPct),
    lucroPct: percentualParaTexto(v.lucroPct),
  };
}

export function formParaValores(f: PlanejamentoForm): PlanejamentoValores {
  return {
    custos: parseNumeroBR(f.custos),
    moPct: parseNumeroBR(f.moPct),
    mtPct: parseNumeroBR(f.mtPct),
    terceirizadoPct: parseNumeroBR(f.terceirizadoPct),
    administrativoPct: parseNumeroBR(f.administrativoPct),
    impostoPct: parseNumeroBR(f.impostoPct),
    lucroPct: parseNumeroBR(f.lucroPct),
  };
}

/** Soma dos seis percentuais — fora de 100 a tela avisa (sem bloquear). */
export function somaPercentuais(f: PlanejamentoForm): number {
  return CAMPOS_PCT.reduce((a, c) => a + parseNumeroBR(f[c.chave]), 0);
}

/** Planejamento em branco — usado por telas que não preenchem esses campos. */
export function planejamentoZerado(): PlanejamentoValores {
  return {
    custos: 0,
    moPct: 0,
    mtPct: 0,
    terceirizadoPct: 0,
    administrativoPct: 0,
    impostoPct: 0,
    lucroPct: 0,
  };
}

/** true quando nada foi preenchido — usado para não sobrescrever à toa. */
export function planejamentoVazio(v: PlanejamentoValores): boolean {
  return Object.values(v).every((n) => !n);
}

/** Compara dois planejamentos para decidir se vale perguntar sobre sobrescrever. */
export function mesmoPlanejamento(a: PlanejamentoValores, b: PlanejamentoValores): boolean {
  return (Object.keys(a) as (keyof PlanejamentoValores)[]).every(
    (k) => Math.abs(a[k] - b[k]) < 0.005,
  );
}
