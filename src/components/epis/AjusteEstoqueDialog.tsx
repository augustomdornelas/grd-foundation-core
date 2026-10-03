// ============================================================
// Ajuste de estoque (aba Catálogo)
// ------------------------------------------------------------
// O estoque não se edita: é a soma do livro por lote. Corrigir é lançar
// um ajuste pela RPC registrar_ajuste_epi — entrada, saída ou descarte,
// sempre com motivo. Entrada pode ir para um lote existente ou criar um
// lote novo (sem lote); nesse caso, EPI com C.A. pede número e validade.
// Só Administrador e Almoxarifado veem o botão; o banco barra os demais.
// ============================================================
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InputNumero } from "@/components/ui/input-moeda";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { inteiro } from "@/lib/formato";
import { fmtBr } from "@/components/epis/epis-formato";
import { epiActions, useEpiStore, type LoteComSaldo, type TipoAjuste } from "@/lib/epis-store";

const TIPOS: { valor: TipoAjuste; rotulo: string }[] = [
  { valor: "AJUSTE_ENTRADA", rotulo: "Entrada (soma ao estoque)" },
  { valor: "AJUSTE_SAIDA", rotulo: "Saída (tira do estoque)" },
  { valor: "DESCARTE", rotulo: "Descarte (avariado / vencido)" },
];
const SEM_LOTE = "__novo_lote__";

export function AjusteEstoqueDialog({
  epiIdInicial,
  onClose,
}: {
  epiIdInicial?: string;
  onClose: () => void;
}) {
  const epis = useEpiStore((s) => s.epis);
  const [epiId, setEpiId] = useState(epiIdInicial ?? "");
  const [tipo, setTipo] = useState<TipoAjuste>("AJUSTE_SAIDA");
  const [loteId, setLoteId] = useState("");
  const [lotes, setLotes] = useState<LoteComSaldo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [quantidade, setQuantidade] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  // C.A. do lote novo vem do catálogo, editável.
  const inicial = epis.find((e) => e.id === epiIdInicial);
  const [numeroCa, setNumeroCa] = useState(inicial?.ca ?? "");
  const [validadeCa, setValidadeCa] = useState(inicial?.caValidade ?? "");
  const [salvando, setSalvando] = useState(false);

  const epi = epis.find((e) => e.id === epiId);

  useEffect(() => {
    setLoteId("");
    setLotes([]);
    if (!epiId) return;
    let vivo = true;
    setCarregando(true);
    epiActions.lotesDoEpi(epiId).then(({ lotes, erro }) => {
      if (!vivo) return;
      setCarregando(false);
      if (erro) toast.error(`Não foi possível carregar os lotes: ${erro}`);
      setLotes(lotes);
    });
    return () => {
      vivo = false;
    };
  }, [epiId]);

  const escolherEpi = (id: string) => {
    const e = epis.find((x) => x.id === id);
    setEpiId(id);
    setNumeroCa(e?.ca ?? "");
    setValidadeCa(e?.caValidade ?? "");
  };

  // Saída e descarte só fazem sentido em lote com saldo.
  const lotesVisiveis = tipo === "AJUSTE_ENTRADA" ? lotes : lotes.filter((l) => l.saldo > 0);
  const lote = lotes.find((l) => l.id === loteId);
  const semLote = tipo === "AJUSTE_ENTRADA" && loteId === SEM_LOTE;
  const exigeCa = semLote && !!epi?.exigeCa;
  const letras = motivo.replace(/[^\p{L}]/gu, "").length;
  const qtd = quantidade ?? 0;
  const excedeSaldo = tipo !== "AJUSTE_ENTRADA" && !!lote && qtd > lote.saldo;

  const pronto =
    !!epiId &&
    (semLote || !!lote) &&
    qtd > 0 &&
    Number.isInteger(qtd) &&
    !excedeSaldo &&
    letras >= 3 &&
    (!exigeCa || (!!numeroCa.trim() && !!validadeCa));

  const salvar = async () => {
    if (!pronto || salvando) return;
    setSalvando(true);
    const erro = await epiActions.registrarAjuste({
      tipo,
      epiId,
      loteId: semLote ? null : loteId,
      quantidade: qtd,
      motivo,
      numeroCa: semLote ? numeroCa : undefined,
      validadeCa: semLote ? validadeCa : undefined,
    });
    setSalvando(false);
    if (erro) {
      toast.error(`Ajuste não registrado: ${erro}`);
      return;
    }
    toast.success("Ajuste de estoque registrado.");
    onClose();
  };

  const rotuloLote = (l: LoteComSaldo) =>
    [
      l.origem || "LOTE",
      l.dataCompra ? fmtBr(l.dataCompra) : null,
      l.numeroNota ? `NF ${l.numeroNota}` : null,
      l.numeroCa ? `CA ${l.numeroCa}` : null,
      `saldo ${inteiro(l.saldo)}`,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 uppercase text-[#213368]">
            <SlidersHorizontal className="h-5 w-5 text-[#F37032]" /> Ajuste de estoque
          </DialogTitle>
          <DialogDescription>
            Lançado no livro de estoque com o seu nome e o motivo. Não dá para apagar depois.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>EPI</Label>
            <Select value={epiId} onValueChange={escolherEpi}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha o EPI" />
              </SelectTrigger>
              <SelectContent>
                {epis.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                    {e.ca ? ` (CA ${e.ca})` : ""} — estoque {inteiro(e.estoque)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Tipo</Label>
            <Select
              value={tipo}
              onValueChange={(v) => {
                setTipo(v as TipoAjuste);
                setLoteId("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {epiId && (
            <div>
              <Label>Lote</Label>
              {carregando ? (
                <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Carregando lotes…
                </p>
              ) : (
                <Select value={loteId} onValueChange={setLoteId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha o lote" />
                  </SelectTrigger>
                  <SelectContent>
                    {tipo === "AJUSTE_ENTRADA" && (
                      <SelectItem value={SEM_LOTE}>+ Lote novo (sem compra)</SelectItem>
                    )}
                    {lotesVisiveis.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {rotuloLote(l)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {!carregando && tipo !== "AJUSTE_ENTRADA" && lotesVisiveis.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">Nenhum lote com saldo.</p>
              )}
            </div>
          )}

          {exigeCa && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nº do C.A.</Label>
                <Input value={numeroCa} onChange={(e) => setNumeroCa(e.target.value)} />
              </div>
              <div>
                <Label>Validade do C.A.</Label>
                <Input
                  type="date"
                  value={validadeCa}
                  onChange={(e) => setValidadeCa(e.target.value)}
                />
              </div>
            </div>
          )}

          <div>
            <Label>Quantidade</Label>
            <InputNumero valor={quantidade} onChange={setQuantidade} casas={0} />
            {excedeSaldo && (
              <p className="mt-1 text-xs text-red-600">
                O lote só tem {inteiro(lote?.saldo ?? 0)} em estoque.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="motivo-ajuste">Motivo</Label>
            <Textarea
              id="motivo-ajuste"
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: contagem do almoxarifado em 03/10"
              className="uppercase"
            />
            {motivo && letras < 3 && (
              <p className="mt-1 text-xs text-red-600">Escreva o motivo com pelo menos 3 letras.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>
            Voltar
          </Button>
          <Button
            onClick={salvar}
            disabled={!pronto || salvando}
            className="bg-[#213368] text-white hover:bg-[#2a4185]"
          >
            {salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Registrar ajuste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
