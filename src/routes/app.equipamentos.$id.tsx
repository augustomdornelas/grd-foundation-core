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
import {
  ChevronLeft, Pencil, PackageOpen, Wrench, PackageCheck, MapPin, User,
  ArrowUpRight, ArrowDownRight, Activity, Package, RotateCcw,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  BarChart, Bar, PieChart, Pie, Cell, ReferenceLine,
} from "recharts";
import { toast } from "sonner";
import { brl } from "@/lib/mock-data";
import {
  useEquipStore, equipActions, periodos,
  type EquipStatus, type UnidadePeriodo, type ManutencaoTipo, type ManutencaoStatus,
} from "@/lib/equipamentos-store";
import { iconeCategoria } from "./app.equipamentos.index";
import { gerarTermoPDF, type TermoData } from "@/lib/termo-pdf";
import { FileText } from "lucide-react";

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
const TIPOS_MN: ManutencaoTipo[] = ["Preventiva", "Corretiva", "Emergencial"];
const STATUS_MN: ManutencaoStatus[] = ["Aberta", "Em andamento", "Concluída"];
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
  const emprestimos = useEquipStore(s => s.emprestimos.filter(e => e.equipamentoId === id)) ?? [];
  const manutencoes = useEquipStore(s => s.manutencoes.filter(m => m.equipamentoId === id)) ?? [];

  // Hooks — SEMPRE chamados antes de qualquer return condicional
  const [openDev, setOpenDev] = useState<string | null>(null);
  const [dataReal, setDataReal] = useState(new Date().toISOString().slice(0, 10));
  const [condicaoDev, setCondicaoDev] = useState("Equipamento devolvido em bom estado, sem avarias aparentes.");
  const [obsDev, setObsDev] = useState("");
  const [previewDev, setPreviewDev] = useState(false);
  const [openMn, setOpenMn] = useState(false);
  const [openEmp, setOpenEmp] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);


  const totalFaturado = emprestimos.reduce((a, e) => a + e.custoTotal, 0);
  const custoManut = manutencoes.reduce((a, m) => a + m.custo, 0);
  const liquido = totalFaturado - custoManut;
  const valorEq = eq?.valor ?? 0;
  const roi = valorEq > 0 ? (liquido / valorEq) * 100 : 0;
  const pctRecup = valorEq > 0 ? Math.min(100, (totalFaturado / valorEq) * 100) : 0;

  const hoje = new Date().toISOString().slice(0, 10);
  const diasUso = emprestimos.reduce((a, e) => a + diffDias(e.dataInicio, e.dataDevolucaoReal || e.dataDevolucaoPrevista), 0);
  const diasManut = manutencoes.reduce((a, m) => a + diffDias(m.data, m.dataFim || hoje), 0);
  const datasBase = [...emprestimos.map(e => e.dataInicio), ...manutencoes.map(m => m.data)].filter(Boolean).sort();
  const totalDias = Math.max(1, diffDias(datasBase[0] || hoje, hoje));
  const diasDisp = Math.max(0, totalDias - diasUso - diasManut);

  // Séries mensais últimos 12
  const series = useMemo(() => {
    const now = new Date();
    const meses: { mes: string; date: Date; receita: number; custo: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      meses.push({ mes: chaveMes(d), date: d, receita: 0, custo: 0 });
    }
    emprestimos.forEach(e => {
      const d = new Date(e.dataInicio);
      const idx = meses.findIndex(b => b.date.getFullYear() === d.getFullYear() && b.date.getMonth() === d.getMonth());
      if (idx >= 0) meses[idx].receita += e.custoTotal;
    });
    manutencoes.forEach(m => {
      const d = new Date(m.data);
      const idx = meses.findIndex(b => b.date.getFullYear() === d.getFullYear() && b.date.getMonth() === d.getMonth());
      if (idx >= 0) meses[idx].custo += m.custo;
    });
    let acc = 0;
    return meses.map(b => { acc += b.receita; return { mes: b.mes, receita: b.receita, custo: b.custo, acumulado: acc }; });
  }, [emprestimos, manutencoes]);

  const statusDist = useMemo(() => {
    const total = diasUso + diasManut + diasDisp || 1;
    return [
      { name: "Em uso", value: diasUso, pct: (diasUso / total) * 100, color: "#213368" },
      { name: "Manutenção", value: diasManut, pct: (diasManut / total) * 100, color: "#F37032" },
      { name: "Disponível", value: diasDisp, pct: (diasDisp / total) * 100, color: "#22c55e" },
    ].filter(d => d.value > 0);
  }, [diasUso, diasManut, diasDisp]);

  const timeline = useMemo(() => {
    const items: { tipo: "emp" | "dev" | "manut" | "manut-fim"; data: string; titulo: string; sub: string; cor: string; icone: any }[] = [];
    emprestimos.forEach(e => {
      items.push({ tipo: "emp", data: e.dataInicio, titulo: `Empréstimo → ${e.destino}`, sub: `Responsável: ${e.responsavel} · ${brl(e.custoTotal)}`, cor: "#213368", icone: PackageOpen });
      if (e.dataDevolucaoReal) items.push({ tipo: "dev", data: e.dataDevolucaoReal, titulo: `Devolução`, sub: `De ${e.destino}`, cor: "#16a34a", icone: PackageCheck });
    });
    manutencoes.forEach(m => {
      items.push({ tipo: "manut", data: m.data, titulo: `Manutenção ${m.tipo}`, sub: `${m.oficina || "—"} · ${brl(m.custo)}`, cor: "#F37032", icone: Wrench });
      if (m.dataFim) items.push({ tipo: "manut-fim", data: m.dataFim, titulo: `Manutenção concluída`, sub: m.descricao, cor: "#22c55e", icone: RotateCcw });
    });
    return items.sort((a, b) => b.data.localeCompare(a.data));
  }, [emprestimos, manutencoes]);

  // Loading state — todos os hooks já foram chamados acima
  if (!eq) {
    return (
      <div className="space-y-4 p-6 font-[Montserrat] animate-fade-in">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/app/equipamentos" })}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
        </Button>
        <Card className="p-8">
          <div className="mx-auto max-w-md space-y-3 text-center">
            <div className="mx-auto h-12 w-12 animate-pulse rounded-full bg-[#F4F4F4]" />
            <div className="mx-auto h-4 w-40 animate-pulse rounded bg-[#F4F4F4]" />
            <div className="mx-auto h-3 w-64 animate-pulse rounded bg-[#F4F4F4]" />
            <p className="pt-4 text-xs text-muted-foreground">Carregando equipamento…</p>
          </div>
        </Card>
      </div>
    );
  }

  const Ico = iconeCategoria(eq.categoria);
  const empDev = emprestimos.find(e => e.id === openDev) || null;
  const numeroDoc = (prefix: string) => `${prefix}-${eq.codigo}-${Date.now().toString().slice(-6)}`;


  const salvarDevolucao = (comPdf: boolean) => {
    if (!empDev) return;
    equipActions.registrarDevolucao(empDev.id, dataReal);
    if (comPdf) {
      const periodoEfetivo = periodos(empDev.dataInicio, dataReal, empDev.unidade);
      const custoFinal = periodoEfetivo * empDev.custoPeriodo;
      const termo: TermoData = {
        tipo: "devolucao",
        numero: numeroDoc("DEV"),
        emissao: new Date().toISOString().slice(0, 10),
        equipamento: { nome: eq.nome, codigo: eq.codigo, categoria: eq.categoria, descricao: eq.descricao },
        destino: empDev.destino,
        responsavel: empDev.responsavel,
        dataInicio: empDev.dataInicio,
        dataDevolucaoReal: dataReal,
        periodoEfetivo,
        custoTotalFinal: custoFinal,
        unidade: empDev.unidade,
        condicao: condicaoDev,
        observacoes: obsDev,
      };
      gerarTermoPDF(termo).catch(() => toast.error("Falha ao gerar PDF"));
    }
    toast.success("Devolução registrada");
    setPreviewDev(false);
    setOpenDev(null);
    setObsDev("");
  };

  const encerrarManut = (mnId: string) => {
    equipActions.fecharManutencao(mnId, new Date().toISOString().slice(0, 10));
    toast.success("Manutenção encerrada");
  };

  const totalPeriodosEmp = emprestimos.reduce((a, e) => a + periodos(e.dataInicio, e.dataDevolucaoReal || e.dataDevolucaoPrevista, e.unidade), 0);

  return (
    <div className="space-y-6 font-[Montserrat] animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/app/equipamentos" })}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
        </Button>
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* COLUNA ESQUERDA */}
        <div className="space-y-4 lg:col-span-1">
          <Card className="overflow-hidden">
            <div className="flex h-44 items-center justify-center bg-gradient-to-br from-[#213368] to-[#2a4185]">
              <Ico className="h-24 w-24 text-white/90" strokeWidth={1.2} />
            </div>
            <div className="space-y-3 p-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#F37032]">{eq.codigo} · {eq.categoria}</div>
                <h1 className="text-xl font-extrabold text-[#213368]">{eq.nome}</h1>
              </div>
              {eq.descricao && <p className="text-sm text-muted-foreground">{eq.descricao}</p>}
              <div className="space-y-1.5 border-t pt-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" /> Local base: <span className="text-foreground">{eq.localBase || "—"}</span></div>
                <div className="flex items-center gap-2 text-muted-foreground"><Activity className="h-4 w-4" /> Local atual: <span className="text-foreground">{eq.localAtual || "—"}</span></div>
                {eq.responsavelAtual && <div className="flex items-center gap-2 text-muted-foreground"><User className="h-4 w-4" /> Resp.: <span className="text-foreground">{eq.responsavelAtual}</span></div>}
              </div>
              <div><StatusBadge status={eq.status} /></div>
            </div>
          </Card>

          {/* KPIs financeiros */}
          <Card className="space-y-3 p-5">
            <div className="text-sm font-bold text-[#213368]">Resumo financeiro</div>
            <KpiRow label="Valor do equipamento" value={brl(eq.valor)} />
            <KpiRow label="Total gerado" value={brl(totalFaturado)} color="#F37032" icon={ArrowUpRight} />
            <KpiRow label="Custo de manutenções" value={brl(custoManut)} color="#dc2626" icon={ArrowDownRight} />
            <div className="border-t pt-3">
              <KpiRow label="Resultado líquido" value={brl(liquido)} color={liquido >= 0 ? "#16a34a" : "#dc2626"} bold />
              <KpiRow label="ROI" value={`${roi.toFixed(1)}%`} color={roi >= 0 ? "#16a34a" : "#dc2626"} bold />
            </div>

            <div className="border-t pt-3">
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-muted-foreground">Payback</span>
                <span className="font-semibold text-[#213368]">{pctRecup.toFixed(1)}%</span>
              </div>
              <Progress value={pctRecup} className="h-2" />
              <div className="mt-1 text-[11px] text-muted-foreground">Recuperado {brl(totalFaturado)} de {brl(eq.valor)}</div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t pt-3 text-center">
              <div>
                <div className="text-[11px] text-muted-foreground">Dias em uso</div>
                <div className="text-lg font-extrabold text-[#213368]">{diasUso}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">Dias disponíveis</div>
                <div className="text-lg font-extrabold text-green-600">{diasDisp}</div>
              </div>
            </div>
          </Card>
        </div>

        {/* COLUNA DIREITA — gráficos */}
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-4">
            <div className="mb-2 text-sm font-semibold text-[#213368]">Receita acumulada vs. valor do equipamento</div>
            <div className="h-64">
              <ResponsiveContainer>
                <AreaChart data={series}>
                  <defs>
                    <linearGradient id="gAcum" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#213368" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#213368" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => brl(v)} />
                  <Legend />
                  <ReferenceLine y={eq.valor} stroke="#F37032" strokeDasharray="5 5" label={{ value: "Valor", position: "right", fill: "#F37032", fontSize: 11 }} />
                  <Area type="monotone" dataKey="acumulado" name="Receita acumulada" stroke="#213368" strokeWidth={2.5} fill="url(#gAcum)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-4">
              <div className="mb-2 text-sm font-semibold text-[#213368]">Receita por mês</div>
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => brl(v)} />
                    <Bar dataKey="receita" fill="#F37032" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-4">
              <div className="mb-2 text-sm font-semibold text-[#213368]">Custo de manutenção por mês</div>
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => brl(v)} />
                    <Bar dataKey="custo" fill="#dc2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="mb-2 text-sm font-semibold text-[#213368]">Distribuição de tempo</div>
            <div className="h-56">
              {statusDist.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem histórico suficiente.</div>
              ) : (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={statusDist} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}
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
        </div>
      </div>

      {/* ABAS */}
      <Tabs defaultValue="emp">
        <TabsList>
          <TabsTrigger value="emp">Empréstimos</TabsTrigger>
          <TabsTrigger value="manut">Manutenções</TabsTrigger>
          <TabsTrigger value="hist">Histórico completo</TabsTrigger>
        </TabsList>

        {/* Empréstimos */}
        <TabsContent value="emp" className="mt-4">
          <Card className="p-4">
            <div className="mb-3 flex justify-end">
              <Button onClick={() => setOpenEmp(true)} disabled={eq.status !== "Disponível"} className="bg-[#213368] text-white hover:bg-[#2a4185]">
                <PackageOpen className="mr-1 h-4 w-4" /> Registrar empréstimo
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Destino</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Devolução prev.</TableHead>
                  <TableHead>Devolução real</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Custo/{eq.unidade}</TableHead>
                  <TableHead>Custo total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {emprestimos.length === 0 && (
                    <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">Sem empréstimos registrados.</TableCell></TableRow>
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
                        <TableCell>{brl(e.custoPeriodo)}</TableCell>
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
                      <td className="p-3" colSpan={5}>Totais ({emprestimos.length})</td>
                      <td className="p-3">{totalPeriodosEmp}</td>
                      <td className="p-3"></td>
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
            <div className="mb-3 flex justify-end">
              <Button onClick={() => setOpenMn(true)} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
                <Wrench className="mr-1 h-4 w-4" /> Registrar manutenção
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Oficina/Resp.</TableHead>
                  <TableHead>Peças</TableHead>
                  <TableHead>Mão de obra</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {manutencoes.length === 0 && (
                    <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">Sem manutenções registradas.</TableCell></TableRow>
                  )}
                  {manutencoes.slice().reverse().map(m => (
                    <TableRow key={m.id}>
                      <TableCell>{fmtDate(m.data)}</TableCell>
                      <TableCell>{fmtDate(m.dataFim)}</TableCell>
                      <TableCell><StatusBadge status={m.tipo} /></TableCell>
                      <TableCell className="max-w-[240px] truncate" title={m.descricao}>{m.descricao}</TableCell>
                      <TableCell>{m.oficina || "—"}</TableCell>
                      <TableCell>{brl(m.custoPecas)}</TableCell>
                      <TableCell>{brl(m.custoMaoObra)}</TableCell>
                      <TableCell className="font-semibold text-[#dc2626]">{brl(m.custo)}</TableCell>
                      <TableCell><StatusBadge status={m.statusManut} /></TableCell>
                      <TableCell>
                        {m.statusManut !== "Concluída" && (
                          <Button size="sm" variant="outline" onClick={() => encerrarManut(m.id)}>Encerrar</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {manutencoes.length > 0 && (
                  <tfoot>
                    <tr className="border-t bg-[#F4F4F4] font-semibold">
                      <td className="p-3" colSpan={5}>Total ({manutencoes.length})</td>
                      <td className="p-3">{brl(manutencoes.reduce((a, m) => a + m.custoPecas, 0))}</td>
                      <td className="p-3">{brl(manutencoes.reduce((a, m) => a + m.custoMaoObra, 0))}</td>
                      <td className="p-3 text-[#dc2626]">{brl(custoManut)}</td>
                      <td className="p-3" colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Histórico completo */}
        <TabsContent value="hist" className="mt-4">
          <Card className="p-6">
            {timeline.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Sem eventos registrados.</div>
            ) : (
              <ol className="relative border-l-2 border-[#F4F4F4] pl-6">
                {timeline.map((ev, i) => {
                  const Ic = ev.icone;
                  return (
                    <li key={i} className="mb-6 last:mb-0">
                      <span className="absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full text-white shadow" style={{ backgroundColor: ev.cor }}>
                        <Ic className="h-3.5 w-3.5" />
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-bold text-[#213368]">{ev.titulo}</div>
                        <div className="text-xs text-muted-foreground">· {fmtDate(ev.data)}</div>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{ev.sub}</div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Devolução — passo 1: data */}
      <Dialog open={!!openDev && !previewDev} onOpenChange={(v) => { if (!v) setOpenDev(null); }}>
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
            <Button onClick={() => setPreviewDev(true)} className="bg-[#213368] text-white hover:bg-[#2a4185]">Continuar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Devolução — passo 2: preview do termo */}
      <Dialog open={previewDev} onOpenChange={(v) => { if (!v) { setPreviewDev(false); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="text-[#213368]">Prévia — Termo de Devolução</DialogTitle></DialogHeader>
          {empDev && (
            <div className="grid gap-3">
              <div className="grid gap-2 rounded-lg bg-[#F4F4F4] p-4 text-sm md:grid-cols-2">
                <div><b className="text-[#213368]">Equipamento:</b> {eq.nome} ({eq.codigo})</div>
                <div><b className="text-[#213368]">Categoria:</b> {eq.categoria}</div>
                <div><b className="text-[#213368]">Destino:</b> {empDev.destino}</div>
                <div><b className="text-[#213368]">Responsável:</b> {empDev.responsavel}</div>
                <div><b className="text-[#213368]">Saída:</b> {fmtDate(empDev.dataInicio)}</div>
                <div><b className="text-[#213368]">Devolução real:</b> {fmtDate(dataReal)}</div>
                <div><b className="text-[#213368]">Período efetivo:</b> {periodos(empDev.dataInicio, dataReal, empDev.unidade)} {empDev.unidade}(s)</div>
                <div><b className="text-[#213368]">Custo final:</b> <span className="text-[#F37032] font-semibold">{brl(periodos(empDev.dataInicio, dataReal, empDev.unidade) * empDev.custoPeriodo)}</span></div>
              </div>
              <div>
                <Label>Condição do equipamento na devolução</Label>
                <Textarea rows={3} value={condicaoDev} onChange={e => setCondicaoDev(e.target.value)} />
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea rows={3} value={obsDev} onChange={e => setObsDev(e.target.value)} placeholder="Ex.: acessórios devolvidos, pendências, etc." />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPreviewDev(false)}>Voltar</Button>
            <Button variant="outline" onClick={() => salvarDevolucao(false)}>Salvar sem PDF</Button>
            <Button onClick={() => salvarDevolucao(true)} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
              <FileText className="mr-1 h-4 w-4" /> Gerar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Manutenção */}
      <ManutencaoDialog open={openMn} onOpenChange={setOpenMn} equipamentoId={eq.id} />

      {/* Empréstimo */}
      <EmprestimoDialog open={openEmp} onOpenChange={setOpenEmp} equipamentoId={eq.id} />

      {/* Editar */}
      <EditarDialog open={openEdit} onOpenChange={setOpenEdit} equipamentoId={eq.id} />
    </div>
  );
}

function KpiRow({ label, value, color, bold, icon: Icon }: { label: string; value: string; color?: string; bold?: boolean; icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" style={{ color }} />}
        {label}
      </span>
      <span className={bold ? "text-base font-extrabold" : "font-semibold"} style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

function ManutencaoDialog({ open, onOpenChange, equipamentoId }: { open: boolean; onOpenChange: (v: boolean) => void; equipamentoId: string }) {
  const [tipo, setTipo] = useState<ManutencaoTipo>("Preventiva");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [dataFim, setDataFim] = useState("");
  const [descricao, setDescricao] = useState("");
  const [oficina, setOficina] = useState("");
  const [pecas, setPecas] = useState("");
  const [mo, setMo] = useState("");
  const [status, setStatus] = useState<ManutencaoStatus>("Aberta");
  const [obs, setObs] = useState("");

  const total = (Number(pecas) || 0) + (Number(mo) || 0);

  const salvar = () => {
    if (!descricao.trim()) return toast.error("Descreva a manutenção");
    equipActions.registrarManutencao({
      equipamentoId, tipo, data, dataFim: dataFim || undefined,
      descricao, oficina, custoPecas: Number(pecas) || 0, custoMaoObra: Number(mo) || 0,
      statusManut: status, observacoes: obs || undefined,
    });
    toast.success("Manutenção registrada");
    onOpenChange(false);
    setDescricao(""); setOficina(""); setPecas(""); setMo(""); setObs(""); setDataFim(""); setStatus("Aberta"); setTipo("Preventiva");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Registrar manutenção</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Tipo *</Label>
            <Select value={tipo} onValueChange={v => setTipo(v as ManutencaoTipo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS_MN.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status *</Label>
            <Select value={status} onValueChange={v => setStatus(v as ManutencaoStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_MN.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Data de início *</Label><Input type="date" value={data} onChange={e => setData(e.target.value)} /></div>
          <div><Label>Data fim (prevista ou real)</Label><Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} /></div>
          <div className="md:col-span-2"><Label>Descrição detalhada *</Label><Textarea rows={3} value={descricao} onChange={e => setDescricao(e.target.value)} /></div>
          <div className="md:col-span-2"><Label>Oficina / responsável</Label><Input value={oficina} onChange={e => setOficina(e.target.value)} placeholder="Ex.: Oficina Central – João Silva" /></div>
          <div><Label>Custo de peças (R$)</Label><Input inputMode="numeric" value={pecas} onChange={e => setPecas(e.target.value)} /></div>
          <div><Label>Custo de mão de obra (R$)</Label><Input inputMode="numeric" value={mo} onChange={e => setMo(e.target.value)} /></div>
          <div className="md:col-span-2"><Label>Observações</Label><Textarea rows={2} value={obs} onChange={e => setObs(e.target.value)} /></div>
          <div className="md:col-span-2 flex justify-between rounded-lg bg-[#F4F4F4] p-4 text-sm">
            <span className="text-muted-foreground">Custo total</span>
            <b className="text-[#dc2626]">{brl(total)}</b>
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

function EmprestimoDialog({ open, onOpenChange, equipamentoId }: { open: boolean; onOpenChange: (v: boolean) => void; equipamentoId: string }) {
  const eq = useEquipStore(s => s.equipamentos.find(e => e.id === equipamentoId));
  const [destino, setDestino] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [inicio, setInicio] = useState(new Date().toISOString().slice(0, 10));
  const [fim, setFim] = useState("");
  const [custo, setCusto] = useState<string>(eq ? String(eq.custoPeriodo) : "");
  const [unidade, setUnidade] = useState<UnidadePeriodo>(eq?.unidade ?? "dia");
  const [obs, setObs] = useState("");
  const [preview, setPreview] = useState(false);

  if (!eq) return null;
  const custoNum = Number(custo) || 0;
  const p = periodos(inicio, fim, unidade);
  const total = p * custoNum;

  const reset = () => {
    setDestino(""); setResponsavel(""); setFim(""); setObs(""); setPreview(false);
  };

  const irParaPreview = () => {
    if (!destino.trim() || !responsavel.trim()) return toast.error("Informe destino e responsável");
    if (!inicio || !fim) return toast.error("Informe as datas");
    setPreview(true);
  };

  const salvar = (comPdf: boolean) => {
    equipActions.registrarEmprestimo({
      equipamentoId, destino, responsavel, dataInicio: inicio, dataDevolucaoPrevista: fim,
      custoPeriodo: custoNum, unidade, observacoes: obs,
    });
    if (comPdf) {
      const termo: TermoData = {
        tipo: "emprestimo",
        numero: `EMP-${eq.codigo}-${Date.now().toString().slice(-6)}`,
        emissao: new Date().toISOString().slice(0, 10),
        equipamento: { nome: eq.nome, codigo: eq.codigo, categoria: eq.categoria, descricao: eq.descricao },
        destino, responsavel,
        dataInicio: inicio,
        dataDevolucaoPrevista: fim,
        custoPeriodo: custoNum,
        unidade,
        custoTotalPrevisto: total,
        observacoes: obs,
      };
      gerarTermoPDF(termo).catch(() => toast.error("Falha ao gerar PDF"));
    }
    toast.success("Empréstimo registrado");
    onOpenChange(false);
    reset();
  };

  return (
    <>
      <Dialog open={open && !preview} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Registrar empréstimo — {eq.nome}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label>Destino *</Label><Input value={destino} onChange={e => setDestino(e.target.value)} /></div>
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
            <Button onClick={irParaPreview} className="bg-[#F37032] text-white hover:bg-[#ff8850]">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={preview} onOpenChange={(v) => { if (!v) setPreview(false); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="text-[#213368]">Prévia — Termo de Empréstimo</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2 rounded-lg bg-[#F4F4F4] p-4 text-sm md:grid-cols-2">
              <div><b className="text-[#213368]">Equipamento:</b> {eq.nome} ({eq.codigo})</div>
              <div><b className="text-[#213368]">Categoria:</b> {eq.categoria}</div>
              <div><b className="text-[#213368]">Destino/Obra:</b> {destino}</div>
              <div><b className="text-[#213368]">Responsável:</b> {responsavel}</div>
              <div><b className="text-[#213368]">Saída:</b> {inicio.split("-").reverse().join("/")}</div>
              <div><b className="text-[#213368]">Devolução prev.:</b> {fim.split("-").reverse().join("/")}</div>
              <div><b className="text-[#213368]">Custo/{unidade}:</b> {brl(custoNum)}</div>
              <div><b className="text-[#213368]">Total previsto:</b> <span className="text-[#F37032] font-semibold">{brl(total)}</span></div>
            </div>
            <div>
              <Label>Observações (aparecem no termo)</Label>
              <Textarea rows={4} value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: acessórios inclusos, condições de uso, etc." />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPreview(false)}>Voltar</Button>
            <Button variant="outline" onClick={() => salvar(false)}>Salvar sem PDF</Button>
            <Button onClick={() => salvar(true)} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
              <FileText className="mr-1 h-4 w-4" /> Gerar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
