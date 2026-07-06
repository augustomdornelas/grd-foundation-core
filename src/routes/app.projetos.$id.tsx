import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, BarChart, Bar } from "recharts";
import { ChevronLeft, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/mock-data";
import { useProjetosStore, projetosActions, resumoProjeto, type ProjetoStatus } from "@/lib/projetos-store";

export const Route = createFileRoute("/app/projetos/$id")({
  component: ProjetoDetalhe,
  notFoundComponent: () => (
    <div className="p-8 text-center">
      <p className="text-muted-foreground">Projeto não encontrado.</p>
      <Link to="/app/projetos" className="mt-4 inline-block font-semibold text-[#213368]">Voltar</Link>
    </div>
  ),
  errorComponent: ({ error }) => <div className="p-8 text-destructive">{error.message}</div>,
});

const hoje = () => new Date().toISOString().slice(0, 10);
const STATUS_OPTIONS: ProjetoStatus[] = ["Planejamento", "Em andamento", "Paralisado", "Concluído"];

function ProjetoDetalhe() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const p = useProjetosStore(s => s.projetos.find(x => x.id === id));
  const store = useProjetosStore(s => s);
  if (!p) throw notFound();

  const r = resumoProjeto(id, store);

  const [custoOpen, setCustoOpen] = useState(false);
  const [notaOpen, setNotaOpen] = useState(false);
  const [medOpen, setMedOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const [custo, setCusto] = useState({ data: hoje(), descricao: "", categoria: "Insumo" as const, valor: "" });
  const [nota, setNota] = useState({ data: hoje(), numero: "", fornecedor: "", descricao: "", valor: "", status: "Pendente" as const });
  const [med, setMed] = useState({ data: hoje(), periodo: "", pct: "", valor: "", status: "Enviada" as const });
  const [edit, setEdit] = useState({
    nome: p.nome, cliente: p.cliente, local: p.local, descricao: p.descricao, responsavel: p.responsavel,
    dataInicio: p.dataInicio, prazo: p.prazo, status: p.status, orcado: String(p.orcado), progresso: String(p.progresso),
  });

  const serieFinanceira = useMemo(() => {
    const map = new Map<string, { mes: string; previsto: number; realizado: number }>();
    r.custos.forEach(c => {
      const mes = c.data.slice(0, 7);
      const cur = map.get(mes) ?? { mes, previsto: 0, realizado: 0 };
      cur.realizado += c.valor;
      map.set(mes, cur);
    });
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
  }, [r.custos, r.notas, r.medicoes]);

  const curvaS = useMemo(() => {
    const meds = [...r.medicoes].sort((a, b) => a.data.localeCompare(b.data));
    let accFis = 0; let accFin = 0;
    return meds.map(m => {
      accFis = Math.max(accFis, m.pct);
      accFin += m.valor;
      return { periodo: m.periodo, fisico: accFis, financeiro: r.orcado ? Math.round((accFin / r.orcado) * 100) : 0 };
    });
  }, [r.medicoes, r.orcado]);

  const submitCusto = () => {
    const valor = Number(custo.valor.replace(/\D/g, ""));
    if (!custo.descricao.trim() || !valor) return toast.error("Preencha descrição e valor");
    projetosActions.adicionarCusto({ projetoId: id, data: custo.data, descricao: custo.descricao, categoria: custo.categoria, valor });
    toast.success("Custo lançado");
    setCusto({ data: hoje(), descricao: "", categoria: "Insumo", valor: "" });
    setCustoOpen(false);
  };
  const submitNota = () => {
    const valor = Number(nota.valor.replace(/\D/g, ""));
    if (!nota.numero.trim() || !nota.fornecedor.trim() || !valor) return toast.error("Preencha número, fornecedor e valor");
    projetosActions.adicionarNota({ projetoId: id, numero: nota.numero, fornecedor: nota.fornecedor, descricao: nota.descricao, data: nota.data, valor, status: nota.status });
    toast.success("Nota lançada");
    setNota({ data: hoje(), numero: "", fornecedor: "", descricao: "", valor: "", status: "Pendente" });
    setNotaOpen(false);
  };
  const submitMed = () => {
    const valor = Number(med.valor.replace(/\D/g, ""));
    const pct = Math.max(0, Math.min(100, Number(med.pct) || 0));
    if (!med.periodo.trim() || !valor) return toast.error("Preencha período e valor");
    const numero = (r.medicoes.length || 0) + 1;
    projetosActions.adicionarMedicao({ projetoId: id, numero, data: med.data, periodo: med.periodo, pct, valor, status: med.status });
    toast.success("Medição registrada");
    setMed({ data: hoje(), periodo: "", pct: "", valor: "", status: "Enviada" });
    setMedOpen(false);
  };
  const submitEdit = () => {
    if (!edit.nome.trim() || !edit.cliente.trim()) return toast.error("Preencha nome e cliente");
    projetosActions.atualizarProjeto(id, {
      nome: edit.nome, cliente: edit.cliente, local: edit.local, descricao: edit.descricao,
      responsavel: edit.responsavel, dataInicio: edit.dataInicio, prazo: edit.prazo,
      status: edit.status, orcado: Number(String(edit.orcado).replace(/\D/g, "")) || 0,
      progresso: Math.max(0, Math.min(100, Number(edit.progresso) || 0)),
    });
    toast.success("Projeto atualizado");
    setEditOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/app/projetos" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-[#213368]">
          <ChevronLeft className="mr-1 h-4 w-4" /> Voltar para projetos
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="mr-1 h-4 w-4" /> Editar</Button>
          <Button variant="outline" onClick={() => { if (confirm(`Excluir "${p.nome}"?`)) { projetosActions.excluirProjeto(id); toast.success("Projeto excluído"); navigate({ to: "/app/projetos" }); } }}>
            <Trash2 className="mr-1 h-4 w-4 text-destructive" /> Excluir
          </Button>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[#F37032]">{p.id}</div>
            <h2 className="mt-1 text-2xl font-extrabold text-[#213368]">{p.nome}</h2>
            <div className="text-sm text-muted-foreground">{p.cliente} · {p.local}</div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={p.status} />
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Contrato</div>
              <div className="text-xl font-extrabold text-[#213368]">{brl(r.orcado)}</div>
            </div>
          </div>
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <div className="mb-1 flex justify-between text-xs font-medium"><span>Avanço físico</span><span>{p.progresso}%</span></div>
            <Progress value={p.progresso} />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs font-medium"><span>Financeiro realizado</span><span>{r.financeiro}%</span></div>
            <Progress value={r.financeiro} />
          </div>
        </div>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="fin">Financeiro</TabsTrigger>
          <TabsTrigger value="notas">Notas</TabsTrigger>
          <TabsTrigger value="med">Medições</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 grid gap-6 lg:grid-cols-3">
          <Card className="p-6 lg:col-span-2">
            <h3 className="font-bold text-[#213368]">Descrição</h3>
            <p className="mt-2 text-sm text-muted-foreground">{p.descricao || "Sem descrição."}</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Info label="Responsável" value={p.responsavel || "—"} />
              <Info label="Local" value={p.local} />
              <Info label="Início" value={p.dataInicio ? new Date(p.dataInicio).toLocaleDateString("pt-BR") : "—"} />
              <Info label="Prazo" value={p.prazo ? new Date(p.prazo).toLocaleDateString("pt-BR") : "—"} />
            </div>
          </Card>
          <Card className="p-6">
            <h3 className="font-bold text-[#213368]">Indicadores</h3>
            <div className="mt-4 space-y-4">
              <KV label="Contrato" value={brl(r.orcado)} />
              <KV label="Executado (custos + notas)" value={brl(r.gasto)} accent="orange" />
              <KV label="Medido" value={brl(r.medido)} />
              <KV label="Saldo" value={brl(r.saldo)} />
              <KV label="Avanço" value={`${p.progresso}%`} />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="fin" className="mt-4 space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="p-6 lg:col-span-2">
              <div className="text-sm font-semibold text-muted-foreground">Previsto (medido) x Realizado (mensal)</div>
              <div className="mt-4 h-72">
                {serieFinanceira.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem lançamentos ainda.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={serieFinanceira}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis dataKey="mes" stroke="#6E7280" fontSize={12} />
                      <YAxis stroke="#6E7280" fontSize={12} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => brl(v)} />
                      <Legend />
                      <Bar dataKey="previsto" name="Previsto (medido)" fill="#213368" />
                      <Bar dataKey="realizado" name="Realizado (custos+notas)" fill="#F37032" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
            <Card className="p-6">
              <div className="text-sm font-semibold text-muted-foreground">Resumo</div>
              <div className="mt-4 space-y-4">
                <KV label="Contrato" value={brl(r.orcado)} />
                <KV label="Realizado" value={brl(r.gasto)} accent="orange" />
                <KV label="Medido" value={brl(r.medido)} />
                <KV label="Saldo a executar" value={brl(r.saldo)} />
              </div>
            </Card>
          </div>

          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-[#213368]">Curva S — Físico x Financeiro</h3>
            </div>
            <div className="h-72">
              {curvaS.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Registre medições para gerar a curva.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={curvaS}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="periodo" stroke="#6E7280" fontSize={12} />
                    <YAxis stroke="#6E7280" fontSize={12} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <Legend />
                    <Line type="monotone" dataKey="fisico" name="Físico" stroke="#213368" strokeWidth={2.5} />
                    <Line type="monotone" dataKey="financeiro" name="Financeiro" stroke="#F37032" strokeWidth={2.5} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-[#213368]">Custos lançados</h3>
              <Dialog open={custoOpen} onOpenChange={setCustoOpen}>
                <DialogTrigger asChild><Button className="bg-[#F37032] text-white hover:bg-[#ff8850]"><Plus className="mr-1 h-4 w-4" /> Lançar custo</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Novo custo</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>Data</Label><Input type="date" value={custo.data} onChange={e => setCusto({ ...custo, data: e.target.value })} /></div>
                    <div><Label>Descrição</Label><Input value={custo.descricao} onChange={e => setCusto({ ...custo, descricao: e.target.value })} /></div>
                    <div>
                      <Label>Categoria</Label>
                      <Select value={custo.categoria} onValueChange={v => setCusto({ ...custo, categoria: v as typeof custo.categoria })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{["Insumo", "Serviço", "Locação", "Mão de obra", "Outro"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Valor (R$)</Label><Input inputMode="numeric" value={custo.valor} onChange={e => setCusto({ ...custo, valor: e.target.value })} /></div>
                  </div>
                  <DialogFooter><Button variant="outline" onClick={() => setCustoOpen(false)}>Cancelar</Button><Button onClick={submitCusto} className="bg-[#213368] text-white">Salvar</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead>Categoria</TableHead><TableHead>Valor</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {r.custos.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhum custo lançado.</TableCell></TableRow>}
                {r.custos.map(c => (
                  <TableRow key={c.id}>
                    <TableCell>{new Date(c.data).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>{c.descricao}</TableCell>
                    <TableCell>{c.categoria}</TableCell>
                    <TableCell className="font-semibold">{brl(c.valor)}</TableCell>
                    <TableCell><Button variant="ghost" size="sm" onClick={() => projetosActions.excluirCusto(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="notas" className="mt-4">
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[#213368]">Notas fiscais</h3>
                <p className="text-xs text-muted-foreground">Total: <b className="text-[#F37032]">{brl(r.notas.reduce((a, n) => a + n.valor, 0))}</b></p>
              </div>
              <Dialog open={notaOpen} onOpenChange={setNotaOpen}>
                <DialogTrigger asChild><Button className="bg-[#F37032] text-white hover:bg-[#ff8850]"><Plus className="mr-1 h-4 w-4" /> Lançar nota</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Nova nota fiscal</DialogTitle></DialogHeader>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div><Label>Número</Label><Input value={nota.numero} onChange={e => setNota({ ...nota, numero: e.target.value })} placeholder="NF 12345" /></div>
                    <div><Label>Data</Label><Input type="date" value={nota.data} onChange={e => setNota({ ...nota, data: e.target.value })} /></div>
                    <div className="md:col-span-2"><Label>Fornecedor</Label><Input value={nota.fornecedor} onChange={e => setNota({ ...nota, fornecedor: e.target.value })} /></div>
                    <div className="md:col-span-2"><Label>Descrição</Label><Input value={nota.descricao} onChange={e => setNota({ ...nota, descricao: e.target.value })} /></div>
                    <div><Label>Valor (R$)</Label><Input inputMode="numeric" value={nota.valor} onChange={e => setNota({ ...nota, valor: e.target.value })} /></div>
                    <div>
                      <Label>Status</Label>
                      <Select value={nota.status} onValueChange={v => setNota({ ...nota, status: v as typeof nota.status })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{["Pendente", "Pago", "Cancelado"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter><Button variant="outline" onClick={() => setNotaOpen(false)}>Cancelar</Button><Button onClick={submitNota} className="bg-[#213368] text-white">Salvar</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Nº</TableHead><TableHead>Fornecedor</TableHead><TableHead>Descrição</TableHead><TableHead>Data</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {r.notas.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhuma nota lançada.</TableCell></TableRow>}
                {r.notas.map(n => (
                  <TableRow key={n.id}>
                    <TableCell className="font-semibold">{n.numero}</TableCell>
                    <TableCell>{n.fornecedor}</TableCell>
                    <TableCell>{n.descricao}</TableCell>
                    <TableCell>{new Date(n.data).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>{brl(n.valor)}</TableCell>
                    <TableCell><StatusBadge status={n.status} /></TableCell>
                    <TableCell><Button variant="ghost" size="sm" onClick={() => projetosActions.excluirNota(n.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="med" className="mt-4 space-y-6">
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[#213368]">Medições</h3>
                <p className="text-xs text-muted-foreground">Acumulado: <b>{p.progresso}%</b> · Total medido: <b>{brl(r.medido)}</b></p>
              </div>
              <Dialog open={medOpen} onOpenChange={setMedOpen}>
                <DialogTrigger asChild><Button className="bg-[#F37032] text-white hover:bg-[#ff8850]"><Plus className="mr-1 h-4 w-4" /> Nova medição</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Nova medição</DialogTitle></DialogHeader>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div><Label>Data</Label><Input type="date" value={med.data} onChange={e => setMed({ ...med, data: e.target.value })} /></div>
                    <div><Label>Período</Label><Input value={med.periodo} onChange={e => setMed({ ...med, periodo: e.target.value })} placeholder="Ex.: Jun/2026" /></div>
                    <div><Label>Progresso acumulado (%)</Label><Input inputMode="numeric" value={med.pct} onChange={e => setMed({ ...med, pct: e.target.value })} /></div>
                    <div><Label>Valor medido (R$)</Label><Input inputMode="numeric" value={med.valor} onChange={e => setMed({ ...med, valor: e.target.value })} /></div>
                    <div className="md:col-span-2">
                      <Label>Status</Label>
                      <Select value={med.status} onValueChange={v => setMed({ ...med, status: v as typeof med.status })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{["Enviada", "Em análise", "Aprovada"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter><Button variant="outline" onClick={() => setMedOpen(false)}>Cancelar</Button><Button onClick={submitMed} className="bg-[#213368] text-white">Salvar</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Nº</TableHead><TableHead>Período</TableHead><TableHead>Data</TableHead><TableHead>Progresso</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {r.medicoes.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhuma medição registrada.</TableCell></TableRow>}
                {r.medicoes.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="font-semibold">#{m.numero}</TableCell>
                    <TableCell>{m.periodo}</TableCell>
                    <TableCell>{new Date(m.data).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="w-1/4">
                      <div className="flex items-center gap-3"><Progress value={m.pct} className="flex-1" /><span className="text-xs font-semibold">{m.pct}%</span></div>
                    </TableCell>
                    <TableCell>{brl(m.valor)}</TableCell>
                    <TableCell><StatusBadge status={m.status} /></TableCell>
                    <TableCell><Button variant="ghost" size="sm" onClick={() => projetosActions.excluirMedicao(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Editar projeto */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Editar projeto</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2"><Label>Nome</Label><Input value={edit.nome} onChange={e => setEdit({ ...edit, nome: e.target.value })} /></div>
            <div><Label>Cliente</Label><Input value={edit.cliente} onChange={e => setEdit({ ...edit, cliente: e.target.value })} /></div>
            <div><Label>Local</Label><Input value={edit.local} onChange={e => setEdit({ ...edit, local: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Descrição</Label><Textarea rows={2} value={edit.descricao} onChange={e => setEdit({ ...edit, descricao: e.target.value })} /></div>
            <div><Label>Responsável</Label><Input value={edit.responsavel} onChange={e => setEdit({ ...edit, responsavel: e.target.value })} /></div>
            <div><Label>Contrato (R$)</Label><Input inputMode="numeric" value={edit.orcado} onChange={e => setEdit({ ...edit, orcado: e.target.value })} /></div>
            <div><Label>Início</Label><Input type="date" value={edit.dataInicio} onChange={e => setEdit({ ...edit, dataInicio: e.target.value })} /></div>
            <div><Label>Prazo</Label><Input type="date" value={edit.prazo} onChange={e => setEdit({ ...edit, prazo: e.target.value })} /></div>
            <div>
              <Label>Status</Label>
              <Select value={edit.status} onValueChange={v => setEdit({ ...edit, status: v as ProjetoStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Avanço (%)</Label><Input inputMode="numeric" value={edit.progresso} onChange={e => setEdit({ ...edit, progresso: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={submitEdit} className="bg-[#213368] text-white">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="text-sm font-semibold">{value}</div></div>;
}
function KV({ label, value, accent }: { label: string; value: string; accent?: "orange" }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-extrabold ${accent === "orange" ? "text-[#F37032]" : "text-[#213368]"}`}>{value}</div>
    </div>
  );
}
