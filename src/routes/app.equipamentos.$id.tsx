import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { ChevronLeft, Pencil, Plus, Wrench, PackageCheck, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/mock-data";
import { useEquipStore, equipActions, periodos } from "@/lib/equipamentos-store";

export const Route = createFileRoute("/app/equipamentos/$id")({
  component: EquipDetalhe,
  notFoundComponent: () => (
    <div className="p-8 text-center">
      <p className="text-muted-foreground">Equipamento não encontrado.</p>
      <Link to="/app/equipamentos" className="mt-4 inline-block font-semibold text-[#213368]">Voltar</Link>
    </div>
  ),
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
});

function fmtDate(iso?: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function EquipDetalhe() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const eq = useEquipStore(s => s.equipamentos.find(e => e.id === id));
  const emprestimos = useEquipStore(s => s.emprestimos.filter(e => e.equipamentoId === id));
  const manutencoes = useEquipStore(s => s.manutencoes.filter(m => m.equipamentoId === id));
  if (!eq) throw notFound();

  const [openDev, setOpenDev] = useState<string | null>(null);
  const [dataReal, setDataReal] = useState(new Date().toISOString().slice(0, 10));

  const [openMn, setOpenMn] = useState(false);
  const [mnData, setMnData] = useState(new Date().toISOString().slice(0, 10));
  const [mnDesc, setMnDesc] = useState("");
  const [mnCusto, setMnCusto] = useState("");

  const custoAcumulado = emprestimos.reduce((a, e) => a + e.custoTotal, 0);
  const diasEmUso = emprestimos.reduce((a, e) => {
    const fim = e.dataDevolucaoReal || e.dataDevolucaoPrevista;
    return a + periodos(e.dataInicio, fim, "dia");
  }, 0);
  const custoManut = manutencoes.reduce((a, m) => a + m.custo, 0);

  const devolver = (empId: string) => {
    equipActions.registrarDevolucao(empId, dataReal);
    toast.success("Devolução registrada");
    setOpenDev(null);
  };

  const salvarManutencao = () => {
    if (!mnDesc.trim()) return toast.error("Descreva a manutenção");
    equipActions.registrarManutencao({
      equipamentoId: eq.id, data: mnData, descricao: mnDesc, custo: Number(mnCusto) || 0, aberta: true,
    });
    toast.success("Manutenção registrada — equipamento marcado como Manutenção");
    setOpenMn(false); setMnDesc(""); setMnCusto("");
  };

  const encerrarManut = (mnId: string) => {
    const hoje = new Date().toISOString().slice(0, 10);
    equipActions.fecharManutencao(mnId, hoje);
    toast.success("Manutenção encerrada");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/app/equipamentos" })}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
          </Button>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[#F37032]">{eq.codigo}</div>
            <h2 className="text-2xl font-extrabold text-[#213368]">{eq.nome}</h2>
            <div className="text-xs text-muted-foreground">{eq.categoria} · {eq.localAtual}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={eq.status} />
          <div className="text-sm text-muted-foreground">{brl(eq.custoPeriodo)}/{eq.unidade}</div>
        </div>
      </div>

      <Tabs defaultValue="geral">
        <TabsList>
          <TabsTrigger value="geral">Visão geral</TabsTrigger>
          <TabsTrigger value="hist">Movimentações</TabsTrigger>
          <TabsTrigger value="manut">Manutenções</TabsTrigger>
          <TabsTrigger value="dash">Dashboard</TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="mt-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="flex aspect-square items-center justify-center bg-[#F4F4F4] md:col-span-1">
              <ImageIcon className="h-16 w-16 text-muted-foreground" />
            </Card>
            <Card className="p-5 md:col-span-2">
              <div className="grid gap-3 text-sm">
                <div><span className="text-muted-foreground">Categoria: </span><b>{eq.categoria}</b></div>
                <div><span className="text-muted-foreground">Descrição: </span>{eq.descricao || "—"}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-muted-foreground">Valor: </span><b>{brl(eq.valor)}</b></div>
                  <div><span className="text-muted-foreground">Custo: </span><b className="text-[#F37032]">{brl(eq.custoPeriodo)}/{eq.unidade}</b></div>
                  <div><span className="text-muted-foreground">Local base: </span><b>{eq.localBase}</b></div>
                  <div><span className="text-muted-foreground">Localização atual: </span><b>{eq.localAtual}</b></div>
                  {eq.responsavelAtual && <div><span className="text-muted-foreground">Responsável: </span><b>{eq.responsavelAtual}</b></div>}
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="hist" className="mt-4">
          <Card className="p-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Destino</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Saída</TableHead>
                  <TableHead>Devolução prevista</TableHead>
                  <TableHead>Devolução real</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Custo total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {emprestimos.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Sem movimentações.</TableCell></TableRow>
                  )}
                  {emprestimos.slice().reverse().map(e => {
                    const fim = e.dataDevolucaoReal || e.dataDevolucaoPrevista;
                    const p = periodos(e.dataInicio, fim, e.unidade);
                    return (
                      <TableRow key={e.id}>
                        <TableCell>{e.destino}</TableCell>
                        <TableCell>{e.responsavel}</TableCell>
                        <TableCell>{fmtDate(e.dataInicio)}</TableCell>
                        <TableCell>{fmtDate(e.dataDevolucaoPrevista)}</TableCell>
                        <TableCell>{fmtDate(e.dataDevolucaoReal)}</TableCell>
                        <TableCell>{p} {e.unidade}(s)</TableCell>
                        <TableCell className="font-semibold text-[#F37032]">{brl(e.custoTotal)}</TableCell>
                        <TableCell><StatusBadge status={e.ativo ? "Em uso" : "Concluído"} /></TableCell>
                        <TableCell>
                          {e.ativo && (
                            <Button size="sm" variant="ghost" onClick={() => setOpenDev(e.id)}>
                              <PackageCheck className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="manut" className="mt-4">
          <Card className="p-4">
            <div className="mb-4 flex justify-end">
              <Button onClick={() => setOpenMn(true)} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
                <Wrench className="mr-1 h-4 w-4" /> Registrar manutenção
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Encerramento</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Custo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {manutencoes.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Sem manutenções.</TableCell></TableRow>
                  )}
                  {manutencoes.slice().reverse().map(m => (
                    <TableRow key={m.id}>
                      <TableCell>{fmtDate(m.data)}</TableCell>
                      <TableCell>{fmtDate(m.dataFim)}</TableCell>
                      <TableCell className="max-w-[320px]">{m.descricao}</TableCell>
                      <TableCell className="font-semibold">{brl(m.custo)}</TableCell>
                      <TableCell><StatusBadge status={m.aberta ? "Manutenção" : "Concluído"} /></TableCell>
                      <TableCell>
                        {m.aberta && (
                          <Button size="sm" variant="outline" onClick={() => encerrarManut(m.id)}>Encerrar</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="dash" className="mt-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-5"><div className="text-xs text-muted-foreground">Custo acumulado (locação)</div><div className="mt-1 text-2xl font-extrabold text-[#F37032]">{brl(custoAcumulado)}</div></Card>
            <Card className="p-5"><div className="text-xs text-muted-foreground">Dias totais em uso</div><div className="mt-1 text-2xl font-extrabold text-[#213368]">{diasEmUso}</div></Card>
            <Card className="p-5"><div className="text-xs text-muted-foreground">Custo total em manutenções</div><div className="mt-1 text-2xl font-extrabold text-amber-600">{brl(custoManut)}</div></Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Devolução */}
      <Dialog open={!!openDev} onOpenChange={(v) => { if (!v) setOpenDev(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar devolução</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Label>Data real da devolução</Label>
            <Input type="date" value={dataReal} onChange={e => setDataReal(e.target.value)} />
            <div className="rounded-lg bg-[#F4F4F4] p-3 text-xs text-muted-foreground">
              O custo final será recalculado com base no período efetivo.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDev(null)}>Cancelar</Button>
            <Button onClick={() => openDev && devolver(openDev)} className="bg-[#213368] text-white hover:bg-[#2a4185]">Confirmar devolução</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manutenção */}
      <Dialog open={openMn} onOpenChange={setOpenMn}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar manutenção</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Data de início</Label><Input type="date" value={mnData} onChange={e => setMnData(e.target.value)} /></div>
            <div><Label>Descrição</Label><Textarea rows={3} value={mnDesc} onChange={e => setMnDesc(e.target.value)} /></div>
            <div><Label>Custo (R$)</Label><Input inputMode="numeric" value={mnCusto} onChange={e => setMnCusto(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenMn(false)}>Cancelar</Button>
            <Button onClick={salvarManutencao} className="bg-[#F37032] text-white hover:bg-[#ff8850]">Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
