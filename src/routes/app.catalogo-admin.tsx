import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/catalogo-admin")({
  component: CatalogoAdminPage,
  errorComponent: ({ error }) => <div className="p-6 text-red-600">Erro: {error.message}</div>,
});

type Row = {
  id: string;
  nome: string;
  catalogo_nome: string | null;
  categoria: string | null;
};

const MAX = 80;

function CatalogoAdminPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("equipamentos")
        .select("id, nome, catalogo_nome, categoria")
        .eq("exibir_catalogo", true)
        .order("nome", { ascending: true });
      if (cancel) return;
      if (error) { console.error(error); setRows([]); }
      else setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      (r.nome ?? "").toLowerCase().includes(q) ||
      (r.catalogo_nome ?? "").toLowerCase().includes(q)
    );
  }, [rows, busca]);

  const abrirEdicao = (r: Row) => {
    setEditing(r);
    setValor(r.catalogo_nome ?? "");
  };

  const salvar = async () => {
    if (!editing) return;
    setSalvando(true);
    const novo = valor.trim() === "" ? null : valor.trim().slice(0, MAX);
    const { data, error } = await supabase
      .from("equipamentos")
      .update({ catalogo_nome: novo })
      .eq("id", editing.id)
      .select("id, nome, catalogo_nome, categoria")
      .single();
    setSalvando(false);
    if (error || !data) {
      toast.error("Erro ao atualizar nome");
      return;
    }
    setRows(prev => prev.map(r => r.id === data.id ? (data as Row) : r));
    toast.success("Nome atualizado");
    setEditing(null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-[#213368]">Equipamentos no catálogo público ({filtrados.length})</CardTitle>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#213368]/5">
                  <TableHead className="text-[#213368] font-bold">Nome interno</TableHead>
                  <TableHead className="text-[#213368] font-bold">Nome no catálogo</TableHead>
                  <TableHead className="text-[#213368] font-bold">Categoria</TableHead>
                  <TableHead className="text-[#213368] font-bold text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : filtrados.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Nenhum equipamento encontrado</TableCell></TableRow>
                ) : (
                  filtrados.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.nome}</TableCell>
                      <TableCell>{r.catalogo_nome?.trim() ? r.catalogo_nome : "—"}</TableCell>
                      <TableCell>{r.categoria ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => abrirEdicao(r)}
                          className="border-[#213368]/30 text-[#213368] hover:bg-[#F37032] hover:text-white hover:border-[#F37032]"
                        >
                          <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#213368]">Editar nome no catálogo</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Nome interno</Label>
                <div className="mt-1 rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium">{editing.nome}</div>
              </div>
              <div>
                <Label htmlFor="catalogo-nome">Nome no catálogo</Label>
                <Input
                  id="catalogo-nome"
                  value={valor}
                  maxLength={MAX}
                  placeholder={editing.nome}
                  onChange={(e) => setValor(e.target.value)}
                />
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Deixe em branco para usar o nome interno. Este campo não altera o cadastro do equipamento.</span>
                  <span className="ml-2 shrink-0">{valor.length}/{MAX}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={salvando}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando} className="bg-[#F37032] text-white hover:bg-[#F37032]/90">
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
