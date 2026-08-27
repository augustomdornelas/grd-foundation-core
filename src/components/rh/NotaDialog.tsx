// ============================================================
// Nota obrigatória — versão genérica
// ------------------------------------------------------------
// Mesmo contrato do MoverEtapaDialog, para as mudanças que não são de
// etapa: aprovar, publicar, congelar e encerrar vaga. Todas passam por
// função no banco que exige a nota, então o diálogo não é enfeite.
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
import { AlertTriangle } from "lucide-react";
import { notaValida, NOTA_MIN_CARACTERES } from "@/lib/rh-regras";

export function NotaDialog({
  aberto,
  titulo,
  descricao,
  rotuloConfirmar = "Registrar",
  placeholder,
  destrutivo = false,
  onCancelar,
  onConfirmar,
}: {
  aberto: boolean;
  titulo: string;
  descricao: string;
  rotuloConfirmar?: string;
  placeholder?: string;
  destrutivo?: boolean;
  onCancelar: () => void;
  onConfirmar: (nota: string) => Promise<void>;
}) {
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (aberto) {
      setNota("");
      setErro("");
      setSalvando(false);
    }
  }, [aberto, titulo]);

  const podeConfirmar = notaValida(nota) && !salvando;

  async function confirmar() {
    if (!podeConfirmar) return;
    setSalvando(true);
    setErro("");
    try {
      await onConfirmar(nota.trim());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível registrar.");
      setSalvando(false);
    }
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(a) => {
        if (!a && !salvando) onCancelar();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Textarea
            rows={3}
            autoFocus
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder={placeholder ?? "Escreva o motivo desta mudança."}
          />
          <p
            className={`text-xs ${nota.length > 0 && !notaValida(nota) ? "text-red-600" : "text-muted-foreground"}`}
          >
            Mínimo de {NOTA_MIN_CARACTERES} caracteres. Fica no histórico da vaga.
          </p>
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
            className={
              destrutivo
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-[#F37032] text-white hover:bg-[#ff8850]"
            }
          >
            {salvando ? "Registrando..." : rotuloConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
