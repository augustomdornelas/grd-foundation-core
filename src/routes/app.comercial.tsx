// ============================================================
// /app/comercial — Dashboard Comercial (completo)
// ------------------------------------------------------------
// - KPIs, 6 gráficos, filtros, tabela com CRUD, drawer de
//   detalhes, exportação CSV, timeline e notas.
// - Fonte única: orcamentos-store (compartilhada com /app).
// ============================================================
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { toast } from "sonner";
import {
  Plus, Search, Download, Eye, Pencil, Copy, Trash2, ArrowUpDown, ArrowUp, ArrowDown,
  DollarSign, FileText, TrendingUp, CheckCircle2, Clock, Percent,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell, LineChart,
} from "recharts";
import {
  useOrcamentos, orcamentosActions, TIPOS_SERVICO, STATUS_LIST, ESTAGIO_LIST, RESPONSAVEIS,
  STATUS_COLORS, type Orcamento, type OrcStatus, type TipoServico, type EstagioFunil,
  type Periodo, type PeriodoTipo, rangeDoPeriodo, rangeAnterior, dentro,
} from "@/lib/orcamentos-store";


export const Route = createFileRoute("/app/comercial")({ component: Comercial });

const NOMES_MES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

// "1.500,50" | "1500.50" | "1500,50" | "1500" -> 1500.5
function parseValorBR(s: string): number {
  if (!s) return 0;
  const t = String(s).trim().replace(/\s|R\$/g, "");
  // se tem vírgula, assume BR: pontos = milhar, vírgula = decimal
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(norm);
  return isNaN(n) ? 0 : n;
}

