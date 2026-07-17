import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Eye, Pencil, Trash2, Users, Building2, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/mock-data";

export const Route = createFileRoute("/app/clientes")({ component: Clientes });

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
  created_at: string;
};

function defaultForm(): Omit<Cliente, "id" | "created_at"> {
  return {
    nome: "", tipo: "PJ", cpf_cnpj: null, email: null, telefone: null,
    endereco: null, cidade: null, estado: null,
    colaborador_grd: false, ativo: true, observacoes: null,
  };
}

function Clientes() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [novoOpen, setNovoOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<Cliente | null>(null);
  const [excluirId, setExcluirId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm());
  const [saving, setSaving] = useState(false);

  async function fetchClientes() {
    const { data, error } = await supabase.from("clientes").select("*").order("nome");
    if (error) toast.error("Erro ao carregar clientes: " + error.message);
    setClientes(data ?? []);
    setLoading(false);
  }

  useEffect(() => { void fetchClientes(); }, []);

  const filtrados = clientes.filter(c => {
    const matchBusca = !busca || c.nome.toLowerCase().includes(busca.toLowerCase()) ||
      (c.cpf_cnpj ?? "").includes(busca);
    const matchTipo = filtroTipo === "todos" || c.tipo === filtroTipo;
    return matchBusca && matchTipo;
  });

  async function salvar() {
    if (!form.nome.trim()) return toast.error("Informe o nome.");
    setSaving(true);
    if (editOpen) {
      const { error } = await supabase.from("clientes").update(form).eq("id", editOpen.id);
      if (error) { toast.error("Erro: " + error.message); setSaving(false); return; }
      toast.success("Cliente atualizado.");
      setEditOpen(null);
    } else {
      const { error } = await supabase.from("clientes").insert(form);
      if (error) { toast.error("Erro: " + error.message); setSaving(false); return; }
      toast.success("Cliente cadastrado.");
      setNovoOpen(false);
    }
    setSaving(false);
    setForm(defaultForm());
    void fetchClientes();
  }

  async function excluir(id: string) {
    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) return toast.error("Erro: " + error.message);
    toast.success("Cliente removido.");
    setExcluirId(null);
    void fetchClientes();
  }

  const kpis = {
    total: clientes.length,
    ativos: clientes.filter(c => c.ativo).length,
    colaboradores: clientes.filter(c => c.colaborador_grd).length,
    pj: clientes.filter(c => c.tipo === "PJ").length,
  };

  const FormModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-[#213368]">{editOpen ? "Editar cliente" : "Novo cliente"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 grid gap-2">
            <Label>Nome completo / Razão social *</Label>
            <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Nome do cliente" />
          </div>
          <div className="grid gap-2">
            <Label>Tipo</Label>
            <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                <SelectItem value="PF">Pessoa Física</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>{form.tipo === "PF" ? "CPF" : "CNPJ"}</Label>
            <Input value={form.cpf_cnpj ?? ""} onChange={e => setForm({ ...form, cpf_cnpj: e.target.value })} placeholder={form.tipo === "PF" ? "000.000.000-00" : "00.000.000/0000-00"} />
          </div>
          <div className="grid gap-2">
            <Label>E-mail</Label>
            <Input type="email" value={form.email ?? ""} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>Telefone</Label>
            <Input value={form.telefone ?? ""} onChange={e => setForm({ ...form, telefone: e.target.value })} placeholder="(14) 99999-9999" />
          </div>
          <div className="md:col-span-2 grid gap-2">
            <Label>Endereço</Label>
            <Input value={form.endereco ?? ""} onChange={e => setForm({ ...form, endereco: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>Cidade</Label>
            <Input value={form.cidade ?? ""} onChange={e => setForm({ ...form, cidade: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>Estado</Label>
            <Input value={form.estado ?? ""} onChange={e => setForm({ ...form, estado: e.target.value })} placeholder="SP" maxLength={2} />
          </div>
          <div className="grid gap-2">
            <Label>Colaborador GRD?</Label>
            <Select value={form.colaborador_grd ? "sim" : "nao"} onValueChange={v => setForm({ ...form, colaborador_grd: v === "sim" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nao">Não</SelectItem>
                <SelectItem value="sim">Sim</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={form.ativo ? "ativo" : "inativo"} onValueChange={v => setForm({ ...form, ativo: v === "ativo" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 grid gap-2">
            <Label>Observações</Label>
            <Textarea rows={2} value={form.observacoes ?? ""} onChange={e => setForm({ ...form, observacoes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={saving} onClick={salvar} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-[#213368]">Clientes</h2>
          <p className="text-xs text-muted-foreground">Cadastro e histórico de clientes.</p>
        </div>
        <Button onClick={() => { setForm(defaultForm()); setNovoOpen(true); }} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
          <Plus className="mr-1 h-4 w-4" /> Novo cliente
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        {[
          { label: "Total de clientes", value: kpis.total, icon: Users },
          { label: "Ativos", value: kpis.ativos, icon: User },
          { label: "Pessoas jurídicas", value: kpis.pj, icon: Building2 },
          { label: "Colaboradores GRD", value: kpis.colaboradores, icon: Users },
        ].map(k => (
          <Card key={k.label} className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{k.label}</span>
              <k.icon className="h-4 w-4 text-[#213368]" />
            </div>
            <div className="mt-2 text-2xl font-extrabold text-[#213368]">{k.value}</div>
          </Card>
        ))}
      </div>

      {/* Tabela */}
      <Card className="p-6">
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou CPF/CNPJ..." className="pl-9 w-64" />
          </div>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
              <SelectItem value="PF">Pessoa Física</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CPF/CNPJ</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Colaborador GRD</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</TableCell></TableRow>
              ) : filtrados.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-semibold">{c.nome}</TableCell>
                  <TableCell>{c.cpf_cnpj ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{c.tipo}</Badge></TableCell>
                  <TableCell>{c.cidade ?? "—"}{c.estado ? `/${c.estado}` : ""}</TableCell>
                  <TableCell>{c.colaborador_grd ? <Badge className="bg-[#213368] text-white">Sim</Badge> : <span className="text-muted-foreground text-xs">Não</span>}</TableCell>
                  <TableCell><Badge className={c.ativo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>{c.ativo ? "Ativo" : "Inativo"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => navigate({ to: `/app/clientes/${c.id}` })}><Eye className="h-4 w-4 text-[#213368]" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => { setForm({ nome: c.nome, tipo: c.tipo, cpf_cnpj: c.cpf_cnpj, email: c.email, telefone: c.telefone, endereco: c.endereco, cidade: c.cidade, estado: c.estado, colaborador_grd: c.colaborador_grd, ativo: c.ativo, observacoes: c.observacoes }); setEditOpen(c); }}><Pencil className="h-4 w-4 text-[#213368]" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setExcluirId(c.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <FormModal open={novoOpen} onClose={() => setNovoOpen(false)} />
      {editOpen && <FormModal open={!!editOpen} onClose={() => setEditOpen(null)} />}

      <AlertDialog open={!!excluirId} onOpenChange={o => !o && setExcluirId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => excluirId && excluir(excluirId)} className="bg-red-600 hover:bg-red-700">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
