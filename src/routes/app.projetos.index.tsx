import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { Plus, ArrowRight, Trash2, Pencil, Search } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useProjetosStore, projetosActions, resumoProjeto, type Projeto, type ProjetoStatus } from "@/lib/projetos-store";
import { brl } from "@/lib/mock-data";

export const Route = createFileRoute("/app/projetos/")({ component: ProjetosList });

const STATUS_OPTIONS: ProjetoStatus[] = ["Planejamento", "Em andamento", "Paralisado", "Concluído"];

type FormState = {
  nome: string; cliente: string; local: string; descricao: string; responsavel: string;
  dataInicio: string; prazo: string; status: ProjetoStatus; orcado: string; progresso: string;
};
const emptyForm = (): FormState => ({
  nome: "", cliente: "", local: "", descricao: "", responsavel: "",
  dataInicio: new Date().toISOString().slice(0, 10), prazo: "",
  status: "Planejamento", orcado: "", progresso: "0",
});

function ProjetosList() {
  const projetos = useProjetosStore(s => s.projetos);
  const store = useProjetosStore(s => s);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return projetos.filter(p => {
      const okQ = !q || p.nome.toLowerCase().includes(q) || p.cliente.toLowerCase().includes(q);
      const okS = statusFiltro === "todos" || p.status === statusFiltro;
      return okQ && okS;
    });
  }, [projetos, busca, statusFiltro]);

  const kpis = useMemo(() => {
    const emAndamento = projetos.filter(p => p.status === "Em andamento").length;
    const valorTotal = projetos.reduce((a, p) => a + p.orcado, 0);
    const execMedia = projetos.length ? Math.round(projetos.reduce((a, p) => a + p.progresso, 0) / projetos.length) : 0;
    return { total: projetos.length, emAndamento, valorTotal, execMedia };
  }, [projetos]);

  const abrirNovo = () => { setEditId(null); setForm(emptyForm()); setOpen(true); };
  const abrirEditar = (p: Projeto) => {
    setEditId(p.id);
    setForm({
      nome: p.nome, cliente: p.cliente, local: p.local, descricao: p.descricao,
      responsavel: p.responsavel, dataInicio: p.dataInicio, prazo: p.prazo,
      status: p.status, orcado: String(p.orcado), progresso: String(p.progresso),
    });
    setOpen(true);
  };

  const submit = () => {
    if (!form.nome.trim() || !form.cliente.trim()) return toast.error("Preencha nome e cliente");
    if (!form.local.trim() || !form.prazo) return toast.error("Preencha local e prazo");
    const orcado = Number(String(form.orcado).replace(/\D/g, "")) || 0;
    const progresso = Math.max(0, Math.min(100, Number(form.progresso) || 0));
    const payload = {
      nome: form.nome, cliente: form.cliente, local: form.local, descricao: form.descricao,
      responsavel: form.responsavel, dataInicio: form.dataInicio, prazo: form.prazo,
      status: form.status, orcado, progresso,
    };
    if (editId) { projetosActions.atualizarProjeto(editId, payload); toast.success("Projeto atualizado"); }
    else { projetosActions.criarProjeto(payload); toast.success("Projeto criado"); }
    setOpen(false); setEditId(null); setForm(emptyForm());
  };

  const excluir = (p: Projeto) => {
    if (confirm(`Excluir o projeto "${p.nome}"? Esta ação também remove custos, notas e medições.`)) {
      projetosActions.excluirProjeto(p.id);
      toast.success("Projeto excluído");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-[#213368]">Projetos</h2>
          <p className="text-xs text-muted-foreground">Controle de obras, financeiro, notas e medições.</p>
        </div>
        <Button onClick={abrirNovo} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
          <Plus className="mr-1 h-4 w-4" /> Novo projeto
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5"><div className="text-xs text-muted-foreground">Total de projetos</div><div className="mt-1 text-2xl font-extrabold text-[#213368]">{kpis.total}</div></Card>
        <Card className="p-5"><div className="text-xs text-muted-foreground">Em andamento</div><div className="mt-1 text-2xl font-extrabold text-[#213368]">{kpis.emAndamento}</div></Card>
        <Card className="p-5"><div className="text-xs text-muted-foreground">Valor em obras</div><div className="mt-1 text-2xl font-extrabold text-[#F37032]">{brl(kpis.valorTotal)}</div></Card>
        <Card className="p-5"><div className="text-xs text-muted-foreground">Execução média</div><div className="mt-1 text-2xl font-extrabold">{kpis.execMedia}%</div></Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por projeto ou cliente" className="pl-9" />
          </div>
          <Select value={statusFiltro} onValueChange={setStatusFiltro}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtrados.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">Nenhum projeto encontrado.</Card>
        )}
        {filtrados.map(p => {
          const r = resumoProjeto(p.id, store);
          return (
            <Card key={p.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#F37032]">{p.id}</div>
                  <div className="mt-1 truncate text-base font-bold text-[#213368]">{p.nome}</div>
                  <div className="truncate text-xs text-muted-foreground">{p.cliente} · {p.local}</div>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div className="mt-5 space-y-3">
                <div>
                  <div className="mb-1 flex justify-between text-xs font-medium"><span>Avanço físico</span><span>{p.progresso}%</span></div>
                  <Progress value={p.progresso} />
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs font-medium"><span>Financeiro</span><span>{r.financeiro}%</span></div>
                  <Progress value={r.financeiro} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Contrato: <b className="text-foreground">{brl(r.orcado)}</b></span>
                  <span>Gasto: <b className="text-[#F37032]">{brl(r.gasto)}</b></span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Início: {p.dataInicio ? new Date(p.dataInicio).toLocaleDateString("pt-BR") : "—"}</span>
                  <span>Prazo: {p.prazo ? new Date(p.prazo).toLocaleDateString("pt-BR") : "—"}</span>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between">
                <Link to="/app/projetos/$id" params={{ id: p.id }} className="inline-flex items-center text-sm font-semibold text-[#213368] hover:text-[#F37032]">
                  Ver detalhe <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => abrirEditar(p)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => excluir(p)} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditId(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editId ? "Editar projeto" : "Novo projeto"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2"><Label>Nome do projeto *</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
            <div><Label>Cliente *</Label><Input value={form.cliente} onChange={e => setForm({ ...form, cliente: e.target.value })} /></div>
            <div><Label>Local / obra *</Label><Input value={form.local} onChange={e => setForm({ ...form, local: e.target.value })} placeholder="Ex.: Cubatão/SP" /></div>
            <div className="md:col-span-2"><Label>Descrição</Label><Textarea rows={2} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></div>
            <div><Label>Responsável</Label><Input value={form.responsavel} onChange={e => setForm({ ...form, responsavel: e.target.value })} /></div>
            <div><Label>Valor do contrato (R$)</Label><Input inputMode="numeric" value={form.orcado} onChange={e => setForm({ ...form, orcado: e.target.value })} placeholder="Ex.: 1500000" /></div>
            <div><Label>Data de início</Label><Input type="date" value={form.dataInicio} onChange={e => setForm({ ...form, dataInicio: e.target.value })} /></div>
            <div><Label>Prazo de conclusão *</Label><Input type="date" value={form.prazo} onChange={e => setForm({ ...form, prazo: e.target.value })} /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as ProjetoStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Avanço (%)</Label><Input inputMode="numeric" value={form.progresso} onChange={e => setForm({ ...form, progresso: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} className="bg-[#213368] text-white hover:bg-[#2a4185]">{editId ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
