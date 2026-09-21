// ============================================================
// Leitor de QR code das etiquetas do almoxarifado
// ------------------------------------------------------------
// LeitorQrDialog é o ÚNICO lugar que mexe na câmera. Quem precisa ler um
// QR (catálogo, nova entrega, lançar compra) usa ele ou o
// LeitorEpiQrDialog, logo abaixo, que já transforma o texto lido em EPI.
//
// BIBLIOTECA: @zxing/browser. Decodifica no próprio thread da página
// (sem Web Worker nem blob:), então a CSP não precisou mudar; o vídeo
// vem de getUserMedia direto no srcObject, que a CSP não restringe.
// Não depende do BarcodeDetector nativo, que o Safari não tem.
//
// CÂMERA: traseira (facingMode "environment"). Ao fechar o diálogo, o
// leitor é parado E todas as tracks do stream são encerradas — senão a
// luz da câmera fica acesa no celular.
//
// MESMA ETIQUETA DUAS VEZES: com a etiqueta parada na frente da câmera o
// leitor a vê a cada quadro. A mesma etiqueta só conta de novo depois de
// ~2 s SEM ser vista (tirar a câmera dela e voltar); segurar parado não
// soma sozinho.
// ============================================================
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { toast } from "sonner";
import { Flashlight, FlashlightOff, Keyboard, Loader2, QrCode, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useEpiStore,
  epiActions,
  acharEpiPorQr,
  normalizarCodigoEpi,
  type Epi,
} from "@/lib/epis-store";

const INTERVALO_MESMA_ETIQUETA_MS = 2000;

type Fase = "iniciando" | "lendo" | "negado" | "sem-camera" | "erro";

function pararStream(video: HTMLVideoElement | null) {
  const stream = video?.srcObject;
  if (stream && typeof (stream as MediaStream).getTracks === "function") {
    (stream as MediaStream).getTracks().forEach((t) => t.stop());
  }
  if (video) video.srcObject = null;
}

