// /app/epis/funcionarios — aba "Funcionários"
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
import { Plus, Pencil, Trash2, PackageCheck } from "lucide-react";
import { useEpiStore, type Funcionario } from "@/lib/epis-store";
import { FuncionarioFormDialog } from "@/components/epis/FuncionarioFormDialog";
import { useEpisAcoes } from "@/components/epis/epis-acoes-contexto";

export const Route = createFileRoute("/app/epis/funcionarios")({ component: AbaFuncionarios });

function AbaFuncionarios() {
  const funcionarios = useEpiStore((s) => s.funcionarios);
  // abrirEntrega é o que mantinha esta aba amarrada à de Entregas:
  // o botão abre a entrega com o funcionário já escolhido.
  const { abrirEntrega, pedirExclusao } = useEpisAcoes();
  const [funcForm, setFuncForm] = useState<Funcionario | "novo" | null>(null);

  return (
    <>
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-[#213368]">Funcionários</h3>
          <Button
            size="sm"
            onClick={() => setFuncForm("novo")}
            className="bg-[#213368] text-white hover:bg-[#2a4185]"
          >
            <Plus className="mr-1 h-4 w-4" /> Novo funcionário
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Setor</TableHead>
                <TableHead>Matrícula</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {funcionarios.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum funcionário cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                funcionarios.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-semibold">{f.nome}</TableCell>
                    <TableCell>{f.cpf || "—"}</TableCell>
                    <TableCell>{f.cargo || "—"}</TableCell>
                    <TableCell>{f.setor || "—"}</TableCell>
                    <TableCell>{f.matricula || "—"}</TableCell>
                    <TableCell>
                      {f.ativo ? (
                        <Badge className="bg-green-100 text-green-700">Ativo</Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-500">Inativo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Entregar EPI"
                          onClick={() => abrirEntrega(f.id)}
                        >
                          <PackageCheck className="h-4 w-4 text-[#F37032]" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setFuncForm(f)}>
                          <Pencil className="h-4 w-4 text-[#213368]" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => pedirExclusao({ kind: "func", id: f.id, label: f.nome })}
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

      {funcForm && (
        <FuncionarioFormDialog
          funcionario={funcForm === "novo" ? null : funcForm}
          onClose={() => setFuncForm(null)}
        />
      )}
    </>
  );
}
