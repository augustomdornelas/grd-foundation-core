// ============================================================
// Modelo de cálculo: Planejamento × Execução
// ------------------------------------------------------------
// TODAS as fórmulas do quadro moram neste arquivo, isoladas da tela.
//
// PLANEJADO: os seis percentuais do projeto somam 100% e incluem
// imposto e lucro, então incidem sobre o CONTRATO. Cada categoria de
// custo (MO, Material, Terceirizado, Administrativo, Impostos) é
// contrato × %; o lucro previsto é o que sobra: contrato − custos
// planejados.
//
// EXECUTADO: vem dos CUSTOS LANÇADOS e das NOTAS FISCAIS do projeto —
// os mesmos que a barra "Financeiro realizado" do topo soma. Os
// lançamentos do livro-caixa (`lancamentos`) ficam de fora: não há como
// garantir que não repetem uma nota ou um custo (nota guarda o
// fornecedor como texto e o número é opcional; custo não aponta para
// lançamento nenhum). Somar os dois contaria a mesma despesa duas vezes.
// ============================================================
import type { Custo, NotaFiscal, Projeto } from "@/lib/projetos-store";

// ------------------------------------------------------------
// Base dos percentuais planejados.
//   "contrato"       → percentuais sobre o valor do contrato (ATIVO: os
//                      percentuais somam 100% com imposto e lucro).
//   "custo_previsto" → contrato − lucro − imposto.
//   "custos"         → a coluna planejado_custos (modelo antigo; somava
//                      o custo duas vezes no total — não use).
// ------------------------------------------------------------
const BASE_PERCENTUAIS: "contrato" | "custos" | "custo_previsto" = "contrato";

/** Linhas do quadro, na ordem da tela. */
export const GRUPOS_QUADRO = ["MO", "MT", "ST", "ADM", "TX"] as const;
export type GrupoQuadro = (typeof GRUPOS_QUADRO)[number];

const ROTULOS: Record<GrupoQuadro, string> = {
  MO: "Mão de obra",
  MT: "Material",
  ST: "Terceirizado",
  ADM: "Administrativo",
  TX: "Impostos",
};

export type LinhaQuadro = {
  grupo: GrupoQuadro | "OUTROS";
  rotulo: string;
  planejado: number;
  executado: number;
  /** planejado − executado (positivo = ainda há orçamento na categoria) */
  saldo: number;
};

export type QuadroPlanejamentoExecucao = {
  /** Base usada nos percentuais. */
  base: number;
  baseRotulo: string;
  contrato: number;
  /** Uma linha por categoria de custo, mais "Outros" se houver executado sem categoria. */
  linhas: LinhaQuadro[];
  /** Soma do planejado das categorias de custo (sem o lucro). */
  totalCustosPlanejado: number;
  totalExecutado: number;
  /** Lucro previsto = contrato − custos planejados. */
  lucroPrevisto: number;
  /** Lucro previsto em % do contrato. */
  lucroPrevistoPct: number;
  /** Soma dos seis percentuais — o esperado é 100. */
  somaPercentuais: number;
  saldoMaoDeObra: number;
  saldoMaterial: number;
  /** Total executado em % do contrato. */
  gastoPct: number;
};

/**
 * Toda entrada passa por aqui antes de virar conta. Colunas `numeric` do
 * Postgres podem chegar como string e null vira 0.
 */
const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const pct = (base: number, percentual: number) => base * (percentual / 100);

/**
 * Sem acento e em maiúsculas: a categoria é gravada em caixa alta pelo
 * upperizePayload ("MÃO DE OBRA", "SERVIÇO"), mas o tipo no Portal é
 * "Mão de obra", "Serviço".
 */
const chave = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").trim().toUpperCase();

/**
 * Categoria do custo -> linha do quadro.
 *   Mão de obra       -> Mão de obra
 *   Insumo            -> Material (junto com as notas fiscais)
 *   Serviço, Locação  -> Terceirizado
 *   Outro (e o resto) -> Outros
 */