export function LeitorQrDialog({
  open,
  onClose,
  titulo,
  onLer,
  pausado = false,
  children,
  rodape,
}: {
  open: boolean;
  onClose: () => void;
  titulo: string;
  /** Texto do QR, já sem leituras repetidas da mesma etiqueta. */
  onLer: (texto: string) => void;
  /** Enquanto true, leituras são ignoradas (ex.: esperando vincular um código). */
  pausado?: boolean;
  /** Conteúdo embaixo da câmera. */
  children?: ReactNode;
  /** Botões do rodapé (ex.: CONCLUIR). */
  rodape?: ReactNode;
}) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [fase, setFase] = useState<Fase>("iniciando");
  const [detalheErro, setDetalheErro] = useState("");
  const [torchDisponivel, setTorchDisponivel] = useState(false);
  const [torchLigado, setTorchLigado] = useState(false);
  const [digitando, setDigitando] = useState(false);
  const [codigoDigitado, setCodigoDigitado] = useState("");

  const controlesRef = useRef<IScannerControls | null>(null);
  const onLerRef = useRef(onLer);
  onLerRef.current = onLer;
  const pausadoRef = useRef(pausado);
  pausadoRef.current = pausado;
  const ultimaRef = useRef<{ texto: string; vistoEm: number } | null>(null);

  // Cada abertura começa do zero. Sem isto, quem negou a câmera uma vez
  // ficaria preso no aviso: o <video> não é montado em "negado", e sem
  // ele a câmera nunca é pedida de novo.
  useEffect(() => {
    if (!open) return;
    setFase("iniciando");
    setDigitando(false);
    setCodigoDigitado("");
  }, [open]);

  useEffect(() => {
    if (!open || !video) return;
    let cancelado = false;
    setFase("iniciando");
    setDetalheErro("");
    setTorchDisponivel(false);
    setTorchLigado(false);
    ultimaRef.current = null;

    if (!navigator.mediaDevices?.getUserMedia) {
      // Sem getUserMedia: navegador antigo ou página fora de https.
      setFase("sem-camera");
      setDigitando(true);
      return;
    }

    const leitor = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 150 });
    leitor
      .decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        video,
        (resultado) => {
          if (!resultado || cancelado) return;
          const texto = resultado.getText().trim();
          if (!texto) return;
          const agora = Date.now();
          const ultima = ultimaRef.current;
          const repetida =
            ultima &&
            ultima.texto === texto &&
            agora - ultima.vistoEm < INTERVALO_MESMA_ETIQUETA_MS;
          // "Visto" é atualizado a cada quadro: a janela conta a partir da
          // última vez que a etiqueta apareceu, e não da última aceita.
          ultimaRef.current = { texto, vistoEm: agora };
          if (repetida || pausadoRef.current) return;
          navigator.vibrate?.(80);
          onLerRef.current(texto);
        },
      )
      .then((controles) => {
        if (cancelado) {
          controles.stop();
          pararStream(video);
          return;
        }
        controlesRef.current = controles;
        setTorchDisponivel(typeof controles.switchTorch === "function");
        setFase("lendo");
      })
      .catch((err: unknown) => {
        if (cancelado) return;
        const nome = err instanceof Error ? err.name : "";
        if (nome === "NotAllowedError" || nome === "SecurityError") setFase("negado");
        else if (nome === "NotFoundError" || nome === "OverconstrainedError") setFase("sem-camera");
        else {
          setFase("erro");
          setDetalheErro(err instanceof Error ? err.message : String(err));
        }
        setDigitando(true);
      });

    return () => {
      cancelado = true;
      controlesRef.current?.stop();
      controlesRef.current = null;
      pararStream(video);
    };
  }, [open, video]);

  const alternarLanterna = async () => {
    const c = controlesRef.current;
    if (!c?.switchTorch) return;
    try {
      await c.switchTorch(!torchLigado);
      setTorchLigado(!torchLigado);
    } catch {
      toast.error("Não foi possível ligar a lanterna neste aparelho.");
      setTorchDisponivel(false);
    }
  };

  const usarCodigoDigitado = () => {
    const texto = codigoDigitado.trim();
    if (!texto) return;
    onLerRef.current(texto);
    setCodigoDigitado("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* uppercase: o Dialog abre fora do .app-layout (portal no body). */}
      <DialogContent className="max-h-[94vh] max-w-md overflow-y-auto uppercase">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#213368]">
            <QrCode className="h-5 w-5 text-[#F37032]" /> {titulo}
          </DialogTitle>
          <DialogDescription>Aponte para o QR code da etiqueta</DialogDescription>
        </DialogHeader>

        {(fase === "iniciando" || fase === "lendo") && (
          <div className="relative overflow-hidden rounded-lg bg-black">
            <video
              ref={setVideo}
              className="aspect-square w-full object-cover"
              muted
              playsInline
              autoPlay
            />
            {/* Quadro guia */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-3/5 w-3/5 rounded-xl border-4 border-[#F37032] shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
            <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs font-bold text-white drop-shadow">
              Aponte para o QR code da etiqueta
            </p>
            {fase === "iniciando" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Abrindo a câmera…
              </div>
            )}
            {pausado && fase === "lendo" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 px-4 text-center text-sm font-semibold text-white">
                Leitura pausada — resolva o aviso abaixo
              </div>
            )}
          </div>
        )}

        {fase === "negado" && (
          <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p className="flex items-center gap-2 font-bold">
              <TriangleAlert className="h-4 w-4 shrink-0" /> A câmera foi bloqueada
            </p>
            <p>
              <b>Android (Chrome):</b> toque no cadeado ao lado do endereço → Permissões → Câmera →
              Permitir. Depois feche e abra o leitor de novo.
            </p>
            <p>
              <b>iPhone (Safari):</b> Ajustes → Safari → Câmera → Permitir (ou toque em “aA” na
              barra de endereço → Ajustes do Site → Câmera). Depois feche e abra o leitor de novo.
            </p>
            <p>Enquanto isso, dá para digitar o código da etiqueta abaixo.</p>
          </div>
        )}
        {fase === "sem-camera" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Nenhuma câmera disponível neste aparelho. Digite o código da etiqueta abaixo.
          </div>
        )}
        {fase === "erro" && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            Não foi possível abrir a câmera{detalheErro ? ` (${detalheErro})` : ""}. Digite o código
            da etiqueta abaixo.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {fase === "lendo" && torchDisponivel && (
            <Button type="button" variant="outline" size="sm" onClick={alternarLanterna}>
              {torchLigado ? (
                <FlashlightOff className="mr-1 h-4 w-4" />
              ) : (
                <Flashlight className="mr-1 h-4 w-4" />
              )}
              Lanterna
            </Button>
          )}
          {!digitando && (
            <Button type="button" variant="outline" size="sm" onClick={() => setDigitando(true)}>
              <Keyboard className="mr-1 h-4 w-4" /> Digitar código
            </Button>
          )}
        </div>

        {digitando && (
          <div className="flex gap-2">
            <Input
              value={codigoDigitado}
              onChange={(e) => setCodigoDigitado(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && usarCodigoDigitado()}
              placeholder="GRD-ALM-XX-000"
              autoCapitalize="characters"
              disabled={pausado}
            />
            <Button
              type="button"
              onClick={usarCodigoDigitado}
              disabled={pausado || !codigoDigitado.trim()}
              className="bg-[#213368] text-white hover:bg-[#2a4185]"
            >
              Usar
            </Button>
          </div>
        )}

        {children}

        {rodape && <DialogFooter>{rodape}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Leitor de EPI: o texto do QR vira um EPI do catálogo
// ============================================================
/**
 * Resolve o QR em EPI e entrega para quem abriu. Cuida dos três casos em
 * que não há EPI para entregar:
 *  - código não cadastrado: oferece VINCULAR A UM EPI (grava o código
 *    nele na hora) e segue lendo;
 *  - EPI inativo: avisa e não entrega;
 *  - (estoque zero é da entrega, não daqui: quem abriu decide.)
 *
 * modo "unico": fecha na primeira leitura aceita.
 * modo "sequencia": fica aberto e mostra o que já foi lido, com a
 * quantidade, até CONCLUIR.
 */
export function LeitorEpiQrDialog({
  open,
  onClose,
  modo,
  onEpi,
}: {
  open: boolean;
  onClose: () => void;
  modo: "unico" | "sequencia";
  onEpi: (epi: Epi) => void;
}) {
  const epis = useEpiStore((s) => s.epis);
  const [pendente, setPendente] = useState<string | null>(null);
  const [vincularId, setVincularId] = useState("");
  const [vinculando, setVinculando] = useState(false);
  const [lidos, setLidos] = useState<{ id: string; nome: string; quantidade: number }[]>([]);

  useEffect(() => {
    if (!open) return;
    setPendente(null);
    setVincularId("");
    setLidos([]);
  }, [open]);

  const aceitar = (epi: Epi) => {
    if (!epi.ativo) {
      toast.warning(`${epi.nome} está INATIVO no catálogo — não foi adicionado.`);
      return;
    }
    onEpi(epi);
    if (modo === "unico") {
      onClose();
      return;
    }
    setLidos((prev) => {
      const i = prev.findIndex((l) => l.id === epi.id);
      if (i >= 0)
        return prev.map((l, idx) => (idx === i ? { ...l, quantidade: l.quantidade + 1 } : l));
      return [...prev, { id: epi.id, nome: epi.nome, quantidade: 1 }];
    });
  };

  const aoLer = (texto: string) => {
    const epi = acharEpiPorQr(epis, texto);
    if (epi) aceitar(epi);
    else setPendente(texto);
  };

  const vincular = async () => {
    const epi = epis.find((e) => e.id === vincularId);
    if (!pendente || !epi) return;
    setVinculando(true);
    const codigo = normalizarCodigoEpi(pendente);
    const erro = await epiActions.atualizarEpi(epi.id, { codigoInterno: codigo });
    setVinculando(false);
    if (erro) return; // o store já avisou e desfez
    toast.success(`Código ${codigo} vinculado a ${epi.nome}.`);
    setPendente(null);
    setVincularId("");
    aceitar({ ...epi, codigoInterno: codigo });
  };

  const episOrdenados = [...epis]
    .filter((e) => e.ativo)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <LeitorQrDialog
      open={open}
      onClose={onClose}
      titulo={modo === "sequencia" ? "Ler etiquetas" : "Ler QR do EPI"}
      onLer={aoLer}
      pausado={!!pendente}
      rodape={
        modo === "sequencia" ? (
          <Button
            type="button"
            onClick={onClose}
            className="w-full bg-[#F37032] text-white hover:bg-[#ff8850] sm:w-auto"
          >
            Concluir
          </Button>
        ) : undefined
      }
    >
      {pendente && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-bold text-amber-900">
            Código {normalizarCodigoEpi(pendente)} não cadastrado
          </p>
          <p className="text-xs text-amber-900">
            Vincular a um EPI grava este código nele agora; a próxima leitura já o reconhece.
          </p>
          <Select value={vincularId} onValueChange={setVincularId}>
            <SelectTrigger className="bg-white">
              <SelectValue placeholder="Escolher o EPI…" />
            </SelectTrigger>
            <SelectContent>
              {episOrdenados.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nome}
                  {e.codigoInterno ? ` · hoje ${e.codigoInterno}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {vincularId && epis.find((e) => e.id === vincularId)?.codigoInterno && (
            <p className="text-xs font-semibold text-red-700">
              Este EPI já tem o código {epis.find((e) => e.id === vincularId)?.codigoInterno}, que
              será substituído.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={vincular}
              disabled={!vincularId || vinculando}
              className="bg-[#213368] text-white hover:bg-[#2a4185]"
            >
              {vinculando ? "Vinculando…" : "Vincular a um EPI"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setPendente(null);
                setVincularId("");
              }}
              disabled={vinculando}
            >
              Ignorar e seguir lendo
            </Button>
          </div>
        </div>
      )}

      {modo === "sequencia" && (
        <div className="rounded-lg border">
          <p className="border-b bg-[#F4F4F4] px-3 py-2 text-xs font-bold text-[#213368]">
            Lidos: {lidos.reduce((a, l) => a + l.quantidade, 0)}
          </p>
          {lidos.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              Nenhuma etiqueta lida ainda.
            </p>
          ) : (
            <ul className="max-h-40 divide-y overflow-y-auto">
              {lidos.map((l) => (
                <li key={l.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                  <span className="min-w-0 truncate">{l.nome}</span>
                  <span className="ml-2 shrink-0 font-bold text-[#F37032]">× {l.quantidade}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </LeitorQrDialog>
  );
}
