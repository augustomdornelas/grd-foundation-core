// /app/epis/catalogo — aba "Catálogo de EPIs"
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Image as ImageIcon } from "lucide-react";
import { useEpiStore, type Epi } from "@/lib/epis-store";
import { inteiro } from "@/lib/formato";
import { EpiFormDialog } from "@/components/epis/EpiFormDialog";
import { useEpisAcoes } from "@/components/epis/epis-acoes-contexto";

export const Route = createFileRoute("/app/epis/catalogo")({ component: AbaCatalogo });

function AbaCatalogo() {
  const epis = useEpiStore((s) => s.epis);
  const { pedirExclusao } = useEpisAcoes();
  const [epiForm, setEpiForm] = useState<Epi | "novo" | null>(null);

  return (
    <>
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-[#213368]">Catálogo de EPIs</h3>
          <Button
            size="sm"
            onClick={() => setEpiForm("novo")}
            className="bg-[#213368] text-white hover:bg-[#2a4185]"
          >
            <Plus className="mr-1 h-4 w-4" /> Novo EPI
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Foto</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>C.A.</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-center">Validade</TableHead>
                <TableHead className="text-center">Estoque</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {epis.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum EPI cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                epis.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-[#e6e6ea] bg-[#F4F4F4]">
                        {e.fotoUrl ? (
                          <img
                            src={e.fotoUrl}
                            alt={e.nome}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold">{e.nome}</TableCell>
                    <TableCell>{e.ca || "—"}</TableCell>
                    <TableCell>{e.categoria || "—"}</TableCell>
                    <TableCell className="text-center">
                      {e.validadeDias > 0 ? `${e.validadeDias} dias` : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {inteiro(e.estoque)} {e.unidade}
                    </TableCell>
                    <TableCell>
                      {e.ativo ? (
                        <Badge className="bg-green-100 text-green-700">Ativo</Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-500">Inativo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setEpiForm(e)}>
                          <Pencil className="h-4 w-4 text-[#213368]" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => pedirExclusao({ kind: "epi", id: e.id, label: e.nome })}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {epiForm && (
        <EpiFormDialog epi={epiForm === "novo" ? null : epiForm} onClose={() => setEpiForm(null)} />
      )}
    </>
  );
}
