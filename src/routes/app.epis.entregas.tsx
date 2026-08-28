// /app/epis/entregas — aba "Entregas"
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { toast } from "sonner";
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
import { Plus, Trash2, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useEpiStore, epiActions, diasParaVencer } from "@/lib/epis-store";
import { inteiro } from "@/lib/formato";
import { gerarTermoEpiPDF, type TermoEpiData } from "@/lib/termo-epi-pdf";
import { fmtBr } from "@/components/epis/epis-formato";
import { useEpisAcoes } from "@/components/epis/epis-acoes-contexto";

export const Route = createFileRoute("/app/epis/entregas")({ component: AbaEntregas });

function AbaEntregas() {
  const funcionarios = useEpiStore((s) => s.funcionarios);
  const entregas = useEpiStore((s) => s.entregas);
  const itens = useEpiStore((s) => s.itens);
  const { abrirEntrega, pedirExclusao } = useEpisAcoes();

  const itensVencendo = useMemo(
    () =>
      itens.filter((i) => {
        const d = diasParaVencer(i.dataValidade);
        return d !== null && d <= 30;
      }),
    [itens],
  );

  const regenerarTermo = async (entregaId: string) => {
    const ent = entregas.find((e) => e.id === entregaId);
    if (!ent) return;
    const func = funcionarios.find((f) => f.id === ent.funcionarioId);
    const its = itens.filter((i) => i.entregaId === entregaId);
    const termo: TermoEpiData = {
      numero: ent.numeroTermo,
      emissao: ent.dataEntrega,
      funcionario: {
        nome: func?.nome ?? "",
        cpf: func?.cpf,
        rg: func?.rg,
        cargo: func?.cargo,
        setor: func?.setor,
        matricula: func?.matricula,
        dataAdmissao: func?.dataAdmissao,
      },
      // Tudo vem do snapshot do item, não do catálogo: o termo antigo mostra
      // o que foi entregue mesmo que o EPI tenha mudado ou sido excluído.
      itens: its.map((i) => ({
        epiNome: i.epiNome,
        ca: i.ca,
        fabricante: i.fabricante,
        unidade: i.unidade,
        fotoUrl: i.epiFotoUrl,
        quantidade: i.quantidade,
        motivo: i.motivo,
        dataEntrega: i.dataEntrega,
        dataValidade: i.dataValidade,
      })),
      responsavelEntrega: ent.responsavelEntrega,
      responsavelCargo: ent.responsavelCargo,
      observacoes: ent.observacoes,
    };
    try {
      await gerarTermoEpiPDF(termo);
    } catch (err) {
      toast.error(`Falha ao gerar PDF: ${err instanceof Error ? err.message : "desconhecido"}`);
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
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Gerar/baixar termo (PDF)"
                            onClick={() => regenerarTermo(e.id)}
                          >
                            <FileText className="h-4 w-4 text-[#213368]" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title={e.assinado ? "Marcar como pendente" : "Marcar como assinado"}
                            onClick={() => epiActions.marcarAssinado(e.id, !e.assinado)}
                          >
                            <CheckCircle2
                              className={`h-4 w-4 ${e.assinado ? "text-green-600" : "text-muted-foreground"}`}
                            />
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
    </>
  );
}
