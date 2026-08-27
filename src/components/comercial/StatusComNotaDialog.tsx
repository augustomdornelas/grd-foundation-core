// ============================================================
// Diálogo de mudança de status com nota obrigatória
// ------------------------------------------------------------
// Requisito 1: se o status muda, a nota é gravada junto, na mesma
// transação. Quem faz a gravação atômica é a função
// public.orcamento_mudar_status; aqui só ficam a coleta do texto e
// a regra dos 5 caracteres (repetida no banco).
// ============================================================
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { orcamentosActions, type OrcStatus } from "@/lib/orcamentos-store";
import { notaValida, NOTA_MIN_CARACTERES } from "@/lib/orcamento-notas";
import { useCurrentUser } from "@/lib/current-user";

export type MudancaPendente = {
  orcamentoId: string;
  numero: string;
  de: OrcStatus;
  para: OrcStatus;
};

export function StatusComNotaDialog({ mudanca, onCancelar, onConcluido }: {
  mudanca: MudancaPendente | null;
  onCancelar: () => void;
  /** Chamado só depois que status e nota gravaram com sucesso. */
  onConcluido: () => void;
}) {
  const usuario = useCurrentUser();
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { if (mudanca) { setTexto(""); setSalvando(false); } }, [mudanca?.orcamentoId, mudanca?.para]);

  async function confirmar() {
    if (!mudanca || !notaValida(texto) || salvando) return;
    setSalvando(true);
    const { error } = await orcamentosActions.mudarStatusComNota(
      mudanca.orcamentoId, mudanca.para, texto,
      { id: usuario.id, nome: usuario.nome },
    );
    setSalvando(false);
    if (error) {
      // Nada mudou: a função aborta a transação inteira quando a nota falha.
      toast.error(`Status não alterado: ${error.message ?? "erro desconhecido"}`);
      return;
    }
    toast.success("Status atualizado e nota registrada.");
    onConcluido();
  }

  const valido = notaValida(texto);
  const faltam = Math.max(0, NOTA_MIN_CARACTERES - texto.replace(/\s/g, "").length);

  return (
    <Dialog open={!!mudanca} onOpenChange={o => { if (!o && !salvando) onCancelar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Por que o status está mudando?</DialogTitle>
          <DialogDescription asChild>
            <div className="pt-1 text-sm">
              <span className="font-semibold text-[#213368]">{mudanca?.numero}</span>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded border bg-muted px-2 py-0.5 text-xs font-semibold">{mudanca?.de}</span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded bg-[#213368] px-2 py-0.5 text-xs font-semibold text-white">{mudanca?.para}</span>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Textarea
            rows={4}
            autoFocus
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Ex.: cliente confirmou por telefone, contrato assinado na próxima semana."
          />
          <p className="text-xs text-muted-foreground">
            {valido
              ? "A nota entra no histórico junto com a mudança."
              : `Faltam ${faltam} caractere(s) — mínimo de ${NOTA_MIN_CARACTERES}, sem contar espaços.`}
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={salvando} onClick={onCancelar}>Cancelar</Button>
          <Button
            type="button"
            disabled={!valido || salvando}
            onClick={() => void confirmar()}
            className="bg-[#F37032] text-white hover:bg-[#ff8850]"
          >
            {salvando ? "Salvando..." : "Salvar status e nota"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
