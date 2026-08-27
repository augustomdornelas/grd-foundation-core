// ============================================================
// Contador de dias sem nota
// ------------------------------------------------------------
// Requisito 2: aparece SÓ em EM NEGOCIAÇÃO e AGUARDANDO RETORNO.
// Em qualquer outro status devolve null — nem "0 dias", nem rótulo
// vazio. O espaço fica limpo.
// ============================================================
import { contadorInatividade, type FaixaDias } from "@/lib/orcamento-notas";

const CLASSE_POR_FAIXA: Record<FaixaDias, string> = {
  neutro: "border-border bg-muted text-muted-foreground",
  atencao: "border-amber-300 bg-amber-100 text-amber-800",
  critico: "border-red-300 bg-red-100 text-red-700",
};

export function InatividadeBadge({ orcamento }: {
  orcamento: { status: string; ultimaNotaEm: string | null; criadoEm: string };
}) {
  const c = contadorInatividade(orcamento);
  if (!c) return null;
  return (
    <span
      className={`inline-flex w-fit items-center rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${CLASSE_POR_FAIXA[c.faixa]}`}
      title={c.semNota ? "Este orçamento ainda não tem nenhuma nota; a contagem parte da data de criação." : "Dias corridos desde a última nota."}
    >
      {c.label}
    </span>
  );
}
