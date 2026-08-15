// ============================================================
// Auto-criação de projeto a partir de orçamento aprovado
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { upperizePayload } from "@/lib/utils";
import { planejamentoVazio, type PlanejamentoValores } from "@/lib/planejamento-campos";

export type OrcamentoResumo = {
  id: string;
  obra?: string | null;
  cliente?: string | null;
  valor?: number | null;
  responsavel?: string | null;
  planejamento?: PlanejamentoValores | null;
};

/** Planejamento no formato das colunas de `projetos`. */
function linhasPlanejamento(p: PlanejamentoValores) {
  return {
    planejado_custos: p.custos,
    planejado_mo_pct: p.moPct,
    planejado_mt_pct: p.mtPct,
    planejado_terceirizado_pct: p.terceirizadoPct,
    planejado_administrativo_pct: p.administrativoPct,
    planejado_imposto_pct: p.impostoPct,
    planejado_lucro_pct: p.lucroPct,
  };
}

/** Projeto já criado a partir deste orçamento, se houver. */
export async function projetoDoOrcamento(
  orcamentoId: string,
): Promise<{ id: string; planejamento: PlanejamentoValores } | null> {
  const { data, error } = await supabase
    .from("projetos")
    .select("id, planejado_custos, planejado_mo_pct, planejado_mt_pct, planejado_terceirizado_pct, planejado_administrativo_pct, planejado_imposto_pct, planejado_lucro_pct")
    .eq("orcamento_id", orcamentoId)
    .maybeSingle();
  if (error || !data) return null;
  const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  return {
    id: data.id as string,
    planejamento: {
      custos: n(data.planejado_custos),
      moPct: n(data.planejado_mo_pct),
      mtPct: n(data.planejado_mt_pct),
      terceirizadoPct: n(data.planejado_terceirizado_pct),
      administrativoPct: n(data.planejado_administrativo_pct),
      impostoPct: n(data.planejado_imposto_pct),
      lucroPct: n(data.planejado_lucro_pct),
    },
  };
}

/** Grava o planejamento num projeto já existente (sobrescrita confirmada). */
export async function aplicarPlanejamentoNoProjeto(
  projetoId: string,
  planejamento: PlanejamentoValores,
): Promise<boolean> {
  const { error } = await supabase
    .from("projetos")
    .update(linhasPlanejamento(planejamento))
    .eq("id", projetoId);
  if (error) {
    console.error("[projeto-auto] planejamento:", error);
    return false;
  }
  return true;
}

/**
 * Garante que exista um projeto vinculado ao orçamento aprovado.
 * Retorna o id do projeto (existente ou recém criado) ou null em erro.
 */
export async function garantirProjetoDeOrcamento(orc: OrcamentoResumo): Promise<string | null> {
  try {
    // 1. Checa se já existe
    const { data: existente, error: eSel } = await supabase
      .from("projetos")
      .select("id")
      .eq("orcamento_id", orc.id)
      .maybeSingle();
    if (eSel) {
      console.error("[projeto-auto] select:", eSel);
      return null;
    }
    if (existente?.id) return existente.id as string;

    // 2. Busca cliente_id pelo nome
    let clienteId: string | null = null;
    const nomeCli = (orc.cliente ?? "").trim();
    if (nomeCli) {
      const { data: cli } = await supabase
        .from("clientes")
        .select("id")
        .ilike("nome", nomeCli)
        .limit(1)
        .maybeSingle();
      clienteId = (cli?.id as string) ?? null;
    }

    // 3. Insere
    const id = crypto.randomUUID();
    const payload = upperizePayload({
      id,
      nome: orc.obra ?? "",
      cliente: orc.cliente ?? "",
      cliente_id: clienteId,
      orcamento_id: orc.id,
      valor_contrato: Number(orc.valor ?? 0) || 0,
      orcado: Number(orc.valor ?? 0) || 0,
      responsavel: orc.responsavel ?? "",
      status: "PLANEJAMENTO",
      progresso: 0,
      // Planejamento montado no orçamento segue junto para o projeto; sem
      // isso a aba Planejamento × Execução nasce zerada.
      ...(orc.planejamento && !planejamentoVazio(orc.planejamento)
        ? linhasPlanejamento(orc.planejamento)
        : {}),
    });
    const { error: eIns } = await supabase.from("projetos").insert(payload);
    if (eIns) {
      console.error("[projeto-auto] insert:", eIns);
      return null;
    }
    return id;
  } catch (err) {
    console.error("[projeto-auto] erro:", err);
    return null;
  }
}
