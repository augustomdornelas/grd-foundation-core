// /app/epis/compras — aba "Compras"
import { createFileRoute } from "@tanstack/react-router";
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
import { Plus, Trash2 } from "lucide-react";
import { useEpiStore } from "@/lib/epis-store";
import { brl, inteiro } from "@/lib/formato";
import { fmtBr } from "@/components/epis/epis-formato";
import { useEpisAcoes } from "@/components/epis/epis-acoes-contexto";

export const Route = createFileRoute("/app/epis/compras")({ component: AbaCompras });

function AbaCompras() {
  const compras = useEpiStore((s) => s.compras);
  const compraItens = useEpiStore((s) => s.compraItens);
  const { abrirCompra, pedirExclusao } = useEpisAcoes();

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-[#213368]">Compras de EPI</h3>
          <p className="text-xs text-muted-foreground">
            Entrada de estoque. Cada compra soma as quantidades ao catálogo.
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
                  <TableRow key={c.id}>
                    <TableCell>{fmtBr(c.dataCompra)}</TableCell>
                    <TableCell className="font-semibold">{c.fornecedorNome || "—"}</TableCell>
                    <TableCell>{c.numeroNota || "—"}</TableCell>
                    <TableCell className="text-center">{inteiro(qtd)}</TableCell>
                    <TableCell className="text-right">{brl(total)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Excluir compra (devolve o estoque)"
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
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
