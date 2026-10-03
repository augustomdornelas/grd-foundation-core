// /app/epis/entregas — aba "Entregas"
//
// Termo só fica ASSINADO com a foto de recebimento salva: não existe
// mais o botão de marcar assinado à mão. Pendente ganha "TIRAR FOTO";
// assinado com foto baixa o termo.pdf guardado no Storage (o mesmo
// gerado na assinatura) e mostra a foto.
//
// Entrega não se exclui: cada uma tem SAIDA_ENTREGA no livro de estoque
// por lote, que é imutável. O que existe é CANCELAR, com motivo — a RPC
// devolve o estoque e a linha fica CANCELADA (oculta por padrão).
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Ban,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Camera,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { useEpiStore, diasParaVencer, epiActions, type Entrega } from "@/lib/epis-store";
import { inteiro } from "@/lib/formato";
import { carregarImagem, gerarTermoEpiPDF, nomeArquivoTermoEpi } from "@/lib/termo-epi-pdf";
import { baixarTermoSalvo, dadosDoTermo, urlDaFoto } from "@/lib/termo-epi-assinatura";
import { fmtBr } from "@/components/epis/epis-formato";
import { useEpisAcoes } from "@/components/epis/epis-acoes-contexto";
import { FotoRecebimentoDialog, type TermoParaFoto } from "@/components/epis/FotoRecebimento";

export const Route = createFileRoute("/app/epis/entregas")({ component: AbaEntregas });

