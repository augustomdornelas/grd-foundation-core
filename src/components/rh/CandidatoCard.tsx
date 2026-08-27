// ============================================================
// O card do candidato no Kanban
// ------------------------------------------------------------
// Mostra o que o RH olha antes de decidir: quem é, de onde vem, que
// NRs declarou, que nota tirou nas entrevistas e há quantos dias está
// parado nesta etapa.
//
// Pretensão salarial NÃO aparece aqui, nem para quem pode vê-la: o
// card é a tela que o engenheiro da obra tem na frente o tempo todo.
// ============================================================
import { MapPin, Paperclip } from "lucide-react";
import { SemaforoEtapa } from "@/components/rh/SemaforoEtapa";
import { iniciaisDoNome, lerNrsDeclaradas, ORIGEM_LABEL } from "@/lib/rh-regras";
import type { FunilItem } from "@/lib/rh-store";

export function CandidatoCard({
  item,
  mostrarVaga = false,
  arrastavel = false,
  onAbrir,
  onDragStart,
  onDragEnd,
}: {
  item: FunilItem;
  mostrarVaga?: boolean;
  arrastavel?: boolean;
  onAbrir: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const nrs = lerNrsDeclaradas(item.nrsDeclaradas);
  const etapaEmAndamento = item.etapaTipo === "inicial" || item.etapaTipo === "intermediaria";

  return (
    <article
      draggable={arrastavel}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", item.candidaturaId);
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAbrir();
        }
      }}
      role="button"
      tabIndex={0}
      className={`w-full rounded-lg border bg-white p-3 text-left shadow-sm transition hover:border-[#F37032] hover:shadow ${
        arrastavel ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#213368] text-[11px] font-bold text-white">
          {iniciaisDoNome(item.candidatoNome)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#213368]">{item.candidatoNome}</p>
          <p className="truncate text-xs text-muted-foreground">
            {item.cargoPretendido || "Cargo não informado"}
          </p>
        </div>
        {item.score !== null && (
          <span
            title="Média dos pareceres de entrevista"
            className="shrink-0 rounded bg-[#213368]/10 px-1.5 py-0.5 text-[11px] font-bold text-[#213368]"
          >
            {item.score}
          </span>
        )}
      </div>

      {mostrarVaga && (
        <p className="mt-2 truncate text-[11px] font-medium text-[#F37032]">
          {item.vagaCodigo} · {item.vagaTitulo}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {(item.cidade || item.uf) && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {[item.cidade, item.uf].filter(Boolean).join("/")}
          </span>
        )}
        <span>{ORIGEM_LABEL[item.origem] ?? item.origem}</span>
        {item.curriculoPath && (
          <span className="inline-flex items-center gap-1" title="Tem currículo anexado">
            <Paperclip className="h-3 w-3" />
            CV
          </span>
        )}
      </div>

      {nrs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {nrs.slice(0, 4).map((nr) => (
            <span
              key={nr.nr}
              title={
                nr.validade
                  ? `Declarada com validade até ${new Date(`${nr.validade}T00:00:00`).toLocaleDateString("pt-BR")}`
                  : "Declarada sem data de validade"
              }
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                nr.valida ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700 line-through"
              }`}
            >
              {nr.nr}
            </span>
          ))}
          {nrs.length > 4 && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              +{nrs.length - 4}
            </span>
          )}
        </div>
      )}

      {etapaEmAndamento && (
        <div className="mt-2.5 border-t pt-2">
          <SemaforoEtapa dias={item.diasNaEtapa} semaforo={item.semaforo} slaDias={item.slaDias} />
        </div>
      )}
    </article>
  );
}
