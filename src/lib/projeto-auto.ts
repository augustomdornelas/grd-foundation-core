// ============================================================
// Auto-criação de projeto a partir de orçamento aprovado
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { upperizePayload } from "@/lib/utils";

export type OrcamentoResumo = {
  id: string;
  obra?: string | null;
  cliente?: string | null;
  valor?: number | null;
  responsavel?: string | null;
};

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
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
    const id = uid("P");
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