function AbaEntregas() {
  const funcionarios = useEpiStore((s) => s.funcionarios);
  const entregas = useEpiStore((s) => s.entregas);
  const itens = useEpiStore((s) => s.itens);
  const { abrirEntrega } = useEpisAcoes();
  const [mostrarCanceladas, setMostrarCanceladas] = useState(false);
  const [paraCancelar, setParaCancelar] = useState<Entrega | null>(null);
  const [paraFoto, setParaFoto] = useState<TermoParaFoto | null>(null);
  const [verFoto, setVerFoto] = useState<{ numero: string; url: string } | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);

  const termoDe = (ent: Entrega) =>
    dadosDoTermo(
      ent,
      funcionarios.find((f) => f.id === ent.funcionarioId),
      itens.filter((i) => i.entregaId === ent.id),
    );

  const abrirFoto = async (ent: Entrega) => {
    if (!ent.fotoRecebimentoPath) return;
    const url = await urlDaFoto(ent.fotoRecebimentoPath);
    if (!url) return toast.error("Não foi possível abrir a foto.");
    setVerFoto({ numero: ent.numeroTermo, url });
  };

  const visiveis = useMemo(
    () => (mostrarCanceladas ? entregas : entregas.filter((e) => !e.cancelada)),
    [entregas, mostrarCanceladas],
  );
  const qtdCanceladas = useMemo(() => entregas.filter((e) => e.cancelada).length, [entregas]);

  // EPI de entrega cancelada voltou ao estoque: não está com ninguém para vencer.
  const itensVencendo = useMemo(() => {
    const canceladas = new Set(entregas.filter((e) => e.cancelada).map((e) => e.id));
    return itens.filter((i) => {
      if (canceladas.has(i.entregaId)) return false;
      const d = diasParaVencer(i.dataValidade);
      return d !== null && d <= 30;
    });
  }, [itens, entregas]);

  /**
   * Assinado com foto: baixa o termo.pdf salvo, e não um PDF novo — o
   * arquivo guardado é o que vale. Sem PDF salvo (pendente, ou termo
   * antigo assinado à mão), gera o PDF como antes, sem foto.
   *
   * Cancelada: o PDF salvo não diz que foi cancelado, então gera um novo
   * com a marca CANCELADA e o motivo (e a foto, se havia).
   */
  const baixarTermo = async (ent: Entrega) => {
    const termo = termoDe(ent);
    setBaixando(ent.id);
    try {
      if (ent.cancelada) {
        const url = ent.fotoRecebimentoPath ? await urlDaFoto(ent.fotoRecebimentoPath) : null;
        const img = url ? await carregarImagem(url, 900) : null;
        await gerarTermoEpiPDF({
          ...termo,
          fotoRecebimento: img
            ? {
                ...img,
                registradoEm: new Date(ent.assinadoEm ?? ent.dataEntrega),
                registradoPor: ent.responsavelEntrega,
              }
            : undefined,
        });
      } else if (ent.termoPdfPath) {
        const erro = await baixarTermoSalvo(ent.termoPdfPath, nomeArquivoTermoEpi(termo));
        if (erro) toast.error(`Não foi possível baixar o termo salvo: ${erro}`);
      } else {
        await gerarTermoEpiPDF(termo);
      }
    } catch (err) {
      toast.error(`Falha ao gerar PDF: ${err instanceof Error ? err.message : "desconhecido"}`);
    } finally {
      setBaixando(null);
    }
  };

  return (
    <>
      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-[#213368]">Entregas de EPI</h3>
          <div className="ml-auto flex items-center gap-2">
            <Switch
              id="mostrar-canceladas"
              checked={mostrarCanceladas}
              onCheckedChange={setMostrarCanceladas}
            />
            <Label htmlFor="mostrar-canceladas" className="text-xs uppercase text-muted-foreground">
              Mostrar canceladas{qtdCanceladas ? ` (${qtdCanceladas})` : ""}
            </Label>
          </div>
          <Button
            size="sm"
            onClick={() => abrirEntrega(undefined)}
            className="bg-[#213368] text-white hover:bg-[#2a4185]"
          >
            <Plus className="mr-1 h-4 w-4" /> Nova entrega
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Termo</TableHead>
                <TableHead>Funcionário</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-center">Itens</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    {entregas.length === 0
                      ? "Nenhuma entrega registrada."
                      : "Nenhuma entrega ativa. Ligue “Mostrar canceladas” para ver as canceladas."}
                  </TableCell>
                </TableRow>
              ) : (
                visiveis.map((e) => {
                  const func = funcionarios.find((f) => f.id === e.funcionarioId);
                  const qtd = itens
                    .filter((i) => i.entregaId === e.id)
                    .reduce((a, i) => a + i.quantidade, 0);
                  return (
                    <TableRow key={e.id} className={e.cancelada ? "opacity-60" : undefined}>
                      <TableCell className="font-semibold text-[#213368]">
                        {e.numeroTermo || "—"}
                      </TableCell>
                      <TableCell>{func?.nome ?? "—"}</TableCell>
                      <TableCell>{fmtBr(e.dataEntrega)}</TableCell>
                      <TableCell className="text-center">{inteiro(qtd)}</TableCell>
                      <TableCell>
                        {e.cancelada ? (
                          <Badge
                            className="bg-gray-200 text-gray-700"
                            title={
                              e.motivoCancelamento ? `Motivo: ${e.motivoCancelamento}` : undefined
                            }
                          >
                            <Ban className="mr-1 h-3 w-3" /> Cancelada
                          </Badge>
                        ) : e.assinado ? (
                          <Badge className="bg-green-100 text-green-700">
                            <CheckCircle2 className="mr-1 h-3 w-3" /> Assinado
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700">Pendente</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {!e.assinado && !e.cancelada && (
                            <Button
                              size="sm"
                              onClick={() => setParaFoto({ entrega: e, termo: termoDe(e) })}
                              className="h-8 bg-[#F37032] px-2 text-white hover:bg-[#ff8850]"
                              title="Tirar a foto de recebimento — ela assina o termo"
                            >
                              <Camera className="mr-1 h-4 w-4" /> Tirar foto
                            </Button>
                          )}
                          {e.fotoRecebimentoPath && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2"
                              title="Ver a foto de recebimento"
                              onClick={() => abrirFoto(e)}
                            >
                              <ImageIcon className="mr-1 h-4 w-4 text-[#213368]" /> Ver foto
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={baixando === e.id}
                            title={
                              e.cancelada
                                ? "Baixar o termo com a marca CANCELADA"
                                : e.termoPdfPath
                                  ? "Baixar o termo assinado (PDF salvo)"
                                  : "Gerar/baixar termo (PDF)"
                            }
                            onClick={() => baixarTermo(e)}
                          >
                            {baixando === e.id ? (
                              <Loader2 className="h-4 w-4 animate-spin text-[#213368]" />
                            ) : (
                              <FileText className="h-4 w-4 text-[#213368]" />
                            )}
                          </Button>
                          {!e.cancelada && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Cancelar entrega (devolve o estoque)"
                              onClick={() => setParaCancelar(e)}
                            >
                              <Ban className="h-4 w-4 text-red-600" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {itensVencendo.length > 0 && (
        <Card className="mt-4 p-6">
          <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-[#213368]">
            <AlertTriangle className="h-5 w-5 text-[#F37032]" /> EPIs vencendo ou vencidos
          </h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>EPI</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itensVencendo
                  .slice()
                  .sort((a, b) => (a.dataValidade ?? "").localeCompare(b.dataValidade ?? ""))
                  .map((i) => {
                    const ent = entregas.find((e) => e.id === i.entregaId);
                    const func = funcionarios.find((f) => f.id === ent?.funcionarioId);
                    const d = diasParaVencer(i.dataValidade);
                    return (
                      <TableRow key={i.id}>
                        <TableCell>{func?.nome ?? "—"}</TableCell>
                        <TableCell>
                          {i.epiNome}
                          {i.ca ? ` (CA ${i.ca})` : ""}
                        </TableCell>
                        <TableCell>{fmtBr(i.dataValidade)}</TableCell>
                        <TableCell>
                          {d !== null && d < 0 ? (
                            <Badge className="bg-red-100 text-red-700">
                              Vencido há {Math.abs(d)}d
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700">Vence em {d}d</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {paraFoto && (
        <FotoRecebimentoDialog
          key={paraFoto.entrega.id}
          termo={paraFoto}
          onClose={() => setParaFoto(null)}
        />
      )}

      {paraCancelar && (
        <CancelarEntregaDialog
          key={paraCancelar.id}
          entrega={paraCancelar}
          onClose={() => setParaCancelar(null)}
        />
      )}

      <Dialog open={!!verFoto} onOpenChange={(o) => !o && setVerFoto(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="uppercase text-[#213368]">Foto de recebimento</DialogTitle>
            <DialogDescription className="uppercase">Termo {verFoto?.numero}</DialogDescription>
          </DialogHeader>
          {verFoto && (
            <div className="flex justify-center overflow-hidden rounded-lg border bg-muted">
              <img
                src={verFoto.url}
                alt={`Foto de recebimento do termo ${verFoto.numero}`}
                className="max-h-[70vh] w-auto object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Pede o motivo e chama a RPC; só fecha com a confirmação do banco. */
function CancelarEntregaDialog({ entrega, onClose }: { entrega: Entrega; onClose: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const letras = motivo.replace(/[^\p{L}]/gu, "").length;

  const confirmar = async () => {
    if (letras < 3 || salvando) return;
    setSalvando(true);
    const erro = await epiActions.cancelarEntrega(entrega.id, motivo);
    setSalvando(false);
    if (erro) {
      toast.error(`Entrega não cancelada: ${erro}`);
      return;
    }
    toast.success(`Termo ${entrega.numeroTermo} cancelado. O estoque foi devolvido.`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="uppercase text-[#213368]">Cancelar entrega</DialogTitle>
          <DialogDescription>
            Termo {entrega.numeroTermo || "—"}. Os EPIs voltam ao estoque e o termo fica marcado
            como CANCELADO. Não dá para desfazer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="motivo-cancelamento" className="text-xs uppercase">
            Motivo
          </Label>
          <Textarea
            id="motivo-cancelamento"
            autoFocus
            rows={3}
            value={motivo}
            onChange={(ev) => setMotivo(ev.target.value)}
            placeholder="Ex.: lançada para o funcionário errado"
            className="uppercase"
          />
          {motivo && letras < 3 && (
            <p className="text-xs text-red-600">Escreva o motivo com pelo menos 3 letras.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>
            Voltar
          </Button>
          <Button
            onClick={confirmar}
            disabled={letras < 3 || salvando}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {salvando ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Ban className="mr-1 h-4 w-4" />
            )}
            Cancelar entrega
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
