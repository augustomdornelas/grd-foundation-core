import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { ChevronLeft, Pencil, PackageOpen, Wrench, PackageCheck } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  BarChart, Bar, PieChart, Pie, Cell, ReferenceLine,
} from "recharts";
import { toast } from "sonner";
import { brl } from "@/lib/mock-data";
import {
  useEquipStore, equipActions, periodos,
  type EquipStatus, type UnidadePeriodo,
} from "@/lib/equipamentos-store";

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

const UNIDADES: UnidadePeriodo[] = ["dia", "semana", "mês"];
const STATUS: EquipStatus[] = ["Disponível", "Emprestado", "Manutenção"];
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function fmtDate(iso?: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
function chaveMes(d: Date) { return `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`; }
function diffDias(a: string, b: string) {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
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

  const [openEmp, setOpenEmp] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);

  const totalFaturado = emprestimos.reduce((a, e) => a + e.custoTotal, 0);
  const custoManut = manutencoes.reduce((a, m) => a + m.custo, 0);
  const liquido = totalFaturado - custoManut;
  const paybackPeriodos = eq.custoPeriodo > 0 ? Math.ceil(eq.valor / eq.custoPeriodo) : 0;
  const pctRecup = eq.valor > 0 ? Math.min(100, (totalFaturado / eq.valor) * 100) : 0;

  // Receita acumulada vs valor (por mês, últimos 12 meses)
  const receitaAcumulada = useMemo(() => {
    const now = new Date();
    const bucket: { mes: string; date: Date; receita: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      bucket.push({ mes: chaveMes(d), date: d, receita: 0 });
    }
    emprestimos.forEach(e => {
      const d = new Date(e.dataInicio);
      const idx = bucket.findIndex(b => b.date.getFullYear() === d.getFullYear() && b.date.getMonth() === d.getMonth());
      if (idx >= 0) bucket[idx].receita += e.custoTotal;
    });
    let acc = 0;
    return bucket.map(b => { acc += b.receita; return { mes: b.mes, acumulado: acc, valor: eq.valor }; });
  }, [emprestimos, eq.valor]);

  // Custo manutenção por mês (últimos 12)
  const custoManutMes = useMemo(() => {
    const now = new Date();
    const bucket: { mes: string; date: Date; custo: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      bucket.push({ mes: chaveMes(d), date: d, custo: 0 });
    }
    manutencoes.forEach(m => {
      const d = new Date(m.data);
      const idx = bucket.findIndex(b => b.date.getFullYear() === d.getFullYear() && b.date.getMonth() === d.getMonth());
      if (idx >= 0) bucket[idx].custo += m.custo;
    });
    return bucket.map(({ mes, custo }) => ({ mes, custo }));
  }, [manutencoes]);

  // Donut: dias em uso vs manutenção vs disponível
  const statusDist = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    const diasUso = emprestimos.reduce((a, e) => a + diffDias(e.dataInicio, e.dataDevolucaoReal || e.dataDevolucaoPrevista), 0);
    const diasManut = manutencoes.reduce((a, m) => a + diffDias(m.data, m.dataFim || hoje), 0);
    const datas = [
      ...emprestimos.map(e => e.dataInicio),
      ...manutencoes.map(m => m.data),
    ].filter(Boolean).sort();
    const inicio = datas[0] || hoje;
    const totalDias = Math.max(1, diffDias(inicio, hoje));
    const diasDisp = Math.max(0, totalDias - diasUso - diasManut);
    const total = diasUso + diasManut + diasDisp || 1;
    return [
      { name: "Em uso", value: diasUso, pct: (diasUso / total) * 100, color: "#213368" },
      { name: "Manutenção", value: diasManut, pct: (diasManut / total) * 100, color: "#f59e0b" },
      { name: "Disponível", value: diasDisp, pct: (diasDisp / total) * 100, color: "#22c55e" },
    ].filter(d => d.value > 0);
  }, [emprestimos, manutencoes]);

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
    toast.success("Manutenção registrada");
    setOpenMn(false); setMnDesc(""); setMnCusto("");
  };

  const encerrarManut = (mnId: string) => {
    equipActions.fecharManutencao(mnId, new Date().toISOString().slice(0, 10));
    toast.success("Manutenção encerrada");
  };

  const totalPeriodosEmp = emprestimos.reduce((a, e) => {
    const fim = e.dataDevolucaoReal || e.dataDevolucaoPrevista;
    return a + periodos(e.dataInicio, fim, e.unidade);
  }, 0);

  return (
    <div className="space-y-6 font-[Montserrat]">
      {/* Header */}
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/app/equipamentos" })}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
            </Button>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[#F37032]">{eq.codigo}</div>
              <h2 className="text-2xl font-extrabold text-[#213368]">{eq.nome}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{eq.categoria}</span>
                <span>·</span>
                <span>📍 {eq.localAtual || "—"}</span>
                {eq.responsavelAtual && (<><span>·</span><span>👤 {eq.responsavelAtual}</span></>)}
              </div>
              <div className="mt-2"><StatusBadge status={eq.status} /></div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setOpenEdit(true)}>
              <Pencil className="mr-1 h-4 w-4" /> Editar
            </Button>
            <Button
              onClick={() => setOpenEmp(true)}
              disabled={eq.status !== "Disponível"}
              className="bg-[#213368] text-white hover:bg-[#2a4185]"
            >
              <PackageOpen className="mr-1 h-4 w-4" /> Registrar empréstimo
            </Button>
            <Button onClick={() => setOpenMn(true)} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
              <Wrench className="mr-1 h-4 w-4" /> Registrar manutenção
            </Button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Valor do equipamento</div>
          <div className="mt-1 text-xl font-extrabold text-[#213368]">{brl(eq.valor)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total faturado</div>
          <div className="mt-1 text-xl font-extrabold text-[#F37032]">{brl(totalFaturado)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Custo manutenções</div>
          <div className="mt-1 text-xl font-extrabold text-amber-600">{brl(custoManut)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Payback</div>
          <div className="mt-1 text-xl font-extrabold text-[#213368]">{paybackPeriodos} {eq.unidade}(s)</div>
          <div className="text-[10px] text-muted-foreground">{brl(eq.custoPeriodo)}/{eq.unidade}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">% payback recuperado</div>
          <div className="mt-1 text-xl font-extrabold text-[#213368]">{pctRecup.toFixed(1)}%</div>
          <Progress value={pctRecup} className="mt-2 h-2" />
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Resultado líquido</div>
          <div className={`mt-1 text-xl font-extrabold ${liquido >= 0 ? "text-green-600" : "text-red-600"}`}>{brl(liquido)}</div>
        </Card>
      </div>

      <Tabs defaultValue="dash">
        <TabsList>
          <TabsTrigger value="dash">Dashboard</TabsTrigger>
          <TabsTrigger value="hist">Histórico de empréstimos</TabsTrigger>
          <TabsTrigger value="manut">Manutenções</TabsTrigger>
        </TabsList>

        {/* Dashboard */}
        <TabsContent value="dash" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <div className="mb-2 text-sm font-semibold text-[#213368]">Receita acumulada vs. valor do equipamento</div>
              <div className="h-72">
                <ResponsiveContainer>
                  <LineChart data={receitaAcumulada}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => brl(v)} />
                    <Legend />
                    <ReferenceLine y={eq.valor} stroke="#F37032" strokeDasharray="5 5" label={{ value: "Valor", position: "right", fill: "#F37032", fontSize: 11 }} />
                    <Line type="monotone" dataKey="acumulado" name="Receita acumulada" stroke="#213368" strokeWidth={3} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-4">
              <div className="mb-2 text-sm font-semibold text-[#213368]">Custo de manutenção por mês</div>
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={custoManutMes}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => brl(v)} />
                    <Bar dataKey="custo" name="Manutenção" fill="#F37032" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="mb-2 text-sm font-semibold text-[#213368]">Tempo em uso vs. disponível vs. manutenção</div>
            <div className="h-72">
              {statusDist.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem histórico suficiente.</div>
              ) : (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={statusDist} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={2}
                      label={(e: { name: string; pct: number }) => `${e.name} ${e.pct.toFixed(0)}%`}>
                      {statusDist.map(d => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => `${v} dias`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* Histórico empréstimos */}
        <TabsContent value="hist" className="mt-4">
          <Card className="p-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Destino</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Data início</TableHead>
                  <TableHead>Devolução</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Custo total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {emprestimos.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Sem empréstimos registrados.</TableCell></TableRow>
                  )}
                  {emprestimos.slice().reverse().map(e => {
                    const fim = e.dataDevolucaoReal || e.dataDevolucaoPrevista;
                    const p = periodos(e.dataInicio, fim, e.unidade);
                    return (
                      <TableRow key={e.id}>
                        <TableCell>{e.destino}</TableCell>
                        <TableCell>{e.responsavel}</TableCell>
                        <TableCell>{fmtDate(e.dataInicio)}</TableCell>
                        <TableCell>{fmtDate(e.dataDevolucaoReal || e.dataDevolucaoPrevista)}{!e.dataDevolucaoReal && <span className="ml-1 text-[10px] text-muted-foreground">(prev.)</span>}</TableCell>
                        <TableCell>{p} {e.unidade}(s)</TableCell>
                        <TableCell className="font-semibold text-[#F37032]">{brl(e.custoTotal)}</TableCell>
                        <TableCell><StatusBadge status={e.ativo ? "Em uso" : "Concluído"} /></TableCell>
                        <TableCell>
                          {e.ativo && (
                            <Button size="sm" variant="ghost" title="Registrar devolução" onClick={() => setOpenDev(e.id)}>
                              <PackageCheck className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                {emprestimos.length > 0 && (
                  <tfoot>
                    <tr className="border-t bg-[#F4F4F4] font-semibold">
                      <td className="p-3" colSpan={4}>Totais ({emprestimos.length} empréstimo{emprestimos.length > 1 ? "s" : ""})</td>
                      <td className="p-3">{totalPeriodosEmp}</td>
                      <td className="p-3 text-[#F37032]">{brl(totalFaturado)}</td>
                      <td className="p-3" colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Manutenções */}
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
                    <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Sem manutenções registradas.</TableCell></TableRow>
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
                {manutencoes.length > 0 && (
                  <tfoot>
                    <tr className="border-t bg-[#F4F4F4] font-semibold">
                      <td className="p-3" colSpan={3}>Total ({manutencoes.length} manutenção{manutencoes.length > 1 ? "ões" : ""})</td>
                      <td className="p-3 text-amber-600">{brl(custoManut)}</td>
                      <td className="p-3" colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </Table>
            </div>
          </Card>
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
            <Button onClick={() => openDev && devolver(openDev)} className="bg-[#213368] text-white hover:bg-[#2a4185]">Confirmar</Button>
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

      {/* Empréstimo */}
      <EmprestimoDialog open={openEmp} onOpenChange={setOpenEmp} equipamentoId={eq.id} />

      {/* Editar */}
      <EditarDialog open={openEdit} onOpenChange={setOpenEdit} equipamentoId={eq.id} />
    </div>
  );
}

function EmprestimoDialog({ open, onOpenChange, equipamentoId }: { open: boolean; onOpenChange: (v: boolean) => void; equipamentoId: string }) {
  const eq = useEquipStore(s => s.equipamentos.find(e => e.id === equipamentoId));
  const [destino, setDestino] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [inicio, setInicio] = useState(new Date().toISOString().slice(0, 10));
  const [fim, setFim] = useState("");
  const [custo, setCusto] = useState<string>(eq ? String(eq.custoPeriodo) : "");
  const [unidade, setUnidade] = useState<UnidadePeriodo>(eq?.unidade ?? "dia");
  const [obs, setObs] = useState("");

  if (!eq) return null;
  const custoNum = Number(custo) || 0;
  const p = periodos(inicio, fim, unidade);
  const total = p * custoNum;

  const salvar = () => {
    if (!destino.trim() || !responsavel.trim()) return toast.error("Informe destino e responsável");
    if (!inicio || !fim) return toast.error("Informe as datas");
    equipActions.registrarEmprestimo({
      equipamentoId, destino, responsavel, dataInicio: inicio, dataDevolucaoPrevista: fim,
      custoPeriodo: custoNum, unidade, observacoes: obs,
    });
    toast.success("Empréstimo registrado");
    onOpenChange(false);
    setDestino(""); setResponsavel(""); setFim(""); setObs("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Registrar empréstimo — {eq.nome}</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label>Destino (obra ou pessoa) *</Label><Input value={destino} onChange={e => setDestino(e.target.value)} /></div>
          <div><Label>Responsável *</Label><Input value={responsavel} onChange={e => setResponsavel(e.target.value)} /></div>
          <div><Label>Data de início *</Label><Input type="date" value={inicio} onChange={e => setInicio(e.target.value)} /></div>
          <div><Label>Devolução prevista *</Label><Input type="date" value={fim} onChange={e => setFim(e.target.value)} /></div>
          <div><Label>Custo por período (R$)</Label><Input inputMode="numeric" value={custo} onChange={e => setCusto(e.target.value)} /></div>
          <div>
            <Label>Unidade</Label>
            <Select value={unidade} onValueChange={v => setUnidade(v as UnidadePeriodo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{UNIDADES.map(u => <SelectItem key={u} value={u}>por {u}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2"><Label>Observações</Label><Textarea rows={2} value={obs} onChange={e => setObs(e.target.value)} /></div>
          <div className="md:col-span-2 rounded-lg bg-[#F4F4F4] p-4 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Períodos ({unidade})</span><b>{p}</b></div>
            <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Custo total previsto</span><b className="text-[#213368]">{brl(total)}</b></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} className="bg-[#F37032] text-white hover:bg-[#ff8850]">Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditarDialog({ open, onOpenChange, equipamentoId }: { open: boolean; onOpenChange: (v: boolean) => void; equipamentoId: string }) {
  const eq = useEquipStore(s => s.equipamentos.find(e => e.id === equipamentoId));
  const [nome, setNome] = useState(eq?.nome ?? "");
  const [codigo, setCodigo] = useState(eq?.codigo ?? "");
  const [categoria, setCategoria] = useState(eq?.categoria ?? "");
  const [descricao, setDescricao] = useState(eq?.descricao ?? "");
  const [valor, setValor] = useState(String(eq?.valor ?? ""));
  const [custoPeriodo, setCustoPeriodo] = useState(String(eq?.custoPeriodo ?? ""));
  const [unidade, setUnidade] = useState<UnidadePeriodo>(eq?.unidade ?? "dia");
  const [status, setStatus] = useState<EquipStatus>(eq?.status ?? "Disponível");
  const [localBase, setLocalBase] = useState(eq?.localBase ?? "");

  if (!eq) return null;

  const salvar = () => {
    if (!nome.trim() || !codigo.trim()) return toast.error("Preencha nome e código");
    equipActions.atualizarEquipamento(equipamentoId, {
      nome, codigo, categoria, descricao,
      valor: Number(valor) || 0, custoPeriodo: Number(custoPeriodo) || 0,
      unidade, status, localBase,
    });
    toast.success("Equipamento atualizado");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Editar equipamento</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label>Nome *</Label><Input value={nome} onChange={e => setNome(e.target.value)} /></div>
          <div><Label>Código *</Label><Input value={codigo} onChange={e => setCodigo(e.target.value)} /></div>
          <div><Label>Categoria</Label><Input value={categoria} onChange={e => setCategoria(e.target.value)} /></div>
          <div><Label>Local base</Label><Input value={localBase} onChange={e => setLocalBase(e.target.value)} /></div>
          <div><Label>Valor (R$)</Label><Input inputMode="numeric" value={valor} onChange={e => setValor(e.target.value)} /></div>
          <div><Label>Custo por período (R$)</Label><Input inputMode="numeric" value={custoPeriodo} onChange={e => setCustoPeriodo(e.target.value)} /></div>
          <div>
            <Label>Unidade</Label>
            <Select value={unidade} onValueChange={v => setUnidade(v as UnidadePeriodo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{UNIDADES.map(u => <SelectItem key={u} value={u}>por {u}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={v => setStatus(v as EquipStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2"><Label>Descrição</Label><Textarea rows={2} value={descricao} onChange={e => setDescricao(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} className="bg-[#213368] text-white hover:bg-[#2a4185]">Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
