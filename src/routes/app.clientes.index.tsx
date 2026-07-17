import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Users, UserCheck, HeartHandshake, DollarSign, Plus, Search, Eye, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/clientes/")({
  component: ClientesPage,
  errorComponent: ({ error }) => <div className="p-6 text-red-600">Erro: {error.message}</div>,
});

type Cliente = {
  id: string;
  nome: string;
  tipo: string;
  cpf_cnpj: string | null;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  colaborador_grd: boolean;
  ativo: boolean;
  observacoes: string | null;
};

type Orcamento = { cliente: string; valor: number; status: string };

const BRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function maskCPF(v: string) {
  return v.replace(/\D/g, "").slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
function maskCNPJ(v: string) {
  return v.replace(/\D/g, "").slice(0, 14).replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
}
function maskTel(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

const emptyForm: Omit<Cliente, "id"> = {
  nome: "", tipo: "PJ", cpf_cnpj: "", email: "", telefone: "", endereco: "", cidade: "", estado: "",
  colaborador_grd: false, ativo: true, observacoes: "",
};

function ClientesPage() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [form, setForm] = useState<Omit<Cliente, "id">>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Cliente | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [c, o] = await Promise.all([
        supabase.from("clientes").select("*").order("nome"),
        supabase.from("orcamentos").select("cliente,valor,status"),
      ]);
      setClientes((c.data as Cliente[]) ?? []);
      setOrcamentos((o.data as Orcamento[]) ?? []);
    } catch (e: any) {
      toast.error("Erro ao carregar", { description: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const valorPorCliente = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orcamentos) {
      if ((o.status ?? "").toLowerCase() === "aprovado") {
        map.set(o.cliente, (map.get(o.cliente) ?? 0) + Number(o.valor ?? 0));
      }
    }
    return map;
  }, [orcamentos]);

  const kpis = useMemo(() => {
    const total = clientes.length;
    const ativos = clientes.filter(c => c.ativo).length;
    const colabs = clientes.filter(c => c.colaborador_grd).length;
    const valorTotal = Array.from(valorPorCliente.values()).reduce((a, b) => a + b, 0);
    return { total, ativos, colabs, valorTotal };
  }, [clientes, valorPorCliente]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return clientes.filter(c => {
      if (filtroTipo !== "todos" && c.tipo !== filtroTipo) return false;
      if (filtroStatus === "ativo" && !c.ativo) return false;
      if (filtroStatus === "inativo" && c.ativo) return false;
      if (!q) return true;
      return c.nome.toLowerCase().includes(q) || (c.cpf_cnpj ?? "").toLowerCase().includes(q);
    });
  }, [clientes, busca, filtroTipo, filtroStatus]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }
  function openEdit(c: Cliente) {
    setEditing(c);
    const { id, ...rest } = c;
    setForm({ ...emptyForm, ...rest });
    setDialogOpen(true);
  }

  async function salvar() {
    if (!form.nome.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    try {
      const payload = { ...form, cpf_cnpj: form.cpf_cnpj || null, email: form.email || null, telefone: form.telefone || null };
      if (editing) {
        const { error } = await supabase.from("clientes").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Cliente atualizado");
      } else {
        const { error } = await supabase.from("clientes").insert(payload);
        if (error) throw error;
        toast.success("Cliente cadastrado");
      }
      setDialogOpen(false);
      await load();
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function excluir() {
    if (!confirmDel) return;
    try {
      const { error } = await supabase.from("clientes").delete().eq("id", confirmDel.id);
      if (error) throw error;
      toast.success("Cliente excluído");
      setConfirmDel(null);
      await load();
    } catch (e: any) {
      toast.error("Erro ao excluir", { description: e.message });
    }
  }

  const kpiCards = [
    { label: "Total de clientes", value: kpis.total, icon: Users, tone: "#213368" },
    { label: "Clientes ativos", value: kpis.ativos, icon: UserCheck, tone: "#213368" },
    { label: "Colaboradores GRD", value: kpis.colabs, icon: HeartHandshake, tone: "#F37032" },
    { label: "Valor gerado (aprovados)", value: BRL(kpis.valorTotal), icon: DollarSign, tone: "#F37032" },
  ];

  return (
    <div className="space-y-6" style={{ fontFamily: "Montserrat, sans-serif" }}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map(k => (
          <Card key={k.label} className="border-l-4" style={{ borderLeftColor: k.tone }}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground">{k.label}</div>
                <div className="mt-1 text-2xl font-bold" style={{ color: "#213368" }}>{k.value}</div>
              </div>
              <k.icon className="h-8 w-8" style={{ color: k.tone }} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle style={{ color: "#213368" }}>Clientes</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome ou CPF/CNPJ" className="w-64 pl-8" />
            </div>
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos tipos</SelectItem>
                <SelectItem value="PF">Pessoa Física</SelectItem>
                <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos status</SelectItem>
                <SelectItem value="ativo">Ativos</SelectItem>
                <SelectItem value="inativo">Inativos</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={openNew} style={{ background: "#F37032" }} className="text-white hover:opacity-90">
              <Plus className="mr-2 h-4 w-4" /> Novo cliente
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Nome</th>
                  <th className="py-2 pr-3">CPF/CNPJ</th>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2 pr-3">Telefone</th>
                  <th className="py-2 pr-3">Cidade</th>
                  <th className="py-2 pr-3">Colaborador</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">Carregando…</td></tr>}
                {!loading && filtrados.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">Nenhum cliente</td></tr>}
                {filtrados.map(c => (
                  <tr key={c.id} className="border-b transition hover:bg-muted/40">
                    <td className="py-3 pr-3 font-medium" style={{ color: "#213368" }}>{c.nome}</td>
                    <td className="py-3 pr-3">{c.cpf_cnpj ?? "—"}</td>
                    <td className="py-3 pr-3"><Badge variant="outline">{c.tipo}</Badge></td>
                    <td className="py-3 pr-3">{c.telefone ?? "—"}</td>
                    <td className="py-3 pr-3">{c.cidade ?? "—"}</td>
                    <td className="py-3 pr-3">{c.colaborador_grd ? <Badge style={{ background: "#F37032" }} className="text-white">GRD</Badge> : "—"}</td>
                    <td className="py-3 pr-3">
                      {c.ativo
                        ? <Badge style={{ background: "#213368" }} className="text-white">Ativo</Badge>
                        : <Badge variant="secondary">Inativo</Badge>}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => navigate({ to: "/app/clientes/$id", params: { id: c.id } })}><Eye className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setConfirmDel(c)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle style={{ color: "#213368" }}>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Nome completo / Razão social *</Label>
              <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v, cpf_cnpj: "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PF">Pessoa Física</SelectItem>
                  <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{form.tipo === "PF" ? "CPF" : "CNPJ"}</Label>
              <Input
                value={form.cpf_cnpj ?? ""}
                onChange={e => setForm({ ...form, cpf_cnpj: form.tipo === "PF" ? maskCPF(e.target.value) : maskCNPJ(e.target.value) })}
              />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" value={form.email ?? ""} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={form.telefone ?? ""} onChange={e => setForm({ ...form, telefone: maskTel(e.target.value) })} />
            </div>
            <div className="md:col-span-2">
              <Label>Endereço</Label>
              <Input value={form.endereco ?? ""} onChange={e => setForm({ ...form, endereco: e.target.value })} />
            </div>
            <div>
              <Label>Cidade</Label>
              <Input value={form.cidade ?? ""} onChange={e => setForm({ ...form, cidade: e.target.value })} />
            </div>
            <div>
              <Label>Estado (UF)</Label>
              <Input maxLength={2} value={form.estado ?? ""} onChange={e => setForm({ ...form, estado: e.target.value.toUpperCase() })} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label className="cursor-pointer">Colaborador GRD?</Label>
              <Switch checked={form.colaborador_grd} onCheckedChange={v => setForm({ ...form, colaborador_grd: v })} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label className="cursor-pointer">Ativo</Label>
              <Switch checked={form.ativo} onCheckedChange={v => setForm({ ...form, ativo: v })} />
            </div>
            <div className="md:col-span-2">
              <Label>Observações</Label>
              <Textarea rows={3} value={form.observacoes ?? ""} onChange={e => setForm({ ...form, observacoes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving} style={{ background: "#F37032" }} className="text-white hover:opacity-90">
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDel} onOpenChange={o => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. Cliente: {confirmDel?.nome}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluir} className="bg-red-600 hover:bg-red-700">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
