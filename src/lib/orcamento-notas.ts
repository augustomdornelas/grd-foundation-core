// ============================================================
// Notas do orçamento — histórico e contador de inatividade
// ------------------------------------------------------------
// A tabela `orcamento_notas` já existia e guardava só texto livre.
// Agora ela também registra a transição de status (status_anterior /
// status_novo), gravada na MESMA transação da mudança pela função
// public.orcamento_mudar_status.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import type { OrcStatus } from "@/lib/orcamentos-store";

export type OrcamentoNota = {
  id: string;
  orcamentoId: string;
  texto: string;
  /** "STATUS" quando acompanhou uma mudança; "NOTA" quando é avulsa. */
  tipo: string;
  statusAnterior: string | null;
  statusNovo: string | null;
  autorId: string | null;
  autorNome: string;
  criadaEm: string;
};

type NotaRow = {
  id: string;
  orcamento_id: string;
  texto: string | null;
  tipo: string | null;
  status_anterior: string | null;
  status_novo: string | null;
  autor_id: string | null;
  autor_nome: string | null;
  autor: string | null;
  created_at: string;
};

function fromRow(r: NotaRow): OrcamentoNota {
  return {
    id: r.id,
    orcamentoId: r.orcamento_id,
    texto: r.texto ?? "",
    tipo: r.tipo ?? "NOTA",
    statusAnterior: r.status_anterior,
    statusNovo: r.status_novo,
    autorId: r.autor_id,
    // `autor` é a coluna antiga, mantida para as notas já lançadas.
    autorNome: r.autor_nome || r.autor || "",
    criadaEm: r.created_at,
  };
}

/** Mínimo de 5 caracteres sem contar espaços — mesma regra do banco. */
export const NOTA_MIN_CARACTERES = 5;

export function notaValida(texto: string): boolean {
  return texto.replace(/\s/g, "").length >= NOTA_MIN_CARACTERES;
}

export async function listarNotas(orcamentoId: string): Promise<{ notas: OrcamentoNota[]; error: { message?: string } | null }> {
  const { data, error } = await supabase
    .from("orcamento_notas")
    .select("*")
    .eq("orcamento_id", orcamentoId)
    .order("created_at", { ascending: false });
  if (error) return { notas: [], error };
  return { notas: (data as NotaRow[] ?? []).map(fromRow), error: null };
}

/** Nota sem mudança de status (registro de contato, follow-up). */
export async function inserirNotaAvulsa(
  orcamentoId: string,
  texto: string,
  autor: { id: string; nome: string },
): Promise<{ nota: OrcamentoNota | null; error: { message?: string } | null }> {
  const { data, error } = await supabase
    .from("orcamento_notas")
    .insert({
      orcamento_id: orcamentoId,
      texto: texto.trim(),
      tipo: "NOTA",
      autor_id: autor.id || null,
      autor_nome: autor.nome,
      autor: autor.nome,
    })
    .select()
    .single();
  if (error) return { nota: null, error };
  return { nota: fromRow(data as NotaRow), error: null };
}

/**
 * Correção do próprio texto. A RLS só deixa o autor editar, e só na
 * primeira hora — então um erro do servidor aqui costuma ser "passou
 * do prazo", não falha de rede.
 */
export async function editarNota(
  notaId: string,
  texto: string,
): Promise<{ nota: OrcamentoNota | null; error: { message?: string } | null }> {
  const { data, error } = await supabase
    .from("orcamento_notas")
    .update({ texto: texto.trim() })
    .eq("id", notaId)
    .select()
    .maybeSingle();
  if (error) return { nota: null, error };
  if (!data) {
    return { nota: null, error: { message: "Esta nota não pode mais ser editada (só o autor, na primeira hora)." } };
  }
  return { nota: fromRow(data as NotaRow), error: null };
}

export function podeEditar(nota: OrcamentoNota, usuarioId: string): boolean {
  if (!usuarioId || nota.autorId !== usuarioId) return false;
  const umaHora = 60 * 60 * 1000;
  return Date.now() - new Date(nota.criadaEm).getTime() < umaHora;
}


// -----------------------------------------------------------
// Contador de dias sem nota
// -----------------------------------------------------------
/**
 * O contador só aparece nestes dois status. Em aprovado, recusado,
 * cancelado e levantamento não há nada a cobrar, então o espaço fica
 * limpo — sem rótulo e sem "0 dias".
 */
export const STATUS_COM_CONTADOR: OrcStatus[] = ["EM NEGOCIAÇÃO", "AGUARDANDO RETORNO"];

export function statusTemContador(status: string): boolean {
  return (STATUS_COM_CONTADOR as string[]).includes(status);
}

export type FaixaDias = "neutro" | "atencao" | "critico";

/** Faixas confirmadas com o time: até 7 neutro, 8–15 âmbar, acima de 15 vermelho. */
export function faixaDeDias(dias: number): FaixaDias {
  if (dias > 15) return "critico";
  if (dias > 7) return "atencao";
  return "neutro";
}

/** Dias corridos entre a data informada e hoje. */
export function diasCorridosDesde(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((hoje.getTime() - d.getTime()) / 86_400_000));
}

export type ContadorInatividade = {
  dias: number;
  /** true quando o orçamento nunca teve nota e a contagem partiu da criação. */
  semNota: boolean;
  faixa: FaixaDias;
  label: string;
};

/**
 * Contagem a partir da última nota — avulsa ou de status, tanto faz.
 * Sem nenhuma nota, conta desde a criação do orçamento e o rótulo diz
 * isso explicitamente ("18 dias sem nota").
 */
export function contadorInatividade(o: { status: string; ultimaNotaEm: string | null; criadoEm: string }): ContadorInatividade | null {
  if (!statusTemContador(o.status)) return null;
  const semNota = !o.ultimaNotaEm;
  const dias = diasCorridosDesde(o.ultimaNotaEm ?? o.criadoEm);
  if (dias === null) return null;
  const plural = dias === 1 ? "dia" : "dias";
  return {
    dias,
    semNota,
    faixa: faixaDeDias(dias),
    label: semNota ? `${dias} ${plural} sem nota` : `${dias} ${plural} sem atualização`,
  };
}