// ISO "2025-01-31" <-> BR "31/01/2025"
function isoToBR(iso: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
function brToISO(br: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}
function maskBRDate(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0,2)}/${d.slice(2)}`;
  return `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}`;
}

function DateBRInput({ value, onChange, ...rest }: {
  value: string; onChange: (iso: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [text, setText] = useState(isoToBR(value));
  // sincroniza quando value externo muda
  useMemo(() => { setText(isoToBR(value)); }, [value]);
  return (
    <Input
      {...rest}
      inputMode="numeric"
      placeholder="dd/mm/aaaa"
      value={text}
      onChange={(e) => {
        const masked = maskBRDate(e.target.value);
        setText(masked);
        const iso = brToISO(masked);
        if (iso || masked === "") onChange(iso);
      }}
    />
  );
}


function Comercial() {
  const orcamentos = useOrcamentos(s => s);

  // ---------- Filtro de período ----------
  const [periodoTipo, setPeriodoTipo] = useState<PeriodoTipo>("ano");
  const [customIni, setCustomIni] = useState("");
  const [customFim, setCustomFim] = useState("");
  const periodo: Periodo = { tipo: periodoTipo, ini: customIni, fim: customFim };

  // ---------- Filtros da tabela ----------
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState<string>("todos");
  const [sortBy, setSortBy] = useState<keyof Orcamento>("numero");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [pagina, setPagina] = useState(1);

  // ---------- Modais / drawer ----------
  const [novoOpen, setNovoOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<Orcamento | null>(null);
  const [detalhe, setDetalhe] = useState<Orcamento | null>(null);
  const [excluir, setExcluir] = useState<Orcamento | null>(null);

  // ---------- Métricas do período ----------
  const metricas = useMemo(() => {
    const range = rangeDoPeriodo(periodo);
    const rangeAnt = rangeAnterior(periodo);
    const noPer = orcamentos.filter(o => dentro(o.data, range));
    const noAnt = orcamentos.filter(o => dentro(o.data, rangeAnt));

    const total = noPer.reduce((a, o) => a + o.valor, 0);
    const totalAnt = noAnt.reduce((a, o) => a + o.valor, 0);
    const qtd = noPer.length;
    const ticket = qtd ? total / qtd : 0;
    const aprovados = noPer.filter(o => o.status === "Aprovado").length;
    const conv = qtd ? (aprovados / qtd) * 100 : 0;
    const abertos = noPer.filter(o => o.status === "Em análise" || o.status === "Aguardando retorno");
    const abertoValor = abertos.reduce((a, o) => a + o.valor, 0);
    const cresc = totalAnt > 0 ? ((total - totalAnt) / totalAnt) * 100 : total > 0 ? 100 : 0;

    const hoje = new Date();
    const meses: { mes: string; valor: number; qtd: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const dNext = new Date(hoje.getFullYear(), hoje.getMonth() - i + 1, 1);
      const inRange = d >= range.ini || dNext > range.ini;
      const lst = orcamentos.filter(o => {
        const od = new Date(o.data);
        return od >= d && od < dNext && od >= range.ini && od <= range.fim;
      });
      if (!inRange && !lst.length) continue;
      meses.push({
        mes: `${NOMES_MES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
        valor: lst.reduce((a, o) => a + o.valor, 0),
        qtd: lst.length,
      });
    }

    const porStatus = STATUS_LIST.map(st => ({
      name: st, value: noPer.filter(o => o.status === st).length, color: STATUS_COLORS[st],
    })).filter(x => x.value > 0);

    const porTipo = TIPOS_SERVICO.map(t => {
      const lst = noPer.filter(o => o.tipo === t);
      return { tipo: t, valor: lst.reduce((a, o) => a + o.valor, 0), qtd: lst.length };
    }).sort((a, b) => b.valor - a.valor);

    const porResp = RESPONSAVEIS.map(r => {
      const lst = noPer.filter(o => o.responsavel === r);
      return { responsavel: r.split(" ")[0], valor: lst.reduce((a, o) => a + o.valor, 0), qtd: lst.length };
    });

    const funil = ESTAGIO_LIST.map(e => ({
      estagio: e,
      qtd: noPer.filter(o => o.estagio === e).length,
      valor: noPer.filter(o => o.estagio === e).reduce((a, o) => a + o.valor, 0),
    }));

    const probMeses: { mes: string; prob: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const dNext = new Date(hoje.getFullYear(), hoje.getMonth() - i + 1, 1);
      const lst = orcamentos.filter(o => {
        const od = new Date(o.data);
        return od >= d && od < dNext;
      });
      const media = lst.length
        ? lst.reduce((a, o) => a + (o.probabilidade ?? 0), 0) / lst.length
        : 0;
      probMeses.push({
        mes: NOMES_MES[d.getMonth()],
        prob: Math.round(media),
      });
    }

    return { total, qtd, ticket, conv, abertoNum: abertos.length, abertoValor, cresc, meses, porStatus, porTipo, porResp, funil, probMeses };
  }, [orcamentos, periodo.tipo, periodo.ini, periodo.fim]);

  // ---------- Tabela filtrada ----------
  const filtered = useMemo(() => {
    const range = rangeDoPeriodo(periodo);
    const qLower = q.toLowerCase();
    let list = orcamentos.filter(o => dentro(o.data, range));
    if (q) list = list.filter(o =>
      o.cliente.toLowerCase().includes(qLower) ||
      o.numero.toLowerCase().includes(qLower) ||
      o.obra.toLowerCase().includes(qLower),
    );
    if (fStatus !== "todos") list = list.filter(o => o.status === fStatus);
    if (fResp !== "todos") list = list.filter(o => o.responsavel === fResp);
    if (fTipo !== "todos") list = list.filter(o => o.tipo === fTipo);
    list.sort((a, b) => {
      const va = a[sortBy] as unknown as string | number;
      const vb = b[sortBy] as unknown as string | number;
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [orcamentos, q, fStatus, fResp, fTipo, sortBy, sortDir, periodo.tipo, periodo.ini, periodo.fim]);

  const porPagina = 10;
  const totalPaginas = Math.max(1, Math.ceil(filtered.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const rows = filtered.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina);

  function toggleSort(col: keyof Orcamento) {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  }

  function exportCSV() {
    const header = ["Nº","Cliente","Técnico Responsável","Tipo","Obra","Valor","Responsável Comercial","Data","Status","Estágio","Probabilidade"];
    const linhas = filtered.map(o => [
      o.numero, o.cliente, o.cnpj, o.tipo, o.obra, o.valor, o.responsavel, o.data, o.status, o.estagio, `${o.probabilidade}%`,
    ]);
    const csv = [header, ...linhas].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `orcamentos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("CSV exportado.");
  }

  return (
    <div className="space-y-6">
      {/* Barra de controles */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-[#213368]">Dashboard Comercial</h2>
          <p className="text-xs text-muted-foreground">Orçamentos, conversão e funil.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border bg-white p-1 shadow-sm">
            {([
              ["mes", "Este mês"], ["trimestre", "3 meses"], ["ano", "Este ano"], ["custom", "Personalizado"],
            ] as [PeriodoTipo, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setPeriodoTipo(k)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${periodoTipo === k ? "bg-[#213368] text-white" : "text-[#213368] hover:bg-[#213368]/5"}`}>
                {l}
              </button>
            ))}
          </div>
          {periodoTipo === "custom" && (
            <div className="flex items-center gap-2">
              <Input type="date" value={customIni} onChange={e => setCustomIni(e.target.value)} className="w-40" />
              <span className="text-xs text-muted-foreground">até</span>
              <Input type="date" value={customFim} onChange={e => setCustomFim(e.target.value)} className="w-40" />
            </div>
          )}
          <Button onClick={() => setNovoOpen(true)} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
            <Plus className="mr-1 h-4 w-4" /> Novo orçamento
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Valor total" value={brl(metricas.total)} icon={DollarSign} />
        <Kpi label="Nº de orçamentos" value={String(metricas.qtd)} icon={FileText} />
        <Kpi label="Ticket médio" value={brl(metricas.ticket)} icon={TrendingUp} />
        <Kpi label="Taxa de conversão" value={`${metricas.conv.toFixed(0)}%`} icon={CheckCircle2} />
        <Kpi label="Em aberto" value={`${metricas.abertoNum} · ${brl(metricas.abertoValor)}`} icon={Clock} />
        <Kpi label="Vs. período anterior" value={`${metricas.cresc > 0 ? "↑" : metricas.cresc < 0 ? "↓" : "—"} ${Math.abs(metricas.cresc).toFixed(0)}%`}
             icon={Percent} tone={metricas.cresc >= 0 ? "up" : "down"} />
      </div>

      {/* Gráficos linha 1 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="text-sm font-semibold text-[#213368]">Evolução de orçamentos</div>
          <div className="mt-4 h-72">
            {metricas.meses.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={metricas.meses}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="mes" stroke="#6E7280" fontSize={12} />
                  <YAxis yAxisId="left" stroke="#6E7280" fontSize={12} tickFormatter={v => `${(v/1_000_000).toFixed(1)}M`} />
                  <YAxis yAxisId="right" orientation="right" stroke="#6E7280" fontSize={12} />
                  <Tooltip formatter={(v: number, n: string) => n === "Valor" ? brl(v) : v} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="valor" name="Valor" fill="#F37032" radius={[6,6,0,0]} />
                  <Line yAxisId="right" type="monotone" dataKey="qtd" name="Quantidade" stroke="#213368" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <Vazio />}
          </div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-semibold text-[#213368]">Orçamentos por status</div>
          <div className="mt-4 h-72 relative">
            {metricas.porStatus.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={metricas.porStatus} dataKey="value" nameKey="name" innerRadius={65} outerRadius={100} paddingAngle={3}>
                      {metricas.porStatus.map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" style={{ marginTop: -20 }}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</div>
                  <div className="text-lg font-extrabold text-[#213368]">{brl(metricas.total)}</div>
                </div>
              </>
            ) : <Vazio />}
          </div>
        </Card>
      </div>


      {/* Gráficos linha 3 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="text-sm font-semibold text-[#213368]">Funil comercial</div>
          <div className="mt-4 space-y-2">
            {metricas.funil.map((f, i) => {
              const max = Math.max(...metricas.funil.map(x => x.qtd), 1);
              const pct = (f.qtd / max) * 100;
              const inset = i * 8;
              return (
                <div key={f.estagio}>
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-[#213368]">{f.estagio}</span>
                    <span className="text-muted-foreground">{f.qtd} · {brl(f.valor)}</span>
                  </div>
                  <div className="mt-1 h-6 rounded-md bg-[#213368]/5" style={{ marginLeft: inset, marginRight: inset }}>
                    <div className="h-full rounded-md bg-gradient-to-r from-[#213368] to-[#F37032] transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-semibold text-[#213368]">Probabilidade média de fechamento por mês</div>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metricas.probMeses}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="mes" stroke="#6E7280" fontSize={12} />
                <YAxis stroke="#6E7280" fontSize={12} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Legend />
                <Line type="monotone" dataKey="prob" name="Probabilidade média" stroke="#F37032" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Tabela */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-[#213368]">Orçamentos</h3>
            <p className="text-xs text-muted-foreground">{filtered.length} resultado(s) no período.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={e => { setQ(e.target.value); setPagina(1); }} placeholder="Buscar cliente, nº, obra..." className="pl-9 w-64" />
            </div>
            <Select value={fStatus} onValueChange={v => { setFStatus(v); setPagina(1); }}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {STATUS_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportCSV}><Download className="mr-1 h-4 w-4" /> Exportar</Button>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTh label="Nº" col="numero" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Cliente" col="cliente" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Tipo" col="tipo" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Valor" col="valor" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Responsável" col="responsavel" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Data" col="data" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Status" col="status" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Nenhum orçamento encontrado.</TableCell></TableRow>
              ) : rows.map(o => (
                <TableRow key={o.id}>
                  <TableCell className="font-semibold">{o.numero}</TableCell>
                  <TableCell>{o.cliente}</TableCell>
                  <TableCell className="text-xs">{o.tipo}</TableCell>
                  <TableCell className="font-semibold">{brl(o.valor)}</TableCell>
                  <TableCell>{o.responsavel}</TableCell>
                  <TableCell>{new Date(o.data).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell><StatusBadge status={o.status} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setDetalhe(o)} aria-label="Ver detalhes"><Eye className="h-4 w-4 text-[#213368]" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditOpen(o)} aria-label="Editar"><Pencil className="h-4 w-4 text-[#213368]" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => { orcamentosActions.duplicar(o.id); toast.success("Orçamento duplicado."); }} aria-label="Duplicar"><Copy className="h-4 w-4 text-[#213368]" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setExcluir(o)} aria-label="Excluir"><Trash2 className="h-4 w-4 text-red-600" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {totalPaginas > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">Página {paginaAtual} de {totalPaginas}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={paginaAtual <= 1} onClick={() => setPagina(p => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={paginaAtual >= totalPaginas} onClick={() => setPagina(p => p + 1)}>Próxima</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Modais */}
      <OrcamentoForm open={novoOpen} onOpenChange={setNovoOpen} />
      <OrcamentoForm open={!!editOpen} onOpenChange={o => !o && setEditOpen(null)} orcamento={editOpen ?? undefined} />
      <DetalheDrawer orcamento={detalhe} onClose={() => setDetalhe(null)} onEdit={o => { setDetalhe(null); setEditOpen(o); }} />

      <AlertDialog open={!!excluir} onOpenChange={o => !o && setExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir orçamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O orçamento <b>{excluir?.numero}</b> será removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (excluir) { orcamentosActions.excluir(excluir.id); toast.success("Orçamento excluído."); setExcluir(null); } }} className="bg-red-600 hover:bg-red-700">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ------------------------------------------------------------
// Kpi
// ------------------------------------------------------------
function Kpi({ label, value, icon: Icon, tone }: {
  label: string; value: string; icon: React.ElementType; tone?: "up" | "down";
}) {
  const toneCls = tone === "up" ? "text-green-600" : tone === "down" ? "text-red-600" : "text-[#213368]";
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#213368] text-white">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className={`mt-3 text-xl font-extrabold ${toneCls}`}>{value}</div>
      <div className="mt-1 text-[11px] font-medium text-muted-foreground">{label}</div>
    </Card>
  );
}

