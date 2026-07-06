import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/mock-data";
import { useProjetosStore, projetosActions, resumoProjeto } from "@/lib/projetos-store";

export const Route = createFileRoute("/app/projetos/$id")({
  component: ProjetoDetalhe,
  notFoundComponent: () => (
    <div className="p-8 text-center">
      <p className="text-muted-foreground">Projeto não encontrado.</p>
      <Link to="/app/projetos" className="mt-4 inline-block text-[#213368] font-semibold">Voltar</Link>
    </div>
  ),
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
});

const hoje = () => new Date().toISOString().slice(0, 10);

function ProjetoDetalhe() {
  const { id } = Route.useParams();
  const p = useProjetosStore(s => s.projetos.find(x => x.id === id));
  const store = useProjetosStore(s => s);
  if (!p) throw notFound();

  const r = resumoProjeto(id, store);

  const [notaOpen, setNotaOpen] = useState(false);
  const [medOpen, setMedOpen] = useState(false);
  const [nota, setNota] = useState({ data: hoje(), descricao: "", tipo: "Insumo" as const, valor: "" });
  const [med, setMed] = useState({ data: hoje(), periodo: "", pct: "", valor: "" });

  const serieFinanceira = useMemo(() => {
    const map = new Map<string, { mes: string; previsto: number; realizado: number }>();
    r.notas.forEach(n => {
      const mes = n.data.slice(0, 7);
      const cur = map.get(mes) ?? { mes, previsto: 0, realizado: 0 };
      cur.realizado += n.valor;
      map.set(mes, cur);
    });
    r.medicoes.forEach(m => {
      const mes = m.data.slice(0, 7);
      const cur = map.get(mes) ?? { mes, previsto: 0, realizado: 0 };
      cur.previsto += m.valor;
      map.set(mes, cur);
    });
    return Array.from(map.values()).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [r.notas, r.medicoes]);

  const submitNota = () => {
    const valor = Number(nota.valor.replace(/\D/g, ""));
    if (!nota.descricao.trim() || !valor) return toast.error("Preencha descrição e valor");
    projetosActions.adicionarNota({ projetoId: id, data: nota.data, descricao: nota.descricao, tipo: nota.tipo, valor });
    toast.success("Nota lançada");
    setNota({ data: hoje(), descricao: "", tipo: "Insumo", valor: "" });
    setNotaOpen(false);
  };
  const submitMed = () => {
    const valor = Number(med.valor.replace(/\D/g, ""));
    const pct = Math.max(0, Math.min(100, Number(med.pct) || 0));
    if (!med.periodo.trim() || !valor) return toast.error("Preencha período e valor");
    projetosActions.adicionarMedicao({ projetoId: id, data: med.data, periodo: med.periodo, pct, valor });
    toast.success("Medição registrada");
    setMed({ data: hoje(), periodo: "", pct: "", valor: "" });
    setMedOpen(false);
  };

  return (
    <div className="space-y-6">
      <Link to="/app/projetos" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-[#213368]">
        <ChevronLeft className="mr-1 h-4 w-4" /> Voltar para projetos
      </Link>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[#F37032]">{p.id}</div>
            <h2 className="mt-1 text-2xl font-extrabold text-[#213368]">{p.nome}</h2>
            <div className="text-sm text-muted-foreground">Cliente: {p.cliente}</div>
          </div>
          <StatusBadge status={p.status} />
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <div className="mb-1 flex justify-between text-xs font-medium"><span>Progresso físico</span><span>{p.progresso}%</span></div>
            <Progress value={p.progresso} />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs font-medium"><span>Financeiro realizado</span><span>{r.financeiro}%</span></div>
            <Progress value={r.financeiro} />
          </div>
        </div>
      </Card>

      <Tabs defaultValue="fin">
        <TabsList>
          <TabsTrigger value="fin">Financeiro</TabsTrigger>
          <TabsTrigger value="notas">Notas</TabsTrigger>
          <TabsTrigger value="med">Medições</TabsTrigger>
        </TabsList>

        <TabsContent value="fin" className="mt-4 grid gap-6 lg:grid-cols-3">
          <Card className="p-6 lg:col-span-2">
            <div className="text-sm font-semibold text-muted-foreground">Medido x Realizado (por mês)</div>
            <div className="mt-4 h-72">
              {serieFinanceira.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem lançamentos ainda.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={serieFinanceira}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="mes" stroke="#6E7280" fontSize={12} />
                    <YAxis stroke="#6E7280" fontSize={12} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => brl(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="previsto" name="Medido" stroke="#213368" strokeWidth={2.5} />
                    <Line type="monotone" dataKey="realizado" name="Gasto (notas)" stroke="#F37032" strokeWidth={2.5} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
          <Card className="p-6">
            <div className="text-sm font-semibold text-muted-foreground">Resumo</div>
            <div className="mt-4 space-y-4">
              <div><div className="text-xs text-muted-foreground">Orçado</div><div className="text-2xl font-extrabold text-[#213368]">{brl(r.orcado)}</div></div>
              <div><div className="text-xs text-muted-foreground">Gasto (notas)</div><div className="text-2xl font-extrabold text-[#F37032]">{brl(r.gasto)}</div></div>
              <div><div className="text-xs text-muted-foreground">Medido</div><div className="text-xl font-bold">{brl(r.medido)}</div></div>
              <div><div className="text-xs text-muted-foreground">Saldo</div><div className="text-xl font-bold">{brl(r.saldo)}</div></div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="notas" className="mt-4">
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-[#213368]">Notas lançadas</h3>
              <Dialog open={notaOpen} onOpenChange={setNotaOpen}>
                <DialogTrigger asChild><Button className="bg-[#F37032] text-white hover:bg-[#ff8850]"><Plus className="mr-1 h-4 w-4" /> Lançar nota</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Nova nota</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>Data</Label><Input type="date" value={nota.data} onChange={e => setNota({ ...nota, data: e.target.value })} /></div>
                    <div><Label>Descrição</Label><Input value={nota.descricao} onChange={e => setNota({ ...nota, descricao: e.target.value })} /></div>
                    <div>
                      <Label>Tipo</Label>
                      <Select value={nota.tipo} onValueChange={v => setNota({ ...nota, tipo: v as typeof nota.tipo })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["Insumo", "Serviço", "Locação", "Mão de obra", "Outro"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Valor (R$)</Label><Input inputMode="numeric" value={nota.valor} onChange={e => setNota({ ...nota, valor: e.target.value })} /></div>
                  </div>
                  <DialogFooter><Button variant="outline" onClick={() => setNotaOpen(false)}>Cancelar</Button><Button onClick={submitNota} className="bg-[#213368] text-white">Salvar</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead>Tipo</TableHead><TableHead>Valor</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {r.notas.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma nota lançada.</TableCell></TableRow>}
                {r.notas.map(n => (
                  <TableRow key={n.id}>
                    <TableCell>{new Date(n.data).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>{n.descricao}</TableCell>
                    <TableCell>{n.tipo}</TableCell>
                    <TableCell className="font-semibold">{brl(n.valor)}</TableCell>
                    <TableCell><Button variant="ghost" size="sm" onClick={() => projetosActions.excluirNota(n.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="med" className="mt-4">
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-[#213368]">Medições</h3>
              <Dialog open={medOpen} onOpenChange={setMedOpen}>
                <DialogTrigger asChild><Button className="bg-[#F37032] text-white hover:bg-[#ff8850]"><Plus className="mr-1 h-4 w-4" /> Nova medição</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Nova medição</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>Data</Label><Input type="date" value={med.data} onChange={e => setMed({ ...med, data: e.target.value })} /></div>
                    <div><Label>Período</Label><Input value={med.periodo} onChange={e => setMed({ ...med, periodo: e.target.value })} placeholder="Ex.: Medição 3 / Junho 2026" /></div>
                    <div><Label>Progresso (%)</Label><Input inputMode="numeric" value={med.pct} onChange={e => setMed({ ...med, pct: e.target.value })} /></div>
                    <div><Label>Valor (R$)</Label><Input inputMode="numeric" value={med.valor} onChange={e => setMed({ ...med, valor: e.target.value })} /></div>
                  </div>
                  <DialogFooter><Button variant="outline" onClick={() => setMedOpen(false)}>Cancelar</Button><Button onClick={submitMed} className="bg-[#213368] text-white">Salvar</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Período</TableHead><TableHead>Progresso</TableHead><TableHead>Valor</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {r.medicoes.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma medição registrada.</TableCell></TableRow>}
                {r.medicoes.map(m => (
                  <TableRow key={m.id}>
                    <TableCell>{new Date(m.data).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="font-semibold">{m.periodo}</TableCell>
                    <TableCell className="w-1/3">
                      <div className="flex items-center gap-3"><Progress value={m.pct} className="flex-1" /><span className="text-xs font-semibold">{m.pct}%</span></div>
                    </TableCell>
                    <TableCell>{brl(m.valor)}</TableCell>
                    <TableCell><Button variant="ghost" size="sm" onClick={() => projetosActions.excluirMedicao(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
