// /app/epis/entregas — aba "Entregas"
//
// Termo só fica ASSINADO com a foto de recebimento salva: não existe
// mais o botão de marcar assinado à mão. Pendente ganha "TIRAR FOTO";
// assinado com foto baixa o termo.pdf guardado no Storage (o mesmo
// gerado na assinatura) e mostra a foto.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  Trash2,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Camera,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { useEpiStore, diasParaVencer, type Entrega } from "@/lib/epis-store";
import { inteiro } from "@/lib/formato";
import { gerarTermoEpiPDF, nomeArquivoTermoEpi } from "@/lib/termo-epi-pdf";
import { baixarTermoSalvo, dadosDoTermo, urlDaFoto } from "@/lib/termo-epi-assinatura";
import { fmtBr } from "@/components/epis/epis-formato";
import { useEpisAcoes } from "@/components/epis/epis-acoes-contexto";
import { FotoRecebimentoDialog, type TermoParaFoto } from "@/components/epis/FotoRecebimento";

export const Route = createFileRoute("/app/epis/entregas")({ component: AbaEntregas });

function AbaEntregas() {
  const funcionarios = useEpiStore((s) => s.funcionarios);
  const entregas = useEpiStore((s) => s.entregas);
  const itens = useEpiStore((s) => s.itens);
  const { abrirEntrega, pedirExclusao } = useEpisAcoes();
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

  const itensVencendo = useMemo(
    () =>
      itens.filter((i) => {
        const d = diasParaVencer(i.dataValidade);
        return d !== null && d <= 30;
      }),
    [itens],
  );

  /**
   * Assinado com foto: baixa o termo.pdf salvo, e não um PDF novo — o
   * arquivo guardado é o que vale. Sem PDF salvo (pendente, ou termo
   * antigo assinado à mão), gera o PDF como antes, sem foto.
   */
  const baixarTermo = async (ent: Entrega) => {
    const termo = termoDe(ent);
    setBaixando(ent.id);
    try {
      if (ent.termoPdfPath) {
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
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-[#213368]">Entregas de EPI</h3>
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
              {entregas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma entrega registrada.
                  </TableCell>
                </TableRow>
              ) : (
                entregas.map((e) => {
                  const func = funcionarios.find((f) => f.id === e.funcionarioId);
                  const qtd = itens
                    .filter((i) => i.entregaId === e.id)
                    .reduce((a, i) => a + i.quantidade, 0);
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-semibold text-[#213368]">
                        {e.numeroTermo || "—"}
                      </TableCell>
                      <TableCell>{func?.nome ?? "—"}</TableCell>
                      <TableCell>{fmtBr(e.dataEntrega)}</TableCell>
                      <TableCell className="text-center">{inteiro(qtd)}</TableCell>
                      <TableCell>
                        {e.assinado ? (
                          <Badge className="bg-green-100 text-green-700">
                            <CheckCircle2 className="mr-1 h-3 w-3" /> Assinado
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700">Pendente</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {!e.assinado && (
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
                              e.termoPdfPath
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
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Excluir"
                            onClick={() =>
                              pedirExclusao({
                                kind: "entrega",
                                id: e.id,
                                label: `termo ${e.numeroTermo}`,
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
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
