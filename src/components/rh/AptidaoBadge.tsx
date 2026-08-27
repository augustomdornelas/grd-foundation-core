// ============================================================
// Aptidão para entrar em obra — regra 8
// ------------------------------------------------------------
// Verde ou vermelho, e no vermelho a lista exata do que falta. Um
// "inapto" sem explicação obriga alguém a caçar o motivo em três
// telas; a pendência vem pronta de rh_pendencias_alocacao().
// ============================================================
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ShieldCheck, ShieldAlert } from "lucide-react";

export function AptidaoBadge({
  apto,
  pendencias,
  compacto = false,
}: {
  apto: boolean;
  pendencias: string[];
  compacto?: boolean;
}) {
  const conteudo = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        apto ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
      }`}
    >
      {apto ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
      {compacto
        ? apto
          ? "Apto"
          : "Inapto"
        : apto
          ? "Apto para obra"
          : `Inapto (${pendencias.length})`}
    </span>
  );

  if (apto || pendencias.length === 0) return conteudo;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help">{conteudo}</span>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs">
          <p className="mb-1 font-semibold">Falta para poder entrar em obra:</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {pendencias.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Lista aberta das pendências, para quando há espaço na tela. */
export function ListaPendencias({ pendencias }: { pendencias: string[] }) {
  if (pendencias.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {pendencias.map((p) => (
        <span key={p} className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700">
          {p}
        </span>
      ))}
    </div>
  );
}
