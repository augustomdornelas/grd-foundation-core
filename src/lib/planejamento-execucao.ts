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
// Os percentuais (planejado_*_pct) incidem sobre o custo previsto, não
// sobre o contrato. Três leituras possíveis de "custo previsto":
//   "custos"        → a coluna planejado_custos, como veio do sistema
//                     antigo (ATIVO).
//   "custo_previsto"→ contrato − lucro − imposto, recalculado aqui.
//                     Use se planejado_custos estiver vazio/divergente.
//   "contrato"      → percentuais sobre o valor do contrato.
// As duas primeiras devem dar o mesmo número se planejado_custos foi
// gravado como contrato − lucro − imposto; se divergirem, os dados é
// que precisam ser conferidos.
// ------------------------------------------------------------
const BASE_PERCENTUAIS: "contrato" | "custos" | "custo_previsto" = "custos";

// ------------------------------------------------------------
// AJUSTE 2 — natureza de planejado_custos.
// A coluna não termina em _pct, então é tratada como valor em R$.
// Se na verdade for percentual do contrato, mude para true.
//
// ATENÇÃO (ver relatório): com BASE_PERCENTUAIS = "custos", a linha
// "Custos" recebe planejado_custos INTEIRO, que é o mesmo valor usado
// como base de MO/MT/ST/TX. Ou seja, o Total planejado conta o custo
// duas vezes (≈2× a base). Se a intenção é que "Custos" seja só o
// resíduo — o que sobra depois de MO+MT+ST+TX —, a linha CP deveria ser
// base − (MO+MT+ST+TX). Não mudei porque depende do modelo antigo.
// ------------------------------------------------------------
const CUSTOS_PLANEJADO_EH_PERCENTUAL = false;

// ------------------------------------------------------------
// AJUSTE 3 — lucro total.
// Lucro total = contrato − total executado. O grupo TX (impostos) já
// está dentro do total executado, então NÃO é descontado de novo —
// era o que a versão anterior fazia. Mude para true para voltar ao
// desconto duplo.
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

/**
 * Toda entrada passa por aqui antes de virar conta. Colunas `numeric` do
 * Postgres podem chegar como string e null vira 0 — sem isso, uma soma
 * viraria concatenação ("117000" + "150000") ou NaN na tela.
 */
const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const pct = (base: number, percentual: number) => base * (percentual / 100);

/**
 * Monta o quadro comparativo de um projeto.
 * @param p projeto com as colunas de planejamento já mapeadas
 * @param e totais executados por grupo (tabela `lancamentos`)
 */
export function montarQuadro(p: Projeto, e: ExecucaoProjeto): QuadroPlanejamentoExecucao {
  const lucroPct = n(p.planejadoLucroPct);
  const impostoPct = n(p.planejadoImpostoPct);
  const moPct = n(p.planejadoMoPct);
  const mtPct = n(p.planejadoMtPct);
  const stPct = n(p.planejadoTerceirizadoPct);
  const adminPct = n(p.planejadoAdministrativoPct);
  const custosPlanejados = n(p.planejadoCustos);

  // O contrato é a referência do quadro. Projetos migrados que ficaram
  // sem valor_contrato caem no orçado, senão o quadro inteiro zera.
  const valorContrato = n(p.valorContrato);
  const contrato = valorContrato > 0 ? valorContrato : n(p.orcado);
  // Math.max(0, …) evita base negativa se lucro+imposto passarem de 100%
  // (dado ruim na migração viraria "lucro" negativo gigante na tela).
  const custoPrevisto = Math.max(0, contrato - pct(contrato, lucroPct) - pct(contrato, impostoPct));
  const base =
    BASE_PERCENTUAIS === "contrato" ? contrato
    : BASE_PERCENTUAIS === "custo_previsto" ? custoPrevisto
    : custosPlanejados;
  const baseRotulo =
    BASE_PERCENTUAIS === "contrato" ? "contrato"
    : BASE_PERCENTUAIS === "custo_previsto" ? "custo previsto (contrato − lucro − imposto)"
    : "custos planejados";

  // --- Planejado -------------------------------------------------
  const planejado: Record<GrupoQuadro, number> = {
    MO: pct(base, moPct),
    MT: pct(base, mtPct),
    ST: pct(base, stPct),
    TX: pct(base, impostoPct),
    CP: CUSTOS_PLANEJADO_EH_PERCENTUAL ? pct(base, custosPlanejados) : custosPlanejados,
  };
  const administrativoPlanejado = pct(base, adminPct);

  // --- Executado (saídas de `lancamentos`) -----------------------
  const executado = (g: GrupoQuadro) => n(e.saidasPorGrupo[g]);
  const somaLinhas = GRUPOS_QUADRO.reduce((a, g) => a + executado(g), 0);
  // Sobra da classificação (grupo MA, nulo, etc.): entra como "Outros"
  // para que as linhas fechem com o total executado.
  const totalSaidas = n(e.totalSaidas);
  const outrosExecutado = totalSaidas - somaLinhas;

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
  const totalExecutado = totalSaidas;

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
    medido: n(e.totalEntradas),
    lucroMaoDeObra,
    lucroMaterial,
    lucroTotal,
    administrativoPlanejado,
  };
}
