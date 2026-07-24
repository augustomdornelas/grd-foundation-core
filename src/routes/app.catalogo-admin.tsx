import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search } from "lucide-react";
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

function CatalogoAdminPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [originals, setOriginals] = useState<Record<string, string | null>>({});

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
      if (error) {
        console.error(error);
        setRows([]);
        setOriginals({});
      } else {
        const raw = (data ?? []) as Row[];
        setOriginals(Object.fromEntries(raw.map(r => [r.id, r.catalogo_nome ?? null])));
        setRows(raw.map(r => ({ ...r, catalogo_nome: r.catalogo_nome?.trim() || r.nome })));
      }
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

  const handleChangeCatalogoNome = (id: string, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, catalogo_nome: value } : r));
  };

  const handleSaveCatalogoNome = async (equipamentoId: string, valueAtBlur: string) => {
    const row = rows.find(r => r.id === equipamentoId);
    if (!row) return;

    const trimmed = valueAtBlur.trim();
    const original = originals[equipamentoId] ?? null;

    const isUnchanged =
      trimmed === (original ?? "") ||
      (original === null && trimmed === row.nome);

    if (isUnchanged) return;

    const novo = trimmed === "" || trimmed === row.nome ? null : trimmed;

    setSavingId(equipamentoId);
    const { data, error } = await supabase
      .from("equipamentos")
      .update({ catalogo_nome: novo })
      .eq("id", equipamentoId)
      .select()
      .single();
    setSavingId(null);
    if (error || !data) {
      console.error(error);
      toast.error(error?.message ?? "ERRO AO SALVAR");
      return;
    }

    const updated = data as Row;
    setOriginals(prev => ({ ...prev, [equipamentoId]: updated.catalogo_nome ?? null }));
    setRows(prev => prev.map(r => r.id === equipamentoId ? { ...updated, catalogo_nome: updated.catalogo_nome?.trim() || updated.nome } : r));
    toast.success("Salvo");
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={3} className="py-8 text-center text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : filtrados.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="py-8 text-center text-muted-foreground">Nenhum equipamento encontrado</TableCell></TableRow>
                ) : (
                  filtrados.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.nome}</TableCell>
                      <TableCell>
                        <Input
                          value={r.catalogo_nome ?? ""}
                          placeholder="—"
                          disabled={savingId === r.id}
                          onChange={e => handleChangeCatalogoNome(r.id, e.target.value)}
                          onBlur={e => handleSaveCatalogoNome(r.id, e.target.value)}
                        />
                      </TableCell>
                      <TableCell>{r.categoria ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
