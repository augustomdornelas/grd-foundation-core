// /app/epis/compras — aba "Compras"
//
// Compra não se exclui: gerou lote e ENTRADA_COMPRA, que são imutáveis.
// "Estornar compra" (Administrador/Almoxarifado) tira do estoque o saldo
// dos lotes — o que já foi entregue fica com os funcionários.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Trash2, Undo2 } from "lucide-react";
import { epiActions, podeAjustarEstoque, useEpiStore, type CompraEpi } from "@/lib/epis-store";
import { useCurrentUser } from "@/lib/current-user";
import { brl, inteiro } from "@/lib/formato";
import { fmtBr } from "@/components/epis/epis-formato";
import { useEpisAcoes } from "@/components/epis/epis-acoes-contexto";

export const Route = createFileRoute("/app/epis/compras")({ component: AbaCompras });

function AbaCompras() {
  const compras = useEpiStore((s) => s.compras);
  const compraItens = useEpiStore((s) => s.compraItens);
  const { abrirCompra, pedirExclusao } = useEpisAcoes();
  const podeEstornar = podeAjustarEstoque(useCurrentUser().perfil);
  const [paraEstornar, setParaEstornar] = useState<CompraEpi | null>(null);

  return (
    <>
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-[#213368]">Compras de EPI</h3>
            <p className="text-xs text-muted-foreground">
              Entrada de estoque. Cada compra gera um lote por item no estoque. Compra lançada não
              se exclui: para desfazer, use Estornar compra.
            </p>
          </div>
          <Button
            size="sm"
            onClick={abrirCompra}
            className="bg-[#213368] text-white hover:bg-[#2a4185]"
          >
            <Plus className="mr-1 h-4 w-4" /> Nova compra
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Nº da nota</TableHead>
                <TableHead className="text-center">Itens</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compras.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma compra lançada.
                  </TableCell>
                </TableRow>
              ) : (
                compras.map((c) => {
                  const its = compraItens.filter((i) => i.compraId === c.id);
                  const qtd = its.reduce((a, i) => a + i.quantidade, 0);
                  const total = its.reduce((a, i) => a + i.quantidade * i.valorUnitario, 0);
                  return (
                    <TableRow key={c.id} className={c.estornadaEm ? "opacity-60" : undefined}>
                      <TableCell>{fmtBr(c.dataCompra)}</TableCell>
                      <TableCell className="font-semibold">
                        {c.fornecedorNome || "—"}
                        {c.estornadaEm && (
                          <Badge
                            className="ml-2 bg-gray-200 text-gray-700"
                            title={c.estornoMotivo ? `Motivo: ${c.estornoMotivo}` : undefined}
                          >
                            Estornada
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{c.numeroNota || "—"}</TableCell>
                      <TableCell className="text-center">{inteiro(qtd)}</TableCell>
                      <TableCell className="text-right">{brl(total)}</TableCell>
                      <TableCell className="text-right">
                        {/* Compra com itens já gerou lote (imutável). Só a vazia,
                          sobra de lançamento que falhou, pode ser excluída. */}
                        {its.length === 0 ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Excluir compra sem itens"
                            onClick={() =>
                              pedirExclusao({
                                kind: "compra",
                                id: c.id,
                                label: `compra de ${fmtBr(c.dataCompra)}`,
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        ) : podeEstornar && !c.estornadaEm ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-red-700"
                            title="Tirar do estoque o saldo dos lotes desta compra"
                            onClick={() => setParaEstornar(c)}
                          >
                            <Undo2 className="mr-1 h-4 w-4" /> Estornar compra
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
      {paraEstornar && (
        <EstornarCompraDialog
          key={paraEstornar.id}
          compra={paraEstornar}
          onClose={() => setParaEstornar(null)}
        />
      )}
    </>
  );
}

/** Pede o motivo, chama estornar_compra_epi e mostra o que voltou e o que ficou nas entregas. */
function EstornarCompraDialog({ compra, onClose }: { compra: CompraEpi; onClose: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const letras = motivo.replace(/[^\p{L}]/gu, "").length;

  const confirmar = async () => {
    if (letras < 3 || salvando) return;
    setSalvando(true);
    const r = await epiActions.estornarCompra(compra.id, motivo);
    setSalvando(false);
    if (!r.ok) {
      toast.error(`Compra não estornada: ${r.erro}`);
      return;
    }
    const { totalEstornado, unidadesEmEntregas } = r.resultado;
    toast.success(`Compra estornada: ${inteiro(totalEstornado)} un. saíram do estoque.`);
    if (unidadesEmEntregas > 0) {
      toast.warning(
        `${inteiro(unidadesEmEntregas)} un. desta compra já foram entregues e não puderam ser estornadas.`,
        { duration: 10000 },
      );
    }
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="uppercase text-[#213368]">Estornar compra</DialogTitle>
          <DialogDescription>
            Compra de {fmtBr(compra.dataCompra)}
            {compra.fornecedorNome ? ` — ${compra.fornecedorNome}` : ""}. O saldo dos lotes dessa
            compra sai do estoque. O que já foi entregue a funcionários não volta. Não dá para
            desfazer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="motivo-estorno" className="text-xs uppercase">
            Motivo
          </Label>
          <Textarea
            id="motivo-estorno"
            autoFocus
            rows={3}
            value={motivo}
            onChange={(ev) => setMotivo(ev.target.value)}
            placeholder="Ex.: nota lançada em duplicidade"
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
              <Undo2 className="mr-1 h-4 w-4" />
            )}
            Estornar compra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