function Vazio() {
  return <div className="grid h-full place-items-center text-sm text-muted-foreground">Sem dados no período.</div>;
}

function SortableTh({ label, col, sortBy, sortDir, onClick }: {
  label: string; col: keyof Orcamento; sortBy: keyof Orcamento; sortDir: "asc"|"desc"; onClick: (c: keyof Orcamento) => void;
}) {
  const Icon = sortBy !== col ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead>
      <button onClick={() => onClick(col)} className="inline-flex items-center gap-1 font-semibold hover:text-[#F37032]">
        {label} <Icon className="h-3 w-3" />
      </button>
    </TableHead>
  );
}

// ------------------------------------------------------------
// Formulário (Novo / Editar)
// ------------------------------------------------------------
function OrcamentoForm({ open, onOpenChange, orcamento }: {
  open: boolean; onOpenChange: (o: boolean) => void; orcamento?: Orcamento;
}) {
  const editing = !!orcamento;
  const [form, setForm] = useState(() => defaults(orcamento));
  const [erro, setErro] = useState("");

  useMemo(() => { if (open) { setForm(defaults(orcamento)); setErro(""); } }, [open, orcamento?.id]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const valorNum = parseValorBR(form.valor);
    if (!form.cliente.trim() || !form.obra.trim() || valorNum <= 0) {
      setErro("Cliente, obra e valor são obrigatórios.");
      return;
    }
    const payload = {
      numero: form.numero,
      cliente: form.cliente.trim(),
      cnpj: form.cnpj.trim(),
      tipo: form.tipo as TipoServico,
      obra: form.obra.trim(),
      descricao: form.descricao.trim(),
      valor: valorNum,
      responsavel: form.responsavel.trim(),
      data: form.data,
      validade: form.validade,
      status: form.status as OrcStatus,
      estagio: form.estagio as EstagioFunil,
      probabilidade: form.probabilidade,
      observacoes: form.observacoes.trim(),
    };

    if (editing && orcamento) {
      orcamentosActions.atualizar(orcamento.id, payload);
      toast.success("Orçamento atualizado.");
    } else {
      orcamentosActions.criar(payload);
      toast.success("Orçamento criado.");
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Editar orçamento" : "Novo orçamento"}</DialogTitle></DialogHeader>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
          <Campo label="Nº do orçamento"><Input value={form.numero} onChange={e => setForm({ ...form, numero: e.target.value })} /></Campo>
          <Campo label="Data de emissão"><DateBRInput value={form.data} onChange={iso => setForm({ ...form, data: iso })} /></Campo>
          <Campo label="Cliente *"><Input value={form.cliente} onChange={e => setForm({ ...form, cliente: e.target.value })} placeholder="Nome do cliente" /></Campo>
          <Campo label="Técnico responsável"><Input value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} placeholder="Nome do técnico responsável" /></Campo>
          <Campo label="Tipo de serviço">
            <Input value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} placeholder="Tipo de serviço" />
          </Campo>
          <Campo label="Responsável comercial">
            <Input value={form.responsavel} onChange={e => setForm({ ...form, responsavel: e.target.value })} placeholder="Nome do responsável comercial" />
          </Campo>
          <Campo label="Obra *" className="md:col-span-2"><Input value={form.obra} onChange={e => setForm({ ...form, obra: e.target.value })} placeholder="Descrição da obra" /></Campo>
          <Campo label="Descrição" className="md:col-span-2"><Textarea rows={2} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></Campo>
          <Campo label="Valor estimado (R$) *"><Input inputMode="decimal" placeholder="1.500,50" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} /></Campo>


          <Campo label="Status">
            <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
          <Campo label="Estágio">
            <Select value={form.estagio} onValueChange={v => setForm({ ...form, estagio: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ESTAGIO_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
          <Campo label={`Probabilidade de fechamento — ${form.probabilidade}%`} className="md:col-span-2">
            <Slider value={[form.probabilidade]} min={0} max={100} step={5} onValueChange={([v]) => setForm({ ...form, probabilidade: v })} />
          </Campo>
          <Campo label="Observações" className="md:col-span-2"><Textarea rows={3} value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></Campo>

          {erro && <div className="md:col-span-2 text-sm text-red-600">{erro}</div>}
          <DialogFooter className="md:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" className="bg-[#F37032] text-white hover:bg-[#ff8850]">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function defaults(o?: Orcamento) {
  const hoje = new Date().toISOString().slice(0, 10);
  const val30 = new Date(); val30.setDate(val30.getDate() + 30);
  return {
    numero: o?.numero ?? orcamentosActions.proximoNumero(),
    cliente: o?.cliente ?? "",
    cnpj: o?.cnpj ?? "",
    tipo: (o?.tipo ?? "") as string,
    obra: o?.obra ?? "",
    descricao: o?.descricao ?? "",
    valor: o?.valor ? o.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "",
    responsavel: o?.responsavel ?? "",
    data: o?.data ?? hoje,
    validade: o?.validade ?? val30.toISOString().slice(0, 10),
    status: (o?.status ?? "Em análise") as string,
    estagio: (o?.estagio ?? "Proposta enviada") as string,
    probabilidade: o?.probabilidade ?? 50,
    observacoes: o?.observacoes ?? "",
  };
}

function Campo({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid gap-2 ${className}`}>
      <label className="text-sm font-medium text-[#213368]">{label}</label>
      {children}
    </div>
  );
}

// ------------------------------------------------------------
// Drawer de detalhes
// ------------------------------------------------------------
function DetalheDrawer({ orcamento, onClose, onEdit }: {
  orcamento: Orcamento | null; onClose: () => void; onEdit: (o: Orcamento) => void;
}) {
  const [nota, setNota] = useState("");
  const atual = useOrcamentos(s => s.find(x => x.id === orcamento?.id));
  const o = atual ?? orcamento;
  if (!o) return null;

  return (
    <Sheet open={!!orcamento} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-[#213368]">{o.numero} · {o.cliente}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex flex-wrap gap-2">
          <StatusBadge status={o.status} />
          <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold">{o.estagio}</span>
          <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold">{o.tipo}</span>
        </div>

        <div className="mt-6 space-y-4">
          <Info label="Obra" value={o.obra} />
          {o.descricao && <Info label="Descrição" value={o.descricao} />}
          <div className="grid grid-cols-2 gap-4">
            <Info label="Valor" value={brl(o.valor)} />
            <Info label="Probabilidade" value={`${o.probabilidade}%`} />
            <Info label="Responsável comercial" value={o.responsavel} />
            <Info label="Técnico responsável" value={o.cnpj || "—"} />
            <Info label="Emissão" value={new Date(o.data).toLocaleDateString("pt-BR")} />
          </div>
          {o.observacoes && <Info label="Observações" value={o.observacoes} />}

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alterar status</div>
            <Select value={o.status} onValueChange={(v) => { orcamentosActions.atualizar(o.id, { status: v as OrcStatus }); toast.success("Status atualizado."); }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Histórico de status</div>
            <ol className="relative border-l-2 border-[#213368]/20 pl-4">
              {o.timeline.map((t, i) => (
                <li key={i} className="mb-3">
                  <div className="absolute -left-[7px] mt-1 h-3 w-3 rounded-full bg-[#F37032]" />
                  <div className="text-xs text-muted-foreground">{new Date(t.data).toLocaleString("pt-BR")} · {t.autor}</div>
                  <div className="text-sm font-semibold text-[#213368]">{t.de} → {t.para}</div>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notas</div>
            <div className="space-y-2">
              {o.notas.length === 0 && <div className="text-xs text-muted-foreground">Nenhuma nota ainda.</div>}
              {o.notas.map(n => (
                <div key={n.id} className="rounded-md border bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">{new Date(n.data).toLocaleString("pt-BR")} · {n.autor}</div>
                  <div className="text-sm">{n.texto}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Textarea rows={2} value={nota} onChange={e => setNota(e.target.value)} placeholder="Adicionar uma nota..." />
              <Button onClick={() => { if (nota.trim()) { orcamentosActions.adicionarNota(o.id, o.responsavel, nota.trim()); setNota(""); toast.success("Nota adicionada."); } }}
                      className="bg-[#213368] text-white hover:bg-[#213368]/90">Salvar</Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button onClick={() => onEdit(o)} className="bg-[#F37032] text-white hover:bg-[#ff8850]"><Pencil className="mr-1 h-4 w-4" /> Editar</Button>
            <Button variant="outline" onClick={() => { orcamentosActions.duplicar(o.id); toast.success("Duplicado."); onClose(); }}><Copy className="mr-1 h-4 w-4" /> Duplicar</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm text-[#213368]">{value}</div>
    </div>
  );
}
