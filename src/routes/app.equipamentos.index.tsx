import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { Plus, Search, Pencil, Trash2, ArrowRight, PackageOpen, PackageCheck } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { toast } from "sonner";
import { brl } from "@/lib/mock-data";
import {
  useEquipStore, equipActions, periodos, custoAtivoTotal,
  type Equipamento, type EquipStatus, type UnidadePeriodo,
} from "@/lib/equipamentos-store";

export const Route = createFileRoute("/app/equipamentos/")({ component: EquipamentosList });

const STATUS: EquipStatus[] = ["Disponível", "Emprestado", "Manutenção"];
const UNIDADES: UnidadePeriodo[] = ["dia", "semana", "mês"];

type FormEq = {
  nome: string; codigo: string; categoria: string; descricao: string;
  valor: string; custoPeriodo: string; unidade: UnidadePeriodo;
  status: EquipStatus; localBase: string;
};
const novoForm = (): FormEq => ({
  nome: "", codigo: "", categoria: "", descricao: "",
  valor: "", custoPeriodo: "", unidade: "dia",
  status: "Disponível", localBase: "",
});

function fmtDate(iso?: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function EquipamentosList() {
  const equipamentos = useEquipStore(s => s.equipamentos);
  const emprestimos = useEquipStore(s => s.emprestimos);
  const store = useEquipStore(s => s);

  const [openEq, setOpenEq] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormEq>(novoForm());

  const [openEmp, setOpenEmp] = useState(false);
  const [empEqId, setEmpEqId] = useState<string>("");

  const [busca, setBusca] = useState("");
  const [statusF, setStatusF] = useState("todos");
  const [catF, setCatF] = useState("todas");

  const categorias = useMemo(() => Array.from(new Set(equipamentos.map(e => e.categoria))).filter(Boolean), [equipamentos]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return equipamentos.filter(e => {
      const okQ = !q || e.nome.toLowerCase().includes(q) || e.codigo.toLowerCase().includes(q);
      const okS = statusF === "todos" || e.status === statusF;
      const okC = catF === "todas" || e.categoria === catF;
      return okQ && okS && okC;
    });
  }, [equipamentos, busca, statusF, catF]);

  const kpis = useMemo(() => ({
    total: equipamentos.length,
    emUso: equipamentos.filter(e => e.status === "Emprestado").length,
    disp: equipamentos.filter(e => e.status === "Disponível").length,
    manut: equipamentos.filter(e => e.status === "Manutenção").length,
    custoAtivo: custoAtivoTotal(store),
  }), [equipamentos, store]);

  const dadosPizza = [
    { name: "Disponível", value: kpis.disp, color: "#22c55e" },
    { name: "Emprestado", value: kpis.emUso, color: "#213368" },
    { name: "Manutenção", value: kpis.manut, color: "#f59e0b" },
  ].filter(d => d.value > 0);

  const custosMes = useMemo(() => {
    const meses: Record<string, number> = {};
    const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      meses[`${nomes[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`] = 0;
    }
    emprestimos.forEach(e => {
      const d = new Date(e.dataInicio);
      const chave = `${nomes[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`;
      if (chave in meses) meses[chave] += e.custoTotal;
    });
    return Object.entries(meses).map(([mes, valor]) => ({ mes, valor }));
  }, [emprestimos]);

  const ranking = useMemo(() => {
    const mapa = new Map<string, { nome: string; total: number; usos: number }>();
    emprestimos.forEach(e => {
      const eq = equipamentos.find(x => x.id === e.equipamentoId);
      if (!eq) return;
      const cur = mapa.get(eq.id) || { nome: eq.nome, total: 0, usos: 0 };
      cur.total += e.custoTotal; cur.usos += 1;
      mapa.set(eq.id, cur);
    });
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [emprestimos, equipamentos]);

  const abrirNovo = () => { setEditId(null); setForm(novoForm()); setOpenEq(true); };
  const abrirEditar = (e: Equipamento) => {
    setEditId(e.id);
    setForm({
      nome: e.nome, codigo: e.codigo, categoria: e.categoria, descricao: e.descricao,
      valor: String(e.valor), custoPeriodo: String(e.custoPeriodo), unidade: e.unidade,
      status: e.status, localBase: e.localBase,
    });
    setOpenEq(true);
  };

  const salvar = () => {
    if (!form.nome.trim() || !form.codigo.trim()) return toast.error("Preencha nome e código");
    if (!form.categoria.trim()) return toast.error("Informe a categoria");
    const valor = Number(form.valor.replace(/\D/g, "")) || 0;
    const custoPeriodo = Number(form.custoPeriodo.replace(/\D/g, "")) || 0;
    const base = {
      nome: form.nome, codigo: form.codigo, categoria: form.categoria, descricao: form.descricao,
      valor, custoPeriodo, unidade: form.unidade, status: form.status,
      localBase: form.localBase, localAtual: form.localBase,
    };
    if (editId) { equipActions.atualizarEquipamento(editId, base); toast.success("Equipamento atualizado"); }
    else { equipActions.criarEquipamento(base); toast.success("Equipamento cadastrado"); }
    setOpenEq(false); setEditId(null);
  };

  const excluir = (e: Equipamento) => {
    if (confirm(`Excluir "${e.nome}"? Empréstimos e manutenções também serão removidos.`)) {
      equipActions.excluirEquipamento(e.id);
      toast.success("Equipamento excluído");
    }
  };

  const devolver = (eq: Equipamento) => {
    const emp = emprestimos.find(e => e.equipamentoId === eq.id && e.ativo);
    if (!emp) return;
    const hoje = new Date().toISOString().slice(0, 10);
    equipActions.registrarDevolucao(emp.id, hoje);
    toast.success("Devolução registrada");
  };

  const abrirEmprestimo = (eq?: Equipamento) => {
    setEmpEqId(eq?.id || (equipamentos.find(e => e.status === "Disponível")?.id ?? ""));
    setOpenEmp(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-[#213368]">Equipamentos</h2>
          <p className="text-xs text-muted-foreground">Frota, empréstimos, manutenções e custos.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => abrirEmprestimo()}>
            <PackageOpen className="mr-1 h-4 w-4" /> Registrar empréstimo
          </Button>
          <Button onClick={abrirNovo} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
            <Plus className="mr-1 h-4 w-4" /> Novo equipamento
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="p-5"><div className="text-xs text-muted-foreground">Total</div><div className="mt-1 text-2xl font-extrabold text-[#213368]">{kpis.total}</div></Card>
        <Card className="p-5"><div className="text-xs text-muted-foreground">Em uso</div><div className="mt-1 text-2xl font-extrabold text-[#213368]">{kpis.emUso}</div></Card>
        <Card className="p-5"><div className="text-xs text-muted-foreground">Disponíveis</div><div className="mt-1 text-2xl font-extrabold text-green-600">{kpis.disp}</div></Card>
        <Card className="p-5"><div className="text-xs text-muted-foreground">Em manutenção</div><div className="mt-1 text-2xl font-extrabold text-amber-600">{kpis.manut}</div></Card>
        <Card className="p-5"><div className="text-xs text-muted-foreground">Custo ativo (total)</div><div className="mt-1 text-2xl font-extrabold text-[#F37032]">{brl(kpis.custoAtivo)}</div></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <div className="text-sm font-semibold text-[#213368]">Distribuição por status</div>
          <div className="mt-2 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={dadosPizza} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
                  {dadosPizza.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <div className="text-sm font-semibold text-[#213368]">Custos de locação — últimos 6 meses</div>
          <div className="mt-2 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={custosMes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="mes" stroke="#6E7280" fontSize={12} />
                <YAxis stroke="#6E7280" fontSize={12} />
                <Tooltip formatter={(v: number) => brl(v)} />
                <Bar dataKey="valor" fill="#213368" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou código" className="pl-9" />
          </div>
          <Select value={statusF} onValueChange={setStatusF}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {STATUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={catF} onValueChange={setCatF}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as categorias</SelectItem>
              {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Localização atual</TableHead>
              <TableHead>Custo</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtrados.length === 0 && (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Nenhum equipamento encontrado.</TableCell></TableRow>
              )}
              {filtrados.map(e => (
                <TableRow key={e.id}>
                  <TableCell className="font-semibold">{e.codigo}</TableCell>
                  <TableCell>
                    <Link to="/app/equipamentos/$id" params={{ id: e.id }} className="font-medium text-[#213368] hover:text-[#F37032]">
                      {e.nome}
                    </Link>
                  </TableCell>
                  <TableCell>{e.categoria}</TableCell>
                  <TableCell className="max-w-[220px] truncate" title={e.localAtual}>{e.localAtual}</TableCell>
                  <TableCell className="whitespace-nowrap">{brl(e.custoPeriodo)}/{e.unidade}</TableCell>
                  <TableCell>{brl(e.valor)}</TableCell>
                  <TableCell><StatusBadge status={e.status} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {e.status === "Disponível" && (
                        <Button size="sm" variant="ghost" title="Emprestar" onClick={() => abrirEmprestimo(e)}>
                          <PackageOpen className="h-4 w-4 text-[#213368]" />
                        </Button>
                      )}
                      {e.status === "Emprestado" && (
                        <Button size="sm" variant="ghost" title="Devolver" onClick={() => devolver(e)}>
                          <PackageCheck className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                      <Link to="/app/equipamentos/$id" params={{ id: e.id }} className="inline-flex">
                        <Button size="sm" variant="ghost" title="Ver"><ArrowRight className="h-4 w-4" /></Button>
                      </Link>
                      <Button size="sm" variant="ghost" title="Editar" onClick={() => abrirEditar(e)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" title="Excluir" onClick={() => excluir(e)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="p-5">
        <div className="text-sm font-semibold text-[#213368]">Ranking — equipamentos de maior custo</div>
        <div className="mt-4 space-y-2">
          {ranking.length === 0 && <div className="text-sm text-muted-foreground">Sem histórico ainda.</div>}
          {ranking.map((r, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-semibold text-[#213368]">{i + 1}. {r.nome}</div>
                <div className="text-xs text-muted-foreground">{r.usos} empréstimo(s)</div>
              </div>
              <div className="text-sm font-bold text-[#F37032]">{brl(r.total)}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Diálogo Equipamento */}
      <Dialog open={openEq} onOpenChange={(v) => { setOpenEq(v); if (!v) setEditId(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editId ? "Editar equipamento" : "Novo equipamento"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2"><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
            <div><Label>Código / patrimônio *</Label><Input value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} /></div>
            <div><Label>Categoria *</Label><Input value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} placeholder="Ex.: Concreto, Energia" /></div>
            <div className="md:col-span-2"><Label>Descrição</Label><Textarea rows={2} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></div>
            <div><Label>Valor do equipamento (R$)</Label><Input inputMode="numeric" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} /></div>
            <div><Label>Custo por período (R$)</Label><Input inputMode="numeric" value={form.custoPeriodo} onChange={e => setForm({ ...form, custoPeriodo: e.target.value })} /></div>
            <div>
              <Label>Unidade</Label>
              <Select value={form.unidade} onValueChange={v => setForm({ ...form, unidade: v as UnidadePeriodo })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{UNIDADES.map(u => <SelectItem key={u} value={u}>por {u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status inicial</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as EquipStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2"><Label>Local base</Label><Input value={form.localBase} onChange={e => setForm({ ...form, localBase: e.target.value })} placeholder="Ex.: Almoxarifado Central – Cubatão" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenEq(false)}>Cancelar</Button>
            <Button onClick={salvar} className="bg-[#213368] text-white hover:bg-[#2a4185]">{editId ? "Salvar" : "Cadastrar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo Empréstimo */}
      <EmprestimoDialog open={openEmp} onOpenChange={setOpenEmp} equipamentoIdInicial={empEqId} />
    </div>
  );
}

function EmprestimoDialog({ open, onOpenChange, equipamentoIdInicial }: { open: boolean; onOpenChange: (v: boolean) => void; equipamentoIdInicial: string }) {
  const equipamentos = useEquipStore(s => s.equipamentos);
  const disponiveis = equipamentos.filter(e => e.status === "Disponível" || e.id === equipamentoIdInicial);
  const [eqId, setEqId] = useState(equipamentoIdInicial);
  const eq = equipamentos.find(e => e.id === eqId);
  const [destino, setDestino] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [inicio, setInicio] = useState(new Date().toISOString().slice(0, 10));
  const [fim, setFim] = useState("");
  const [custo, setCusto] = useState<string>("");
  const [unidade, setUnidade] = useState<UnidadePeriodo>("dia");
  const [obs, setObs] = useState("");

  // sincroniza quando muda o equipamento
  useMemo(() => {
    if (eq) { setCusto(String(eq.custoPeriodo)); setUnidade(eq.unidade); }
  }, [eqId]); // eslint-disable-line

  const custoNum = Number(custo) || 0;
  const p = periodos(inicio, fim, unidade);
  const total = p * custoNum;

  const salvar = () => {
    if (!eqId) return toast.error("Selecione o equipamento");
    if (!destino.trim() || !responsavel.trim()) return toast.error("Informe destino e responsável");
    if (!inicio || !fim) return toast.error("Informe as datas");
    equipActions.registrarEmprestimo({
      equipamentoId: eqId, destino, responsavel, dataInicio: inicio, dataDevolucaoPrevista: fim,
      custoPeriodo: custoNum, unidade, observacoes: obs,
    });
    toast.success("Empréstimo registrado");
    onOpenChange(false);
    setDestino(""); setResponsavel(""); setFim(""); setObs("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Registrar empréstimo</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Equipamento</Label>
            <Select value={eqId} onValueChange={setEqId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {disponiveis.map(e => <SelectItem key={e.id} value={e.id}>{e.codigo} — {e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Destino (obra ou pessoa) *</Label><Input value={destino} onChange={e => setDestino(e.target.value)} /></div>
          <div><Label>Responsável pela retirada *</Label><Input value={responsavel} onChange={e => setResponsavel(e.target.value)} /></div>
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
