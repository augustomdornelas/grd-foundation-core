import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { Plus, ArrowRight, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useProjetosStore, projetosActions, resumoProjeto } from "@/lib/projetos-store";
import { brl } from "@/lib/mock-data";

export const Route = createFileRoute("/app/projetos")({ component: ProjetosList });

function ProjetosList() {
  const projetos = useProjetosStore(s => s.projetos);
  const store = useProjetosStore(s => s);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nome: "", cliente: "", status: "Planejamento" as const, orcado: "" });

  const totais = projetos.reduce(
    (a, p) => {
      const r = resumoProjeto(p.id, store);
      return { orcado: a.orcado + r.orcado, gasto: a.gasto + r.gasto, medido: a.medido + r.medido };
    },
    { orcado: 0, gasto: 0, medido: 0 }
  );

  const submit = () => {
    if (!form.nome.trim() || !form.cliente.trim()) return toast.error("Preencha nome e cliente");
    const orcado = Number(form.orcado.replace(/\D/g, "")) || 0;
    projetosActions.criarProjeto({ nome: form.nome, cliente: form.cliente, status: form.status, progresso: 0, orcado });
    toast.success("Projeto criado");
    setForm({ nome: "", cliente: "", status: "Planejamento", orcado: "" });
    setOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5"><div className="text-xs text-muted-foreground">Orçado total</div><div className="mt-1 text-2xl font-extrabold text-[#213368]">{brl(totais.orcado)}</div></Card>
        <Card className="p-5"><div className="text-xs text-muted-foreground">Gasto (notas)</div><div className="mt-1 text-2xl font-extrabold text-[#F37032]">{brl(totais.gasto)}</div></Card>
        <Card className="p-5"><div className="text-xs text-muted-foreground">Medido</div><div className="mt-1 text-2xl font-extrabold">{brl(totais.medido)}</div></Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-[#213368]">Todos os projetos</h3>
          <p className="text-xs text-muted-foreground">Acompanhe o andamento das obras e o desempenho financeiro.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#F37032] text-white hover:bg-[#ff8850]"><Plus className="mr-1 h-4 w-4" /> Novo projeto</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo projeto</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
              <div><Label>Cliente</Label><Input value={form.cliente} onChange={e => setForm({ ...form, cliente: e.target.value })} /></div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as typeof form.status })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Planejamento">Planejamento</SelectItem>
                    <SelectItem value="Em andamento">Em andamento</SelectItem>
                    <SelectItem value="Pausado">Pausado</SelectItem>
                    <SelectItem value="Concluído">Concluído</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Orçado (R$)</Label><Input inputMode="numeric" value={form.orcado} onChange={e => setForm({ ...form, orcado: e.target.value })} placeholder="Ex.: 1500000" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={submit} className="bg-[#213368] text-white">Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projetos.map(p => {
          const r = resumoProjeto(p.id, store);
          return (
            <Card key={p.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#F37032]">{p.id}</div>
                  <div className="mt-1 truncate text-base font-bold text-[#213368]">{p.nome}</div>
                  <div className="text-xs text-muted-foreground">{p.cliente}</div>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div className="mt-5 space-y-3">
                <div>
                  <div className="mb-1 flex justify-between text-xs font-medium"><span>Progresso</span><span>{p.progresso}%</span></div>
                  <Progress value={p.progresso} />
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs font-medium"><span>Financeiro realizado</span><span>{r.financeiro}%</span></div>
                  <Progress value={r.financeiro} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Orçado: <b className="text-foreground">{brl(r.orcado)}</b></span>
                  <span>Gasto: <b className="text-[#F37032]">{brl(r.gasto)}</b></span>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between">
                <Link to="/app/projetos/$id" params={{ id: p.id }} className="inline-flex items-center text-sm font-semibold text-[#213368] hover:text-[#F37032]">
                  Ver detalhe <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
                <Button variant="ghost" size="sm" onClick={() => { if (confirm(`Excluir ${p.nome}?`)) { projetosActions.excluirProjeto(p.id); toast.success("Projeto excluído"); } }}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