export function grupoDoCusto(categoria: string): GrupoQuadro | "OUTROS" {
  switch (chave(categoria)) {
    case "MAO DE OBRA":
      return "MO";
    case "INSUMO":
      return "MT";
    case "SERVICO":
    case "LOCACAO":
      return "ST";
    default:
      return "OUTROS";
  }
}

/**
 * Monta o quadro comparativo de um projeto.
 * @param p projeto com as colunas de planejamento já mapeadas
 * @param custos custos lançados DESTE projeto
 * @param notas notas fiscais DESTE projeto (entram todas como Material)
 */
export function montarQuadro(
  p: Projeto,
  custos: Pick<Custo, "categoria" | "valor">[],
  notas: Pick<NotaFiscal, "valor">[],
): QuadroPlanejamentoExecucao {
  const percentuais = {
    MO: n(p.planejadoMoPct),
    MT: n(p.planejadoMtPct),
    ST: n(p.planejadoTerceirizadoPct),
    ADM: n(p.planejadoAdministrativoPct),
    TX: n(p.planejadoImpostoPct),
  };
  const lucroPct = n(p.planejadoLucroPct);

  // O contrato é a referência do quadro. Projetos que ficaram sem
  // valor_contrato caem no orçado, senão o quadro inteiro zera.
  const valorContrato = n(p.valorContrato);
  const contrato = valorContrato > 0 ? valorContrato : n(p.orcado);
  const custoPrevisto = Math.max(
    0,
    contrato - pct(contrato, lucroPct) - pct(contrato, percentuais.TX),
  );
  const base =
    BASE_PERCENTUAIS === "contrato"
      ? contrato
      : BASE_PERCENTUAIS === "custo_previsto"
        ? custoPrevisto
        : n(p.planejadoCustos);
  const baseRotulo =
    BASE_PERCENTUAIS === "contrato"
      ? "contrato"
      : BASE_PERCENTUAIS === "custo_previsto"
        ? "custo previsto (contrato − lucro − imposto)"
        : "custos planejados";

  // --- Executado: custos + notas --------------------------------
  const executado: Record<GrupoQuadro | "OUTROS", number> = {
    MO: 0,
    MT: 0,
    ST: 0,
    ADM: 0,
    TX: 0,
    OUTROS: 0,
  };
  for (const c of custos) executado[grupoDoCusto(c.categoria)] += n(c.valor);
  for (const nf of notas) executado.MT += n(nf.valor);

  // --- Linhas ----------------------------------------------------
  const linhas: LinhaQuadro[] = GRUPOS_QUADRO.map((g) => {
    const planejado = pct(base, percentuais[g]);
    return {
      grupo: g,
      rotulo: ROTULOS[g],
      planejado,
      executado: executado[g],
      saldo: planejado - executado[g],
    };
  });
  // "Outros" só aparece quando há gasto sem categoria própria; não tem
  // planejado, então o saldo é negativo por definição.
  if (Math.abs(executado.OUTROS) > 0.005) {
    linhas.push({
      grupo: "OUTROS",
      rotulo: "Outros",
      planejado: 0,
      executado: executado.OUTROS,
      saldo: -executado.OUTROS,
    });
  }

  const totalCustosPlanejado = linhas.reduce((a, l) => a + l.planejado, 0);
  const totalExecutado = linhas.reduce((a, l) => a + l.executado, 0);
  const lucroPrevisto = contrato - totalCustosPlanejado;
  const linha = (g: GrupoQuadro) => linhas.find((l) => l.grupo === g)!;

  return {
    base,
    baseRotulo,
    contrato,
    linhas,
    totalCustosPlanejado,
    totalExecutado,
    lucroPrevisto,
    lucroPrevistoPct: contrato > 0 ? (lucroPrevisto / contrato) * 100 : 0,
    somaPercentuais: Object.values(percentuais).reduce((a, v) => a + v, 0) + lucroPct,
    saldoMaoDeObra: linha("MO").saldo,
    saldoMaterial: linha("MT").saldo,
    gastoPct: contrato > 0 ? (totalExecutado / contrato) * 100 : 0,
  };
}
