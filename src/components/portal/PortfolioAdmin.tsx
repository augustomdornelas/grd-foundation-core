// ============================================================
// PortfolioAdmin — CRUD de obras do portfólio institucional
// ============================================================
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pencil, Plus, Trash2, Upload, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Obra = {
  id: string;
  titulo: string;
  descricao: string | null;
  categoria: string | null;
  foto_url: string | null;
  ordem: number;
  ativo: boolean;
};

type FormState = {
  id: string | null;
  titulo: string;
  descricao: string;
  categoria: string;
  foto_url: string;
  ordem: number;
  ativo: boolean;
};

const emptyForm: FormState = {
  id: null, titulo: "", descricao: "", categoria: "", foto_url: "", ordem: 0, ativo: true,
};

export function PortfolioAdmin() {
  const [obras, setObras] = useState<Obra[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [excluirId, setExcluirId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function fetchObras() {
    setLoading(true);
    const { data, error } = await supabase.from("portfolio").select("*").order("ordem", { ascending: true });
    if (error) toast.error(error.message);
    setObras((data ?? []) as Obra[]);
    setLoading(false);
  }

  useEffect(() => { void fetchObras(); }, []);

  function abrirNovo() {
    const nextOrdem = obras.length ? Math.max(...obras.map(o => o.ordem)) + 1 : 0;
    setForm({ ...emptyForm, ordem: nextOrdem });
    setDialogOpen(true);
  }

  function abrirEdicao(obra: Obra) {
    setForm({
      id: obra.id,
      titulo: obra.titulo ?? "",
      descricao: obra.descricao ?? "",
      categoria: obra.categoria ?? "",
      foto_url: obra.foto_url ?? "",
      ordem: obra.ordem ?? 0,
      ativo: obra.ativo,
    });
    setDialogOpen(true);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("portfolio").upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("portfolio").getPublicUrl(path);
      setForm(f => ({ ...f, foto_url: data.publicUrl }));
      toast.success("Foto enviada.");
    } catch (err: any) {
      toast.error(err.message ?? "Falha no upload.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titulo.trim()) { toast.error("Informe o título."); return; }
    setSaving(true);
    const payload = {
      titulo: form.titulo.trim().toUpperCase(),
      descricao: form.descricao.trim() ? form.descricao.trim().toUpperCase() : null,
      categoria: form.categoria.trim() ? form.categoria.trim().toUpperCase() : null,
      foto_url: form.foto_url || null,
      ordem: Number(form.ordem) || 0,
      ativo: form.ativo,
    };
    const q = form.id
      ? supabase.from("portfolio").update(payload).eq("id", form.id)
      : supabase.from("portfolio").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(form.id ? "Obra atualizada." : "Obra cadastrada.");
    setDialogOpen(false);
    void fetchObras();
  }

  async function excluir(id: string) {
    const { error } = await supabase.from("portfolio").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Obra excluída.");
    setExcluirId(null);
    void fetchObras();
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-[#213368]">Portfólio</h3>
          <p className="text-xs text-muted-foreground">Obras exibidas na página institucional.</p>
        </div>
        <Button onClick={abrirNovo} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
          <Plus className="mr-1 h-4 w-4" /> Nova obra
        </Button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Foto</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="w-20">Ordem</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-28 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {obras.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Nenhuma obra cadastrada.</TableCell></TableRow>
            ) : obras.map(o => (
              <TableRow key={o.id}>
                <TableCell>
                  {o.foto_url ? (
                    <img src={o.foto_url} alt={o.titulo} className="h-12 w-16 rounded object-cover" />
                  ) : (
                    <div className="flex h-12 w-16 items-center justify-center rounded bg-muted"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>
                  )}
                </TableCell>
                <TableCell className="font-semibold">{o.titulo}</TableCell>
                <TableCell>{o.categoria ?? "—"}</TableCell>
                <TableCell>{o.ordem}</TableCell>
                <TableCell>
                  <Badge className={o.ativo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                    {o.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => abrirEdicao(o)}><Pencil className="h-4 w-4 text-[#213368]" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setExcluirId(o.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={o => !o && setDialogOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{form.id ? "Editar obra" : "Nova obra"}</DialogTitle></DialogHeader>
          <form className="grid gap-4" onSubmit={salvar}>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Título</label>
              <Input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Nome da obra" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Descrição</label>
              <Textarea value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Breve descrição" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Categoria</label>
                <Input value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} placeholder="Ex: Industrial" />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Ordem</label>
                <Input type="number" value={form.ordem} onChange={e => setForm({ ...form, ordem: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Foto</label>
              <div className="flex items-center gap-3">
                {form.foto_url ? (
                  <img src={form.foto_url} alt="Prévia" className="h-20 w-28 rounded object-cover" />
                ) : (
                  <div className="flex h-20 w-28 items-center justify-center rounded bg-muted"><ImageIcon className="h-6 w-6 text-muted-foreground" /></div>
                )}
                <div className="flex flex-col gap-2">
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
                  <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    <Upload className="mr-1 h-4 w-4" /> {uploading ? "Enviando..." : "Enviar foto"}
                  </Button>
                  {form.foto_url && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, foto_url: "" })}>Remover</Button>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.ativo} onCheckedChange={v => setForm({ ...form, ativo: v })} />
              <label className="text-sm font-medium">Exibir no site</label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!excluirId} onOpenChange={o => !o && setExcluirId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir obra?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação remove a obra do portfólio. Não é possível desfazer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => excluirId && excluir(excluirId)} className="bg-red-600 hover:bg-red-700">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
