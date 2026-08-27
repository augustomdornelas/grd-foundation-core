// ============================================================
// A nota obrigatória da movimentação — regras 1 e 2
// ------------------------------------------------------------
// Este diálogo é o único caminho para mover um candidato de etapa pela
// tela. Cancelar aqui desfaz o movimento: quem chama só aplica a
// mudança depois que o banco confirmar.
//
// A validação daqui é conveniência, não segurança. Quem recusa nota
// curta e reprovação sem motivo é a função rh_mover_candidatura, no
// banco — chamar a API direto sem nota dá erro do mesmo jeito.
// ============================================================
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import { notaValida, NOTA_MIN_CARACTERES } from "@/lib/rh-regras";
import type { FunilEtapa, MotivoReprovacao } from "@/lib/rh-catalogos-store";

export type MovimentoConfirmado = {
  nota: string;
  motivoId: string | null;
  motivoTexto: string | null;
};

export function MoverEtapaDialog({
  aberto,
  candidatoNome,
  etapaOrigem,
  etapaDestino,
  motivos,
  onCancelar,
  onConfirmar,
}: {
  aberto: boolean;
  candidatoNome: string;
  etapaOrigem?: FunilEtapa;
  etapaDestino?: FunilEtapa;
  motivos: MotivoReprovacao[];
  onCancelar: () => void;
  onConfirmar: (mov: MovimentoConfirmado) => Promise<void>;
}) {
  const [nota, setNota] = useState("");
  const [motivoId, setMotivoId] = useState("");
  const [motivoTexto, setMotivoTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // Reabrir o diálogo para outro candidato não pode herdar o texto do
  // anterior — nota de um vira nota do outro.
  useEffect(() => {
    if (aberto) {
      setNota("");
      setMotivoId("");
      setMotivoTexto("");
      setErro("");
      setSalvando(false);
    }
  }, [aberto, etapaDestino?.id, candidatoNome]);

  const exigeMotivo = etapaDestino?.tipo === "final_negativa";
  const notaOk = notaValida(nota);
  const motivoOk = !exigeMotivo || (motivoId !== "" && notaValida(motivoTexto));
  const podeConfirmar = notaOk && motivoOk && !salvando;

  async function confirmar() {
    if (!podeConfirmar) return;
    setSalvando(true);
    setErro("");
    try {
      await onConfirmar({
        nota: nota.trim(),
        motivoId: exigeMotivo ? motivoId : null,
        motivoTexto: exigeMotivo ? motivoTexto.trim() : null,
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível registrar a movimentação.");
      setSalvando(false);
    }
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(aberto) => {
        if (!aberto && !salvando) onCancelar();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Mover {candidatoNome} para {etapaDestino?.nome ?? "outra etapa"}
          </DialogTitle>
          <DialogDescription>
            {etapaOrigem ? `Saindo de ${etapaOrigem.nome}. ` : ""}
            Escreva o que aconteceu. Sem a nota, a etapa não muda.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {exigeMotivo && (
            <div className="space-y-1.5">
              <Label htmlFor="rh-motivo">Motivo do encerramento</Label>
              <Select value={motivoId} onValueChange={setMotivoId}>
                <SelectTrigger id="rh-motivo">
                  <SelectValue placeholder="Escolha o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {motivos
                    .filter((m) => m.ativo)
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nome}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {exigeMotivo && (
            <div className="space-y-1.5">
              <Label htmlFor="rh-motivo-texto">O que aconteceu</Label>
              <Textarea
                id="rh-motivo-texto"
                rows={2}
                value={motivoTexto}
                onChange={(e) => setMotivoTexto(e.target.value)}
                placeholder="Ex.: não tinha NR-10 válida e o cliente exige antes da liberação do crachá."
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="rh-nota">Nota da movimentação</Label>
            <Textarea
              id="rh-nota"
              rows={3}
              autoFocus
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ex.: falei por telefone, tem disponibilidade imediata e aceita a obra em Agudos."
            />
            <p
              className={`text-xs ${nota.length > 0 && !notaOk ? "text-red-600" : "text-muted-foreground"}`}
            >
              Mínimo de {NOTA_MIN_CARACTERES} caracteres. Fica no histórico, e histórico não se
              apaga.
            </p>
          </div>

          {erro && (
            <div className="flex gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{erro}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancelar} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={confirmar}
            disabled={!podeConfirmar}
            className="bg-[#F37032] text-white hover:bg-[#ff8850]"
          >
            {salvando ? "Registrando..." : "Registrar e mover"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
