import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ImageOff, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/catalogo-admin")({
  component: CatalogoAdminPage,
  errorComponent: ({ error }) => <div className="p-6 text-red-600">Erro: {error.message}</div>,
});

type Row = {
  id: string;
  nome: string;
  catalogo_nome: string | null;
  catalogo_foto_url: string | null;
  categoria: string | null;
};

function CatalogoAdminPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("equipamentos")
        .select("id, nome, catalogo_nome, catalogo_foto_url, categoria")
        .eq("exibir_catalogo", true)
        .order("nome", { ascending: true });
      if (cancel) return;
      if (error) {
        console.error(error);
        setRows([]);
      } else {
        setRows((data ?? []) as Row[]);
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

  const handleSaveCatalogoNome = async (row: Row, valueAtBlur: string) => {
    const trimmed = valueAtBlur.trim();
    const novo = trimmed === "" ? null : trimmed;
    if ((row.catalogo_nome ?? null) === novo) return;
    setSavingId(row.id);
    const { data, error } = await supabase
      .from("equipamentos")
      .update({ catalogo_nome: novo })
      .eq("id", row.id)
      .select("id, nome, catalogo_nome, catalogo_foto_url, categoria")
      .single();
    setSavingId(null);
    if (error || !data) {
      console.error(error);
      toast.error("ERRO AO SALVAR");
      return;
    }
    setRows(prev => prev.map(r => r.id === row.id ? (data as Row) : r));
    toast.success("NOME ATUALIZADO");
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
                  <TableHead className="text-[#213368] font-bold w-16">Foto</TableHead>
                  <TableHead className="text-[#213368] font-bold">Nome interno</TableHead>
                  <TableHead className="text-[#213368] font-bold">Nome no catálogo</TableHead>
                  <TableHead className="text-[#213368] font-bold">Categoria</TableHead>
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
                      <TableCell>
                        {r.catalogo_foto_url ? (
                          <img
                            src={r.catalogo_foto_url}
                            alt={r.catalogo_nome ?? r.nome}
                            className="h-12 w-12 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded bg-gray-200">
                            <ImageOff className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{r.nome}</TableCell>
                      <TableCell>
                        <Input
                          value={r.catalogo_nome ?? ""}
                          placeholder="—"
                          disabled={savingId === r.id}
                          onChange={e => handleChangeCatalogoNome(r.id, e.target.value)}
                          onBlur={e => handleSaveCatalogoNome(r, e.target.value)}
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
