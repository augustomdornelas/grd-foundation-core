// ============================================================
// Cadastro de responsáveis — bloco do /app/admin
// ------------------------------------------------------------
// Listar, criar, editar e inativar. Não existe excluir: um
// responsável inativado some dos comboboxes mas continua
// aparecendo nos projetos e orçamentos que apontam para ele.
// ============================================================
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Plus, Search, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import {
  useResponsaveis, responsaveisActions, usePodeCadastrarResponsavel,
  RESPONSAVEL_TIPOS, RESPONSAVEL_TIPO_LABEL,
  type Responsavel, type ResponsavelTipo,
} from "@/lib/responsaveis-store";

export function ResponsaveisAdmin() {
  const responsaveis = useResponsaveis(s => s);
  const podeEditar = usePodeCadastrarResponsavel();
  const [busca, setBusca] = useState("");
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [editando, setEditando] = useState<Responsavel | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return responsaveis
      .filter(r => mostrarInativos || r.ativo)
      .filter(r => !q || r.nome.toLowerCase().includes(q) || r.email.toLowerCase().includes(q));
  }, [responsaveis, busca, mostrarInativos]);

  const inativos = responsaveis.filter(r => !r.ativo).length;

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-[#213368]">Responsáveis</h3>
          <p className="text-xs text-muted-foreground">
            Alimenta os campos de responsável técnico e comercial nos projetos e orçamentos.
          </p>
        </div>
        {podeEditar && (
          <Button onClick={() => setNovoOpen(true)} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
            <Plus className="mr-1 h-4 w-4" /> Novo responsável
          </Button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail" className="pl-9" />
        </div>
        <Button variant="outline" onClick={() => setMostrarInativos(v => !v)}>
          {mostrarInativos ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
          {mostrarInativos ? "Ocultar inativos" : `Mostrar inativos${inativos ? ` (${inativos})` : ""}`}
        </Button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum responsável cadastrado.
                </TableCell>
              </TableRow>
            ) : lista.map(r => (
              <TableRow key={r.id} className={r.ativo ? "" : "opacity-60"}>
                <TableCell className="font-semibold">{r.nome}</TableCell>
                <TableCell><Badge variant="outline">{RESPONSAVEL_TIPO_LABEL[r.tipo]}</Badge></TableCell>
                <TableCell className="text-xs">{r.email || "—"}</TableCell>
                <TableCell className="text-xs">{r.telefone || "—"}</TableCell>
                <TableCell>
                  <Badge className={r.ativo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                    {r.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {podeEditar && (
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setEditando(r)} aria-label="Editar">
                        <Pencil className="h-4 w-4 text-[#213368]" />
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        onClick={async () => {
                          const ok = await responsaveisActions.inativar(r.id, !r.ativo);
                          if (ok) toast.success(r.ativo ? "Responsável inativado." : "Responsável reativado.");
                        }}
                      >
                        {r.ativo ? "Inativar" : "Reativar"}
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ResponsavelDialog
        open={novoOpen || !!editando}
        responsavel={editando}
        onOpenChange={o => { if (!o) { setNovoOpen(false); setEditando(null); } }}
      />
    </Card>
  );
}

function ResponsavelDialog({ open, responsavel, onOpenChange }: {
  open: boolean;
  responsavel: Responsavel | null;
  onOpenChange: (o: boolean) => void;
}) {
  const editando = !!responsavel;
  const [form, setForm] = useState({ nome: "", tipo: "ambos" as ResponsavelTipo, email: "", telefone: "" });
  const [salvando, setSalvando] = useState(false);

  // Recarrega o formulário sempre que o alvo muda.
  useMemo(() => {
    if (!open) return;
    setForm({
      nome: responsavel?.nome ?? "",
      tipo: responsavel?.tipo ?? "ambos",
      email: responsavel?.email ?? "",
      telefone: responsavel?.telefone ?? "",
    });
  }, [open, responsavel?.id]);

  async function salvar() {
    if (!form.nome.trim()) { toast.error("Informe o nome."); return; }
    setSalvando(true);
    const ok = editando && responsavel
      ? await responsaveisActions.atualizar(responsavel.id, form)
      : Boolean(await responsaveisActions.criar(form));
    setSalvando(false);
    if (!ok) return;
    toast.success(editando ? "Responsável atualizado." : "Responsável cadastrado.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editando ? "Editar responsável" : "Novo responsável"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Nome completo" />
          </div>
          <div className="grid gap-2">
            <Label>Tipo *</Label>
            <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v as ResponsavelTipo })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RESPONSAVEL_TIPOS.map(t => <SelectItem key={t} value={t}>{RESPONSAVEL_TIPO_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Define em qual combobox o nome aparece. "Ambos" entra nos dois.
            </p>
          </div>
          <div className="grid gap-2">
            <Label>E-mail</Label>
            <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>Telefone</Label>
            <Input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={salvando || !form.nome.trim()} onClick={() => void salvar()} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
            {salvando ? "Salvando..." : editando ? "Salvar" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
