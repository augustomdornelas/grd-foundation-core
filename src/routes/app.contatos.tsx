import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Mail, MessageCircle, Search, Inbox, Clock, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/contatos")({
  component: ContatosPage,
  errorComponent: ({ error }) => <div className="p-6 text-red-600">Erro: {error.message}</div>,
});

type Contato = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  mensagem: string;
  status: string;
  observacoes: string | null;
  created_at: string;
};

const STATUS_LIST = ["NOVO", "EM ATENDIMENTO", "RESPONDIDO", "DESCARTADO"] as const;

function statusStyle(s: string): { bg: string; color: string } {
  const v = (s || "").toUpperCase();
  if (v === "NOVO") return { bg: "#F37032", color: "#fff" };
  if (v === "EM ATENDIMENTO") return { bg: "#213368", color: "#fff" };
  if (v === "RESPONDIDO") return { bg: "#16A34A", color: "#fff" };
  return { bg: "#9CA3AF", color: "#fff" };
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function ContatosPage() {
  const [rows, setRows] = useState<Contato[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("TODOS");
  const [selected, setSelected] = useState<Contato | null>(null);
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("contatos").select("*").order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar contatos");
    setRows((data ?? []) as Contato[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    setObs(selected?.observacoes ?? "");
  }, [selected?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r => {
      if (statusFilter !== "TODOS" && (r.status || "").toUpperCase() !== statusFilter) return false;
      if (!q) return true;
      return r.nome.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
    });
  }, [rows, query, statusFilter]);

  const kpis = useMemo(() => {
    const total = rows.length;
    const novos = rows.filter(r => (r.status || "").toUpperCase() === "NOVO").length;
    const atd = rows.filter(r => (r.status || "").toUpperCase() === "EM ATENDIMENTO").length;
    const resp = rows.filter(r => (r.status || "").toUpperCase() === "RESPONDIDO").length;
    return { total, novos, atd, resp };
  }, [rows]);

  const updateContato = async (patch: Partial<Contato>) => {
    if (!selected) return;
    setSaving(true);
    const { data, error } = await supabase.from("contatos").update(patch).eq("id", selected.id).select().single();
    setSaving(false);
    if (error || !data) {
      toast.error("Não foi possível salvar");
      return;
    }
    setRows(prev => prev.map(r => (r.id === selected.id ? (data as Contato) : r)));
    setSelected(data as Contato);
    toast.success("Atualizado");
  };

  const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

  const waLink = (tel: string | null) => {
    if (!tel) return "#";
    const digits = tel.replace(/\D/g, "");
    const full = digits.startsWith("55") ? digits : `55${digits}`;
    return `https://wa.me/${full}`;
  };

  return (
    <PortalLayout title="CONTATOS">
      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-4">
          <KpiCard label="TOTAL" value={kpis.total} icon={Inbox} color="#213368" />
          <KpiCard label="NOVOS" value={kpis.novos} icon={Mail} color="#F37032" />
          <KpiCard label="EM ATENDIMENTO" value={kpis.atd} icon={Clock} color="#213368" />
          <KpiCard label="RESPONDIDOS" value={kpis.resp} icon={CheckCircle2} color="#16A34A" />
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="BUSCAR POR NOME OU E-MAIL" value={query} onChange={e => setQuery(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="md:w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">TODOS OS STATUS</SelectItem>
                {STATUS_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Tabela */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DATA</TableHead>
                  <TableHead>NOME</TableHead>
                  <TableHead>E-MAIL</TableHead>
                  <TableHead>TELEFONE</TableHead>
                  <TableHead>MENSAGEM</TableHead>
                  <TableHead>STATUS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">CARREGANDO...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">NENHUM CONTATO ENCONTRADO</TableCell></TableRow>
                ) : filtered.map(r => {
                  const st = statusStyle(r.status);
                  return (
                    <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelected(r)}>
                      <TableCell className="whitespace-nowrap">{fmtDate(r.created_at)}</TableCell>
                      <TableCell className="font-medium">{r.nome}</TableCell>
                      <TableCell>{r.email}</TableCell>
                      <TableCell>{r.telefone || "—"}</TableCell>
                      <TableCell className="max-w-[300px]">{truncate(r.mensagem, 60)}</TableCell>
                      <TableCell>
                        <Badge style={{ backgroundColor: st.bg, color: st.color }} className="border-0">{(r.status || "").toUpperCase()}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Drawer */}
      <Sheet open={!!selected} onOpenChange={o => { if (!o) setSelected(null); }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="text-[#213368]">DETALHES DO CONTATO</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="mt-6 space-y-6">
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase text-muted-foreground">NOME</div>
                <div className="text-lg font-bold text-[#213368]">{selected.nome}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">E-MAIL</div>
                  <div className="break-all text-sm">{selected.email}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">TELEFONE</div>
                  <div className="text-sm">{selected.telefone || "—"}</div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase text-muted-foreground">DATA</div>
                <div className="text-sm">{fmtDate(selected.created_at)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase text-muted-foreground">MENSAGEM</div>
                <div className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">{selected.mensagem}</div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase text-muted-foreground">STATUS</div>
                <div className="flex flex-wrap gap-2">
                  {STATUS_LIST.map(s => {
                    const st = statusStyle(s);
                    const active = (selected.status || "").toUpperCase() === s;
                    return (
                      <button
                        key={s}
                        disabled={saving}
                        onClick={() => updateContato({ status: s })}
                        className={`rounded-md border px-3 py-1.5 text-xs font-semibold uppercase transition ${active ? "ring-2 ring-offset-1" : "opacity-70 hover:opacity-100"}`}
                        style={active ? { backgroundColor: st.bg, color: st.color, borderColor: st.bg } : { borderColor: st.bg, color: st.bg }}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase text-muted-foreground">OBSERVAÇÕES INTERNAS</div>
                <Textarea rows={4} value={obs} onChange={e => setObs(e.target.value)} placeholder="ANOTAÇÕES INTERNAS..." />
                <Button size="sm" disabled={saving} onClick={() => updateContato({ observacoes: obs })} className="bg-[#213368] hover:bg-[#213368]/90">
                  {saving ? "SALVANDO..." : "SALVAR OBSERVAÇÕES"}
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 border-t pt-4">
                <Button asChild className="bg-[#213368] hover:bg-[#213368]/90">
                  <a href={`mailto:${selected.email}`}><Mail className="mr-2 h-4 w-4" /> RESPONDER POR E-MAIL</a>
                </Button>
                {selected.telefone && (
                  <Button asChild className="bg-[#25D366] hover:bg-[#25D366]/90 text-white">
                    <a href={waLink(selected.telefone)} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-2 h-4 w-4" /> CHAMAR NO WHATSAPP</a>
                  </Button>
                )}
                <Button variant="outline" onClick={() => updateContato({ status: "DESCARTADO" })} disabled={saving}>
                  <XCircle className="mr-2 h-4 w-4" /> DESCARTAR
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </PortalLayout>
  );
}

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Mail; color: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}15`, color }}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold" style={{ color }}>{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
