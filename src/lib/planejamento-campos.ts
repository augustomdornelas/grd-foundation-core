// ============================================================
// Campos de planejamento — modelo compartilhado
// ------------------------------------------------------------
// Os mesmos sete valores são preenchidos em dois lugares: no
// orçamento (onde o valor é montado) e direto no projeto (para
// projetos antigos ou criados sem orçamento). O estado de
// formulário, o parsing e as contas do preview moram aqui para
// que as duas telas não divirjam.
//
// A base dos percentuais é `custos`, e não o valor do orçamento:
// é sobre ela que planejamento-execucao.ts calcula a coluna
// Planejado (BASE_PERCENTUAIS = "custos"). Se aquele arquivo
// mudar de base, o preview daqui precisa acompanhar.
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
    custos: "", moPct: "", mtPct: "", terceirizadoPct: "",
    administrativoPct: "", impostoPct: "", lucroPct: "",
  };
}

/**
 * number -> texto; zero vira campo vazio para não poluir a tela.
 *
 * Percentual não ganha casa decimal à toa: 10 sai como "10", não
 * "10,00" — por isso os centavos redondos são cortados.
 */
function numParaTexto(v: number | null | undefined): string {
  return paraTexto(v, 2).replace(/,00$/, "");
}

export function valoresParaForm(v: Partial<PlanejamentoValores> | null | undefined): PlanejamentoForm {
  if (!v) return planejamentoFormVazio();
  return {
    custos: numParaTexto(v.custos),
    moPct: numParaTexto(v.moPct),
    mtPct: numParaTexto(v.mtPct),
    terceirizadoPct: numParaTexto(v.terceirizadoPct),
    administrativoPct: numParaTexto(v.administrativoPct),
    impostoPct: numParaTexto(v.impostoPct),
    lucroPct: numParaTexto(v.lucroPct),
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

/** Soma dos seis percentuais — acima de 100 a tela avisa (sem bloquear). */
export function somaPercentuais(f: PlanejamentoForm): number {
  return CAMPOS_PCT.reduce((a, c) => a + parseNumeroBR(f[c.chave]), 0);
}

/** Planejamento em branco — usado por telas que não preenchem esses campos. */
export function planejamentoZerado(): PlanejamentoValores {
  return {
    custos: 0, moPct: 0, mtPct: 0, terceirizadoPct: 0,
    administrativoPct: 0, impostoPct: 0, lucroPct: 0,
  };
}

/** true quando nada foi preenchido — usado para não sobrescrever à toa. */
export function planejamentoVazio(v: PlanejamentoValores): boolean {
  return Object.values(v).every(n => !n);
}

/**
 * Custos planejados sugeridos: valor do contrato menos lucro e imposto.
 * É a equivalência que planejamento-execucao.ts assume entre a coluna
 * planejado_custos e o "custo previsto".
 */
export function custosSugeridos(valorBase: number, lucroPct: number, impostoPct: number): number {
  if (!valorBase) return 0;
  const restante = 100 - lucroPct - impostoPct;
  if (restante <= 0) return 0;
  return Math.round(valorBase * (restante / 100) * 100) / 100;
}

/** Compara dois planejamentos para decidir se vale perguntar sobre sobrescrever. */
export function mesmoPlanejamento(a: PlanejamentoValores, b: PlanejamentoValores): boolean {
  return (Object.keys(a) as (keyof PlanejamentoValores)[])
    .every(k => Math.abs(a[k] - b[k]) < 0.005);
}
