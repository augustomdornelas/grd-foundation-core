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
  DollarSign, FileText, TrendingUp, CheckCircle2, Clock,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell, BarChart,
} from "recharts";
import {
  useOrcamentos, orcamentosActions, TIPOS_SERVICO, STATUS_LIST, RESPONSAVEIS,
  STATUS_COLORS, type Orcamento, type OrcStatus, type TipoServico,
  type Periodo, type PeriodoTipo, rangeDoPeriodo, rangeAnterior, dentro,
} from "@/lib/orcamentos-store";

import * as XLSX from "xlsx";


export const Route = createFileRoute("/app/comercial")({ component: Comercial });

const NOMES_MES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Extrai a parte numérica de "ORC_001_2026" ou "ORC-012" -> 1, 12
function numeroInt(s: string): number {
  const m = /(\d+)/.exec(s ?? "");
  return m ? parseInt(m[1], 10) : 0;
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
  const [loteOpen, setLoteOpen] = useState(false);

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
    const valorAprovado = noPer.filter(o => o.status === "Aprovado").reduce((a, o) => a + o.valor, 0);
    const conv = total > 0 ? (valorAprovado / total) * 100 : 0;
    const abertos = noPer.filter(o => o.status === "Levantamento" || o.status === "Aguardando Retorno" || o.status === "Em negociação");
    const abertoValor = abertos.reduce((a, o) => a + o.valor, 0);

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

    const clientesMap = new Map<string, number>();
    for (const o of noPer.filter(o => o.status === "Aprovado")) {
      const nome = (o.cliente || "").trim() || "—";
      clientesMap.set(nome, (clientesMap.get(nome) ?? 0) + o.valor);
    }
    const topClientes = Array.from(clientesMap.entries())
      .map(([cliente, valor]) => ({ cliente, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);

    return { total, qtd, ticket, conv, abertoNum: abertos.length, abertoValor, meses, porStatus, porTipo, porResp, topClientes };

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
    list.sort((a, b) => {
      let cmp: number;
      if (sortBy === "numero") {
        cmp = numeroInt(a.numero) - numeroInt(b.numero);
      } else {
        const va = a[sortBy] as unknown as string | number;
        const vb = b[sortBy] as unknown as string | number;
        cmp = typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [orcamentos, q, fStatus, sortBy, sortDir, periodo.tipo, periodo.ini, periodo.fim]);

  const porPagina = 10;
  const totalPaginas = Math.max(1, Math.ceil(filtered.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const rows = filtered.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina);

  function toggleSort(col: keyof Orcamento) {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  }

  function exportCSV() {
    const header = ["Nº", "Cliente", "Obra", "Valor (R$)", "Data", "Status", "Responsável Comercial", "Técnico Responsável", "Probabilidade"];
    const fmtData = (iso: string) => {
      if (!iso) return "";
      const [y, m, d] = iso.slice(0, 10).split("-");
      return d && m && y ? `${d}/${m}/${y}` : iso;
    };
    const dataRows = filtered.map(o => [
      o.numero,
      o.cliente,
      o.obra,
      Number(o.valor || 0),
      fmtData(o.data),
      o.status,
      o.responsavel,
      o.cnpj,
      (o.probabilidade || 0) / 100,
    ]);
    const totalValor = filtered.reduce((s, o) => s + (o.valor || 0), 0);
    const qtd = filtered.length;
    const ticket = qtd > 0 ? totalValor / qtd : 0;
    const totalsRow = ["TOTAIS", `${qtd} orçamentos`, "", Number(totalValor.toFixed(2)), "", "", "", `Ticket médio: ${Number(ticket.toFixed(2))}`, ""];


    const aoa: (string | number)[][] = [header, ...dataRows, [], totalsRow];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Column widths (auto-fit based on content)
    const colWidths = header.map((h, i) => {
      let max = String(h).length;
      for (const row of aoa) {
        const v = row[i];
        if (v == null) continue;
        const len = String(v).length;
        if (len > max) max = len;
      }
      return { wch: Math.min(Math.max(max + 2, 10), 50) };
    });
    ws["!cols"] = colWidths;

    // Formatting: header, alternating rows, currency and percentage
    const range = XLSX.utils.decode_range(ws["!ref"]!);
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[addr];
        if (!cell) continue;
        cell.s = cell.s || {};
        if (R === 0) {
          cell.s = {
            fill: { patternType: "solid", fgColor: { rgb: "213368" } },
            font: { bold: true, color: { rgb: "FFFFFF" } },
            alignment: { horizontal: "center", vertical: "center" },
          };
        } else if (R === range.e.r) {
          cell.s = {
            fill: { patternType: "solid", fgColor: { rgb: "E5E7EB" } },
            font: { bold: true, color: { rgb: "213368" } },
          };
          if (C === 3 && typeof cell.v === "number") cell.z = "#,##0.00";
        } else if (R > 0 && R < range.e.r - 1) {
          if (R % 2 === 0) {
            cell.s = { fill: { patternType: "solid", fgColor: { rgb: "F4F4F4" } } };
          }
          if (C === 3 && typeof cell.v === "number") cell.z = "#,##0.00";
          if (C === 9 && typeof cell.v === "number") cell.z = "0%";
        }
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Orçamentos GRD");
    const hoje = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `orcamentos-GRD-${hoje}.xlsx`);
    toast.success("Excel exportado.");
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
          <Button variant="outline" onClick={() => setLoteOpen(true)} className="border-[#213368] text-[#213368] hover:bg-[#213368]/5">
            <Plus className="mr-1 h-4 w-4" /> Lançar em lote
          </Button>
          <Button onClick={() => setNovoOpen(true)} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
            <Plus className="mr-1 h-4 w-4" /> Novo orçamento
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Valor total" value={brl(metricas.total)} icon={DollarSign} />
        <Kpi label="Nº de orçamentos" value={String(metricas.qtd)} icon={FileText} />
        <Kpi label="Ticket médio" value={brl(metricas.ticket)} icon={TrendingUp} />
        <Kpi label="Taxa de conversão" value={`${metricas.conv.toFixed(0)}%`} icon={CheckCircle2} />
        <Kpi label="Em aberto" value={`${metricas.abertoNum} · ${brl(metricas.abertoValor)}`} icon={Clock} />
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
                    <Pie data={metricas.porStatus} dataKey="value" nameKey="name" innerRadius={80} outerRadius={120} paddingAngle={3}>
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


      {/* Top clientes */}
      <div className="grid gap-6">
        <Card className="p-6">
          <div className="text-sm font-semibold text-[#213368]">Top 5 clientes — orçamentos aprovados</div>
          <div className="mt-4 h-72">
            {metricas.topClientes.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metricas.topClientes} layout="vertical" margin={{ left: 20, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                  <XAxis type="number" stroke="#6E7280" fontSize={12} tickFormatter={v => `${(v/1_000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="cliente" stroke="#6E7280" fontSize={12} width={140} />
                  <Tooltip formatter={(v: number) => brl(v)} />
                  <Bar dataKey="valor" name="Valor total" fill="#213368" radius={[0,6,6,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <Vazio />}
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
                <SortableTh label="Obra" col="obra" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
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
                  <TableCell className="text-xs">{o.obra}</TableCell>
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
      <BatchDialog open={loteOpen} onOpenChange={setLoteOpen} />
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
    status: (o?.status ?? "Levantamento") as string,

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

// ------------------------------------------------------------
// Lançar em lote
// ------------------------------------------------------------
type LoteRow = {
  numero: string;
  cliente: string;
  obra: string;
  valor: string;
  data: string; // ISO
  status: OrcStatus;
};

function novaLinha(numero: string): LoteRow {
  return {
    numero,
    cliente: "",
    obra: "",
    valor: "",
    data: new Date().toISOString().slice(0, 10),
    status: "Levantamento",
  };
}


// Próximo número sequencial baseado em um número base já usado (ex.: "ORC-003" + n)
function proximoNumeroApos(numeros: string[]): string {
  const usados = new Set(numeros.map(numeroInt).filter(n => n > 0));
  let n = 1;
  while (usados.has(n)) n++;
  return `ORC-${String(n).padStart(3, "0")}`;
}

function BatchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const orcamentos = useOrcamentos(s => s);
  const [rows, setRows] = useState<LoteRow[]>(() => [novaLinha(orcamentosActions.proximoNumero())]);
  const [erro, setErro] = useState("");

  useMemo(() => {
    if (open) {
      setRows([novaLinha(orcamentosActions.proximoNumero())]);
      setErro("");
    }
  }, [open]);

  function setRow(i: number, patch: Partial<LoteRow>) {
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function addRow() {
    setRows(rs => {
      const jaUsados = [
        ...orcamentos.map(o => o.numero),
        ...rs.map(r => r.numero),
      ];
      return [...rs, novaLinha(proximoNumeroApos(jaUsados))];
    });
  }
  function removeRow(i: number) { setRows(rs => rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs); }

  function salvar() {
    const validas = rows.filter(r => r.cliente.trim() || r.obra.trim() || r.valor.trim());
    if (validas.length === 0) { setErro("Adicione ao menos uma linha preenchida."); return; }
    for (const [i, r] of validas.entries()) {
      const v = parseValorBR(r.valor);
      if (!r.cliente.trim() || !r.obra.trim() || v <= 0 || !r.data) {
        setErro(`Linha ${i + 1}: Cliente, Obra, Valor e Data são obrigatórios.`);
        return;
      }
    }
    let criados = 0;
    for (const r of validas) {
      orcamentosActions.criar({
        numero: r.numero.trim() || undefined,
        cliente: r.cliente.trim(),
        cnpj: "",
        tipo: TIPOS_SERVICO[0],
        obra: r.obra.trim(),
        descricao: "",
        valor: parseValorBR(r.valor),
        responsavel: "",
        data: r.data,
        validade: r.data,
        status: r.status,
        probabilidade: 50,

        observacoes: "",
      });
      criados++;
    }
    toast.success(`${criados} orçamento(s) lançado(s) em lote.`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Lançar orçamentos em lote</DialogTitle></DialogHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-[#213368]">
                <th className="p-2 font-semibold">Nº orçamento</th>
                <th className="p-2 font-semibold">Cliente *</th>
                <th className="p-2 font-semibold">Obra *</th>
                <th className="p-2 font-semibold">Valor *</th>
                <th className="p-2 font-semibold">Data *</th>
                <th className="p-2 font-semibold">Status *</th>

                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b align-top">
                  <td className="p-1"><Input value={r.numero} onChange={e => setRow(i, { numero: e.target.value })} className="h-8 w-32" /></td>
                  <td className="p-1"><Input value={r.cliente} onChange={e => setRow(i, { cliente: e.target.value })} className="h-8 min-w-[140px]" /></td>
                  <td className="p-1"><Input value={r.obra} onChange={e => setRow(i, { obra: e.target.value })} className="h-8 min-w-[140px]" /></td>
                  <td className="p-1"><Input inputMode="decimal" placeholder="1.500,50" value={r.valor} onChange={e => setRow(i, { valor: e.target.value })} className="h-8 w-28" /></td>
                  <td className="p-1 w-36"><DateBRInput value={r.data} onChange={iso => setRow(i, { data: iso })} className="h-8" /></td>
                  <td className="p-1">
                    <Select value={r.status} onValueChange={v => setRow(i, { status: v as OrcStatus })}>
                      <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUS_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="p-1">
                    <Select value={r.estagio} onValueChange={v => setRow(i, { estagio: v as EstagioFunil })}>
                      <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>{ESTAGIO_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="p-1">
                    <Button type="button" size="icon" variant="ghost" onClick={() => removeRow(i)} aria-label="Remover linha">
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2">
          <Button type="button" variant="outline" onClick={addRow}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar linha
          </Button>
        </div>
        {erro && <div className="mt-2 text-sm text-red-600">{erro}</div>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={salvar} className="bg-[#F37032] text-white hover:bg-[#ff8850]">Salvar lote</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
