// ============================================================
// O Kanban do funil de seleção
// ------------------------------------------------------------
// Arrastar e soltar com a API nativa do HTML5, sem biblioteca nova.
//
// Soltar o card numa coluna NÃO move nada: abre o diálogo de nota. Só
// depois que o banco confirma é que o card muda de lugar. Cancelar o
// diálogo devolve o card para onde estava — e como nada foi escrito,
// não há o que desfazer.
// ============================================================
import { useState } from "react";
import { toast } from "sonner";
import { CandidatoCard } from "@/components/rh/CandidatoCard";
import { MoverEtapaDialog, type MovimentoConfirmado } from "@/components/rh/MoverEtapaDialog";
import type { FunilEtapa, MotivoReprovacao } from "@/lib/rh-catalogos-store";
import type { FunilItem } from "@/lib/rh-store";

export function FunilKanban({
  itens,
  etapas,
  motivos,
  podeMoverPara,
  onAbrirCandidato,
  onMover,
}: {
  itens: FunilItem[];
  etapas: FunilEtapa[];
  motivos: MotivoReprovacao[];
  /** Quem move para onde: RH e Diretoria para tudo, gestor só onde permite_gestor. */
  podeMoverPara: (etapa: FunilEtapa) => boolean;
  onAbrirCandidato: (item: FunilItem) => void;
  onMover: (
    item: FunilItem,
    etapa: FunilEtapa,
    mov: MovimentoConfirmado,
  ) => Promise<{ ok: boolean; erro?: string }>;
}) {
  const [arrastando, setArrastando] = useState<FunilItem | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null);
  const [pendente, setPendente] = useState<{ item: FunilItem; etapa: FunilEtapa } | null>(null);

  function soltar(etapa: FunilEtapa) {
    setColunaAlvo(null);
    const item = arrastando;
    setArrastando(null);
    if (!item) return;
    if (item.etapaId === etapa.id) return;
    if (!podeMoverPara(etapa)) {
      toast.error(`Você não pode mover candidato para "${etapa.nome}".`);
      return;
    }
    setPendente({ item, etapa });
  }

  return (
    <>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
        {etapas.map((etapa) => {
          const daEtapa = itens.filter((i) => i.etapaId === etapa.id);
          const alvo = colunaAlvo === etapa.id;
          const permitido = arrastando
            ? podeMoverPara(etapa) && arrastando.etapaId !== etapa.id
            : true;
          return (
            <section
              key={etapa.id}
              onDragOver={(e) => {
                if (!arrastando || !permitido) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setColunaAlvo(etapa.id);
              }}
              onDragLeave={() => setColunaAlvo((c) => (c === etapa.id ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                soltar(etapa);
              }}
              className={`flex w-[272px] shrink-0 flex-col rounded-xl border bg-muted/40 transition ${
                alvo ? "border-[#F37032] bg-[#F37032]/5 ring-2 ring-[#F37032]/30" : ""
              } ${arrastando && !permitido ? "opacity-50" : ""}`}
            >
              <header className="flex items-center gap-2 border-b px-3 py-2.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: etapa.cor }}
                />
                <h3
                  className="min-w-0 flex-1 truncate text-sm font-semibold text-[#213368]"
                  title={etapa.nome}
                >
                  {etapa.nome}
                </h3>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                  {daEtapa.length}
                </span>
              </header>

              {etapa.slaDias > 0 && (
                <p className="px-3 pt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                  prazo {etapa.slaDias} {etapa.slaDias === 1 ? "dia" : "dias"}
                </p>
              )}

              <div className="flex min-h-[120px] flex-col gap-2 p-2">
                {daEtapa.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                    {arrastando && permitido ? "Solte aqui" : "Ninguém nesta etapa"}
                  </p>
                ) : (
                  daEtapa.map((item) => (
                    <CandidatoCard
                      key={item.candidaturaId}
                      item={item}
                      arrastavel
                      onAbrir={() => onAbrirCandidato(item)}
                      onDragStart={() => setArrastando(item)}
                      onDragEnd={() => {
                        setArrastando(null);
                        setColunaAlvo(null);
                      }}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <MoverEtapaDialog
        aberto={pendente !== null}
        candidatoNome={pendente?.item.candidatoNome ?? ""}
        etapaOrigem={etapas.find((e) => e.id === pendente?.item.etapaId)}
        etapaDestino={pendente?.etapa}
        motivos={motivos}
        onCancelar={() => setPendente(null)}
        onConfirmar={async (mov) => {
          if (!pendente) return;
          const r = await onMover(pendente.item, pendente.etapa, mov);
          // Erro vira exceção para o diálogo mostrar a mensagem do banco
          // e manter o texto que a pessoa já escreveu.
          if (!r.ok) throw new Error(r.erro ?? "Não foi possível mover o candidato.");
          toast.success(`${pendente.item.candidatoNome} movido para ${pendente.etapa.nome}.`);
          setPendente(null);
        }}
      />
    </>
  );
}
