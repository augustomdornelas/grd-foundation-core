// ============================================================
// Modelo de cálculo: Planejamento × Execução (lucro por categoria)
// ------------------------------------------------------------
// TODAS as fórmulas do quadro moram neste arquivo, isoladas da tela,
// justamente porque o modelo do sistema antigo ainda precisa ser
// conferido. Se a comparação apontar outra regra, ajuste aqui — a
// aba não precisa mudar.
//
// Os três pontos em aberto estão marcados com "AJUSTE:" abaixo.
// ============================================================
import type { Projeto } from "@/lib/projetos-store";
import type { ExecucaoProjeto } from "@/lib/lancamentos-store";

// ------------------------------------------------------------
// AJUSTE 1 — base dos percentuais planejados.
// Hoje os percentuais (planejado_*_pct) são aplicados sobre o VALOR
// DO CONTRATO. Se o sistema antigo aplicava sobre o custo total
// previsto (planejado_custos), troque para "custos".
// ------------------------------------------------------------
const BASE_PERCENTUAIS: "contrato" | "custos" = "custos";

// ------------------------------------------------------------
// AJUSTE 2 — natureza de planejado_custos.
// A coluna não termina em _pct, então é tratada como valor em R$.
// Se na verdade for percentual do contrato, mude para true.
// ------------------------------------------------------------
const CUSTOS_PLANEJADO_EH_PERCENTUAL = false;

// ------------------------------------------------------------
// AJUSTE 3 — lucro total.
// Fórmula pedida: contrato − total executado − impostos executados.
// Atenção: "total executado" já é a soma de TODAS as saídas, e os
// impostos (grupo TX) estão dentro dela — então esta fórmula desconta
// imposto duas vezes. Mantida como especificada; para descontar uma
// única vez, mude para false.
// ------------------------------------------------------------
const LUCRO_TOTAL_DESCONTA_IMPOSTO_DUAS_VEZES: boolean = false;

/** Grupos de `categoria_grupo` que ganham linha própria no quadro. */
export const GRUPOS_QUADRO = ["MO", "MT", "ST", "TX", "CP"] as const;
export type GrupoQuadro = (typeof GRUPOS_QUADRO)[number];

const ROTULOS: Record<GrupoQuadro, string> = {
  MO: "Mão de obra",
  MT: "Material",
  ST: "Terceirizado",
  TX: "Impostos",
  CP: "Custos",
};

export type LinhaQuadro = {
  grupo: GrupoQuadro | "OUTROS";
  rotulo: string;
  planejado: number;
  executado: number;
  /** planejado − executado (positivo = sobrou orçamento, i.e. lucro) */
  diferenca: number;
};

export type QuadroPlanejamentoExecucao = {
  /** Base usada nos percentuais (ver AJUSTE 1). */
  base: number;
  /** Como a base se chama na tela — acompanha BASE_PERCENTUAIS. */
  baseRotulo: string;
  contrato: number;
  linhas: LinhaQuadro[];
  totalPlanejado: number;
  totalExecutado: number;
  /** Saídas cujo categoria_grupo não tem linha própria (ex.: MA, vazio). */
  outrosExecutado: number;
  medido: number;
  lucroMaoDeObra: number;
  lucroMaterial: number;
  lucroTotal: number;
  /** Calculado mas ainda sem linha no quadro — o sistema antigo não detalhava. */
  administrativoPlanejado: number;
};

const pct = (base: number, percentual: number) => base * (percentual / 100);

/**
 * Monta o quadro comparativo de um projeto.
 * @param p projeto com as colunas de planejamento já mapeadas
 * @param e totais executados por grupo (tabela `lancamentos`)
 */
export function montarQuadro(p: Projeto, e: ExecucaoProjeto): QuadroPlanejamentoExecucao {
  // O contrato é a referência do quadro. Projetos migrados que ficaram
  // sem valor_contrato caem no orçado, senão o quadro inteiro zera.
  const contrato = p.valorContrato > 0 ? p.valorContrato : p.orcado;
  const base = BASE_PERCENTUAIS === "contrato" ? contrato : p.planejadoCustos;
  const baseRotulo = BASE_PERCENTUAIS === "contrato" ? "contrato" : "custos planejados";

  // --- Planejado -------------------------------------------------
  const planejado: Record<GrupoQuadro, number> = {
    MO: pct(base, p.planejadoMoPct),
    MT: pct(base, p.planejadoMtPct),
    ST: pct(base, p.planejadoTerceirizadoPct),
    TX: pct(base, p.planejadoImpostoPct),
    CP: CUSTOS_PLANEJADO_EH_PERCENTUAL ? pct(base, p.planejadoCustos) : p.planejadoCustos,
  };
  const administrativoPlanejado = pct(base, p.planejadoAdministrativoPct);

  // --- Executado (saídas de `lancamentos`) -----------------------
  const executado = (g: GrupoQuadro) => e.saidasPorGrupo[g] ?? 0;
  const somaLinhas = GRUPOS_QUADRO.reduce((a, g) => a + executado(g), 0);
  // Sobra da classificação (grupo MA, nulo, etc.): entra como "Outros"
  // para que as linhas fechem com o total executado.
  const outrosExecutado = e.totalSaidas - somaLinhas;

  const linhas: LinhaQuadro[] = GRUPOS_QUADRO.map(g => ({
    grupo: g,
    rotulo: ROTULOS[g],
    planejado: planejado[g],
    executado: executado(g),
    diferenca: planejado[g] - executado(g),
  }));
  if (Math.abs(outrosExecutado) > 0.005) {
    linhas.push({
      grupo: "OUTROS",
      rotulo: "Outros (não classificados)",
      planejado: 0,
      executado: outrosExecutado,
      diferenca: -outrosExecutado,
    });
  }

  const totalPlanejado = linhas.reduce((a, l) => a + l.planejado, 0);
  const totalExecutado = e.totalSaidas;

  // --- Lucro ------------------------------------------------------
  const lucroMaoDeObra = planejado.MO - executado("MO");
  const lucroMaterial = planejado.MT - executado("MT");
  const lucroTotal = LUCRO_TOTAL_DESCONTA_IMPOSTO_DUAS_VEZES
    ? contrato - totalExecutado - executado("TX")
    : contrato - totalExecutado;

  return {
    base,
    baseRotulo,
    contrato,
    linhas,
    totalPlanejado,
    totalExecutado,
    outrosExecutado,
    medido: e.totalEntradas,
    lucroMaoDeObra,
    lucroMaterial,
    lucroTotal,
    administrativoPlanejado,
  };
}
