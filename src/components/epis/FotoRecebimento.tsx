// ============================================================
// Passo "FOTO DE RECEBIMENTO" do termo de EPI
// ------------------------------------------------------------
// A foto do colaborador recebendo os EPIs é a assinatura do termo. Em
// entrega em lote é um colaborador por vez, com o nome de quem está na
// vez em destaque.
//
// A câmera é um <input type="file" accept="image/*" capture="environment">:
// no celular abre a câmera traseira direto; no computador abre a
// escolha de arquivo (ou a webcam, conforme o navegador). A
// Permissions-Policy do Portal já libera camera=(self) — ver
// src/lib/security-headers.ts.
//
// Salvar é automático ao confirmar a foto (termo-epi-assinatura.ts).
// Se falhar, o termo continua PENDENTE e aparece "TENTAR DE NOVO" com a
// mesma foto — não é preciso fotografar outra vez.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, RefreshCw, Check, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCurrentUser } from "@/lib/current-user";
import type { Entrega } from "@/lib/epis-store";
import type { TermoEpiData } from "@/lib/termo-epi-pdf";
import { assinarTermoComFoto, reduzirFoto, type FotoReduzida } from "@/lib/termo-epi-assinatura";

export type TermoParaFoto = { entrega: Entrega; termo: TermoEpiData };

type Fase = "capturar" | "processando" | "previa" | "enviando" | "erro";

export function FotoRecebimento({
  fila,
  onFim,
  onOcupado,
}: {
  fila: TermoParaFoto[];
  /** Todos da fila passaram (assinados ou deixados para depois). */
  onFim: () => void;
  /** true enquanto processa ou envia — quem abre o diálogo não deixa fechar. */
  onOcupado?: (ocupado: boolean) => void;
}) {
  const user = useCurrentUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const [indice, setIndice] = useState(0);
  const [fase, setFase] = useState<Fase>("capturar");
  const [foto, setFoto] = useState<FotoReduzida | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  const atual = fila[indice];

  useEffect(() => {
    onOcupado?.(fase === "processando" || fase === "enviando");
  }, [fase, onOcupado]);

  // A URL da pré-visualização é um blob: tem que ser liberada ao trocar
  // de foto, senão cada "TIRAR OUTRA" vaza alguns MB de memória.
  useEffect(() => {
    return () => {
      if (previa) URL.revokeObjectURL(previa);
    };
  }, [previa]);

  const limpar = () => {
    setFoto(null);
    setPrevia(null);
    setErro("");
    setFase("capturar");
  };

  const proximo = () => {
    limpar();
    if (indice + 1 < fila.length) setIndice(indice + 1);
    else onFim();
  };

  const abrirCamera = () => inputRef.current?.click();

  const aoEscolher = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    // Zera o input: escolher o mesmo arquivo de novo tem que disparar
    // o change outra vez.
    e.target.value = "";
    if (!arquivo) return;
    setFase("processando");
    try {
      const reduzida = await reduzirFoto(arquivo);
      setFoto(reduzida);
      setPrevia(URL.createObjectURL(reduzida.blob));
      setFase("previa");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível ler a foto.");
      setFase("capturar");
    }
  };

  const confirmar = async () => {
    if (!foto || !atual) return;
    setFase("enviando");
    setErro("");
    const r = await assinarTermoComFoto({
      entrega: atual.entrega,
      termo: atual.termo,
      foto,
      usuario: { id: user.id, nome: user.nome },
    });
    if (!r.ok) {
      setErro(`Não foi possível salvar: ${r.erro}. O termo continua PENDENTE.`);
      setFase("erro");
      return;
    }
    toast.success(`Termo ${atual.entrega.numeroTermo} assinado com foto e salvo.`);
    proximo();
  };

  if (!atual) return null;
  const ocupado = fase === "processando" || fase === "enviando";

  return (
    // uppercase na mão: o conteúdo abre dentro de um Dialog (portal no
    // body), fora do alcance da regra global de caixa alta do /app.
    <div className="space-y-4 uppercase">
      <div className="rounded-lg bg-[#213368] px-4 py-3 text-white">
        <p className="text-[11px] font-semibold tracking-wide text-white/70">
          Foto de recebimento
          {fila.length > 1 && ` · ${indice + 1} de ${fila.length}`}
        </p>
        <p className="mt-0.5 text-lg font-extrabold leading-tight">
          {atual.termo.funcionario.nome || "—"}
        </p>
        <p className="text-xs text-white/80">Termo {atual.entrega.numeroTermo || "sem número"}</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={aoEscolher}
      />

      {(fase === "capturar" || fase === "processando") && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Fotografe o colaborador segurando os EPIs entregues. A foto assina o termo.
          </p>
          <Button
            type="button"
            onClick={abrirCamera}
            disabled={ocupado}
            className="h-20 w-full bg-[#F37032] text-lg font-extrabold text-white hover:bg-[#ff8850]"
          >
            {fase === "processando" ? (
              <>
                <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Preparando a foto…
              </>
            ) : (
              <>
                <Camera className="mr-2 h-7 w-7" /> Tirar foto
              </>
            )}
          </Button>
        </div>
      )}

      {(fase === "previa" || fase === "enviando" || fase === "erro") && previa && (
        <div className="space-y-3">
          <div className="flex justify-center overflow-hidden rounded-lg border bg-muted">
            <img
              src={previa}
              alt={`Foto de recebimento de ${atual.termo.funcionario.nome}`}
              className="max-h-[50vh] w-auto object-contain"
            />
          </div>

          {fase === "erro" && (
            <div className="flex gap-2 rounded-md bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              onClick={abrirCamera}
              disabled={ocupado}
              className="h-12"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Tirar outra
            </Button>
            <Button
              type="button"
              onClick={confirmar}
              disabled={ocupado}
              className="h-12 bg-[#213368] font-bold text-white hover:bg-[#2a4185]"
            >
              {fase === "enviando" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando…
                </>
              ) : fase === "erro" ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" /> Tentar de novo
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" /> Usar esta foto
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-end border-t pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={proximo}
          disabled={ocupado}
          className="text-muted-foreground"
          title="O termo fica PENDENTE e a foto pode ser tirada depois, pela lista de entregas"
        >
          {indice + 1 < fila.length ? "Deixar para depois · próximo" : "Deixar para depois"}
        </Button>
      </div>
    </div>
  );
}

/** A mesma captura num diálogo próprio — é o que a lista de entregas abre. */
export function FotoRecebimentoDialog({
  termo,
  onClose,
}: {
  termo: TermoParaFoto;
  onClose: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && !ocupado && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 uppercase text-[#213368]">
            <Camera className="h-5 w-5 text-[#F37032]" /> Foto de recebimento
          </DialogTitle>
          <DialogDescription className="uppercase">
            A foto substitui a assinatura do termo.
          </DialogDescription>
        </DialogHeader>
        <FotoRecebimento fila={[termo]} onFim={onClose} onOcupado={setOcupado} />
      </DialogContent>
    </Dialog>
  );
}
