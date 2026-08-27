// ============================================================
// /app/comercial — Dashboard Comercial (completo)
// ------------------------------------------------------------
// - KPIs, 6 gráficos, filtros, tabela com CRUD, drawer de
//   detalhes, exportação CSV, timeline e notas.
// - Fonte única: orcamentos-store (compartilhada com /app).
// ============================================================
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { PlanejamentoCampos } from "@/components/planejamento/PlanejamentoCampos";
import {
  formParaValores, valoresParaForm, mesmoPlanejamento, planejamentoVazio,
  type PlanejamentoValores,
} from "@/lib/planejamento-campos";
import { projetoDoOrcamento, aplicarPlanejamentoNoProjeto } from "@/lib/projeto-auto";
import { toast } from "sonner";
import {
  Plus, Search, Download, Eye, Pencil, Copy, Trash2, ArrowUpDown, ArrowUp, ArrowDown,
  DollarSign, FileText, TrendingUp, CheckCircle2, Clock, HandshakeIcon,
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
import { supabase } from "@/integrations/supabase/client";
import { brl, brlCompacto, paraNumero, pct } from "@/lib/formato";
import { InputMoeda } from "@/components/ui/input-moeda";
import { StatusComNotaDialog, type MudancaPendente } from "@/components/comercial/StatusComNotaDialog";
import { HistoricoNotas } from "@/components/comercial/HistoricoNotas";
import { InatividadeBadge } from "@/components/comercial/InatividadeBadge";
import { contadorInatividade } from "@/lib/orcamento-notas";
import { ResponsavelSelect } from "@/components/portal/ResponsavelSelect";
import { ResponsavelFiltro, FiltroChip } from "@/components/portal/ResponsavelFiltro";
import { useResponsaveis, nomeDoResponsavel } from "@/lib/responsaveis-store";
import * as XLSX from "xlsx";


function ComercialError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h2 className="text-lg font-bold text-red-700">Erro ao carregar o Comercial</h2>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-red-800">
          {error?.message ?? String(error)}
        </p>
        <button
          onClick={() => { reset(); }}
          className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

type ComercialSearch = { novoOrc?: string; descricao?: string; valor?: string };
export const Route = createFileRoute("/app/comercial")({
  component: Comercial,
  errorComponent: ComercialError,
  validateSearch: (s: Record<string, unknown>): ComercialSearch => ({
    novoOrc: typeof s.novoOrc === "string" ? s.novoOrc : undefined,
    descricao: typeof s.descricao === "string" ? s.descricao : undefined,
    valor: typeof s.valor === "string" ? s.valor : (typeof s.valor === "number" ? String(s.valor) : undefined),
  }),
});

// Coerção defensiva para somas (valor pode vir null/undefined do banco)
function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

const NOMES_MES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// Extrai a parte numérica de "ORC_001_2026" ou "ORC-012" -> 1, 12
function numeroInt(s: string): number {
  const m = /(\d+)/.exec(s ?? "");
  return m ? parseInt(m[1], 10) : 0;
}

// "1.500,50" | "1500.50" | "1500,50" | "1500" -> 1500.5
// A leitura em si mora em @/lib/formato (mesma regra do site inteiro);
// aqui fica só o contrato antigo de devolver 0, e não null, quando não
// há nada aproveitável — a importação de planilha depende disso.
function parseValorBR(s: string): number {
  return paraNumero(s) ?? 0;
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
function toISODate(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.includes("/")) {
    const [d, m, y] = value.split("/");
    if (!d || !m || !y) return null;
    return `${y}-${m}-${d}`;
  }
  return value;
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
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  // ---------- Filtro de período ----------
  const [periodoTipo, setPeriodoTipo] = useState<PeriodoTipo>("ano");
  const [customIni, setCustomIni] = useState("");
  const [customFim, setCustomFim] = useState("");
  const periodo: Periodo = { tipo: periodoTipo, ini: customIni, fim: customFim };

  // ---------- Filtros da tabela ----------
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState<string>("todos");
  const [fTecnicos, setFTecnicos] = useState<string[]>([]);
  const [fComerciais, setFComerciais] = useState<string[]>([]);
  const [fDias, setFDias] = useState<string>("todos");
  const [sortBy, setSortBy] = useState<keyof Orcamento>("numero");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [pagina, setPagina] = useState(1);
  const responsaveis = useResponsaveis(s => s);

  // ---------- Modais / drawer ----------
  const [novoOpen, setNovoOpen] = useState(false);
  const [novoPreset, setNovoPreset] = useState<{ descricao?: string; valor?: number } | undefined>(undefined);
  const [editOpen, setEditOpen] = useState<Orcamento | null>(null);
  const [detalhe, setDetalhe] = useState<Orcamento | null>(null);
  const [excluir, setExcluir] = useState<Orcamento | null>(null);
  const [loteOpen, setLoteOpen] = useState(false);

  useEffect(() => {
    if (search.novoOrc === "1") {
      const valorNum = search.valor ? Number(search.valor) : undefined;
      setNovoPreset({
        descricao: search.descricao,
        valor: Number.isFinite(valorNum) ? valorNum : undefined,
      });
      setNovoOpen(true);
      navigate({ search: {}, replace: true });
    }
  }, [search.novoOrc, search.descricao, search.valor, navigate]);


  // ---------- Métricas do período ----------
  const metricas = useMemo(() => {
    const range = rangeDoPeriodo(periodo);
    const rangeAnt = rangeAnterior(periodo);
    const noPer = orcamentos.filter(o => dentro(o.data, range));
    const noAnt = orcamentos.filter(o => dentro(o.data, rangeAnt));

    const total = noPer.reduce((a, o) => a + num(o.valor), 0);
    const totalAnt = noAnt.reduce((a, o) => a + num(o.valor), 0);
    const qtd = noPer.length;
    const ticket = qtd ? total / qtd : 0;
    const valorAprovado = noPer.filter(o => o.status === "APROVADO").reduce((a, o) => a + num(o.valor), 0);
    const conv = total > 0 ? (valorAprovado / total) * 100 : 0;
    const abertos = noPer.filter(o => o.status === "LEVANTAMENTO" || o.status === "AGUARDANDO RETORNO" || o.status === "EM NEGOCIAÇÃO");
    const abertoValor = abertos.reduce((a, o) => a + num(o.valor), 0);
    const emNegociacaoValor = noPer.filter(o => o.status === "EM NEGOCIAÇÃO").reduce((a, o) => a + num(o.valor), 0);

    const hoje = new Date();
    const meses: { mes: string; valor: number; qtd: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const dNext = new Date(hoje.getFullYear(), hoje.getMonth() - i + 1, 1);
      const inRange = d >= range.ini || dNext > range.ini;
      const lst = orcamentos.filter(o => {
        if (!o.data) return false;
        const od = new Date(o.data);
        if (isNaN(od.getTime())) return false;
        return od >= d && od < dNext && od >= range.ini && od <= range.fim;
      });
      if (!inRange && !lst.length) continue;
      meses.push({
        mes: `${NOMES_MES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
        valor: lst.reduce((a, o) => a + num(o.valor), 0),
        qtd: lst.length,
      });
    }

    const porStatus = STATUS_LIST.map(st => ({
      name: st, value: noPer.filter(o => o.status === st).length, color: STATUS_COLORS[st],
    })).filter(x => x.value > 0);

    const porTipo = TIPOS_SERVICO.map(t => {
      const lst = noPer.filter(o => o.tipo === t);
      return { tipo: t, valor: lst.reduce((a, o) => a + num(o.valor), 0), qtd: lst.length };
    }).sort((a, b) => b.valor - a.valor);

    const porResp = RESPONSAVEIS.map(r => {
      const lst = noPer.filter(o => o.responsavel === r);
      return { responsavel: r.split(" ")[0], valor: lst.reduce((a, o) => a + num(o.valor), 0), qtd: lst.length };
    });

    const clientesMap = new Map<string, number>();
    for (const o of noPer.filter(o => o.status === "APROVADO")) {
      const nome = (o.cliente || "").trim() || "—";
      clientesMap.set(nome, (clientesMap.get(nome) ?? 0) + num(o.valor));
    }
    const topClientes = Array.from(clientesMap.entries())
      .map(([cliente, valor]) => ({ cliente, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);

    // Acompanhamento por status — últimos 6 meses (independe do filtro)
    const acompanhamento: { mes: string; APROVADO: number; "EM NEGOCIAÇÃO": number; "AGUARDANDO RETORNO": number; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const dNext = new Date(hoje.getFullYear(), hoje.getMonth() - i + 1, 1);
      const lst = orcamentos.filter(o => {
        if (!o.data) return false;
        const od = new Date(o.data);
        if (isNaN(od.getTime())) return false;
        return od >= d && od < dNext;
      });
      const aprov = lst.filter(o => o.status === "APROVADO").reduce((a, o) => a + num(o.valor), 0);
      const neg = lst.filter(o => o.status === "EM NEGOCIAÇÃO").reduce((a, o) => a + num(o.valor), 0);
      const ag = lst.filter(o => o.status === "AGUARDANDO RETORNO").reduce((a, o) => a + num(o.valor), 0);
      acompanhamento.push({
        mes: `${NOMES_MES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
        APROVADO: aprov,
        "EM NEGOCIAÇÃO": neg,
        "AGUARDANDO RETORNO": ag,
        total: aprov + neg + ag,
      });
    }

    return { total, qtd, ticket, conv, abertoNum: abertos.length, abertoValor, emNegociacaoValor, meses, porStatus, porTipo, porResp, topClientes, acompanhamento };

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
    if (fTecnicos.length) list = list.filter(o => o.responsavelTecnicoId && fTecnicos.includes(o.responsavelTecnicoId));
    if (fComerciais.length) list = list.filter(o => o.responsavelComercialId && fComerciais.includes(o.responsavelComercialId));
    if (fDias !== "todos") {
      // O contador só existe em EM NEGOCIAÇÃO e AGUARDANDO RETORNO; nos
      // demais status contadorInatividade devolve null e o orçamento sai
      // do resultado, que é o esperado num filtro por dias parados.
      const minimo = Number(fDias);
      list = list.filter(o => {
        const c = contadorInatividade(o);
        return c !== null && c.dias > minimo;
      });
    }
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
  }, [orcamentos, q, fStatus, fTecnicos, fComerciais, fDias, sortBy, sortDir, periodo.tipo, periodo.ini, periodo.fim]);

  const temFiltro = fStatus !== "todos" || fTecnicos.length > 0 || fComerciais.length > 0 || fDias !== "todos" || q !== "";
  function limparFiltros() {
    setQ(""); setFStatus("todos"); setFTecnicos([]); setFComerciais([]); setFDias("todos"); setPagina(1);
  }

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
    // Mesma resolução do drawer: o nome vinculado ganha do texto antigo, para
    // a planilha não mostrar uma grafia diferente da que está na tela.
    const dataRows = filtered.map(o => [
      o.numero,
      o.cliente,
      o.obra,
      Number(o.valor || 0),
      fmtData(o.data),
      o.status,
      nomeDoResponsavel(responsaveis, o.responsavelComercialId) || o.responsavel,
      nomeDoResponsavel(responsaveis, o.responsavelTecnicoId) || o.cnpj,
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
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Valor total" value={brl(metricas.total)} icon={DollarSign} />
        <Kpi label="Nº de orçamentos" value={String(metricas.qtd)} icon={FileText} />
        <Kpi label="Ticket médio" value={brl(metricas.ticket)} icon={TrendingUp} />
        <Kpi label="Taxa de conversão" value={pct(metricas.conv, 0)} icon={CheckCircle2} />
        <Kpi label="Em aberto" value={`${metricas.abertoNum} · ${brl(metricas.abertoValor)}`} icon={Clock} />
        <Kpi label="EM NEGOCIAÇÃO" value={brl(metricas.emNegociacaoValor)} icon={HandshakeIcon} />
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
                  <YAxis yAxisId="left" stroke="#6E7280" fontSize={12} tickFormatter={brlCompacto} />
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
                  <XAxis type="number" stroke="#6E7280" fontSize={12} tickFormatter={brlCompacto} />
                  <YAxis type="category" dataKey="cliente" stroke="#6E7280" fontSize={12} width={140} />
                  <Tooltip formatter={(v: number) => brl(v)} />
                  <Bar dataKey="valor" name="Valor total" fill="#213368" radius={[0,6,6,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <Vazio />}
          </div>
        </Card>
      </div>


      {/* Acompanhamento por status — últimos 6 meses */}
      <div className="grid gap-6">
        <Card className="p-6">
          <div className="text-sm font-semibold text-[#213368]">Acompanhamento por status</div>
          <div className="text-xs text-muted-foreground">APROVADO · EM NEGOCIAÇÃO · AGUARDANDO RETORNO</div>
          <div className="mt-4" style={{ height: 320 }}>
            {metricas.acompanhamento.some(m => m.total > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={metricas.acompanhamento} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="mes" stroke="#6E7280" fontSize={12} style={{ fontFamily: "Montserrat" }} />
                  <YAxis yAxisId="left" stroke="#6E7280" fontSize={12} tickFormatter={brlCompacto} />
                  <YAxis yAxisId="right" orientation="right" stroke="#6E7280" fontSize={12} tickFormatter={brlCompacto} />
                  <Tooltip
                    formatter={(v: number) => brl(v)}
                    labelStyle={{ fontFamily: "Montserrat", color: "#213368", fontWeight: 700 }}
                    contentStyle={{ fontFamily: "Montserrat", borderRadius: 8, border: "1px solid #E5E7EB" }}
                  />
                  <Legend wrapperStyle={{ fontFamily: "Montserrat", fontSize: 12 }} />
                  <Bar yAxisId="left" dataKey="APROVADO" fill="#16A34A" radius={[4,4,0,0]} />
                  <Bar yAxisId="left" dataKey="EM NEGOCIAÇÃO" fill="#213368" radius={[4,4,0,0]} />
                  <Bar yAxisId="left" dataKey="AGUARDANDO RETORNO" fill="#F37032" radius={[4,4,0,0]} />
                  <Line yAxisId="right" type="monotone" dataKey="total" name="Total" stroke="#213368" strokeWidth={2.5} dot={{ r: 4, fill: "#F37032" }} />
                </ComposedChart>
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
            <ResponsavelFiltro
              papel="tecnico" rotulo="Técnico" className="w-44"
              selecionados={fTecnicos}
              onChange={ids => { setFTecnicos(ids); setPagina(1); }}
            />
            <ResponsavelFiltro
              papel="comercial" rotulo="Comercial" className="w-44"
              selecionados={fComerciais}
              onChange={ids => { setFComerciais(ids); setPagina(1); }}
            />
            <Select value={fDias} onValueChange={v => { setFDias(v); setPagina(1); }}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Dias parados" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Qualquer tempo parado</SelectItem>
                <SelectItem value="7">Mais de 7 dias parados</SelectItem>
                <SelectItem value="15">Mais de 15 dias parados</SelectItem>
                <SelectItem value="30">Mais de 30 dias parados</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportCSV}><Download className="mr-1 h-4 w-4" /> Exportar</Button>
          </div>
        </div>

        {temFiltro && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {q && <FiltroChip label={`Busca: ${q}`} onRemove={() => { setQ(""); setPagina(1); }} />}
            {fStatus !== "todos" && <FiltroChip label={fStatus} onRemove={() => { setFStatus("todos"); setPagina(1); }} />}
            {fTecnicos.map(id => (
              <FiltroChip key={id} label={`Técnico: ${nomeDoResponsavel(responsaveis, id) || "—"}`}
                onRemove={() => { setFTecnicos(v => v.filter(x => x !== id)); setPagina(1); }} />
            ))}
            {fComerciais.map(id => (
              <FiltroChip key={id} label={`Comercial: ${nomeDoResponsavel(responsaveis, id) || "—"}`}
                onRemove={() => { setFComerciais(v => v.filter(x => x !== id)); setPagina(1); }} />
            ))}
            {fDias !== "todos" && <FiltroChip label={`Parados há mais de ${fDias} dias`} onRemove={() => { setFDias("todos"); setPagina(1); }} />}
            <button type="button" onClick={limparFiltros} className="text-xs font-semibold text-[#F37032] hover:underline">
              Limpar filtros
            </button>
          </div>
        )}

        <div className="mt-5 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTh label="Nº" col="numero" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Cliente" col="cliente" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Obra" col="obra" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Valor" col="valor" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Responsável" col="responsavel" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="ÚLTIMA ATUALIZAÇÃO" col="ultimaAtualizacao" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
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
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span>{o.ultimaAtualizacao ? new Date(o.ultimaAtualizacao).toLocaleDateString("pt-BR") : "—"}</span>
                      <InatividadeBadge orcamento={o} />
                    </div>
                  </TableCell>
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
      <OrcamentoForm open={novoOpen} onOpenChange={(o) => { setNovoOpen(o); if (!o) setNovoPreset(undefined); }} preset={novoPreset} />
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
function OrcamentoForm({ open, onOpenChange, orcamento, preset }: {
  open: boolean; onOpenChange: (o: boolean) => void; orcamento?: Orcamento;
  preset?: { descricao?: string; valor?: number };
}) {
  const editing = !!orcamento;
  const [form, setForm] = useState(() => defaults(orcamento, preset));
  const [erro, setErro] = useState("");
  const [clientes, setClientes] = useState<{id:string;nome:string}[]>([]);
  const [buscaCliente, setBuscaCliente] = useState("");
  // Orçamento que já virou projeto e teve o planejamento alterado: o
  // projeto só é atualizado se a pessoa confirmar.
  const [sobrescrever, setSobrescrever] = useState<
    { projetoId: string; planejamento: PlanejamentoValores } | null
  >(null);
  // Mudança de status pedida pelo formulário: o resto já foi salvo e só
  // falta a nota. Enquanto ela não é confirmada, o status não muda.
  const [mudanca, setMudanca] = useState<MudancaPendente | null>(null);

  useEffect(() => {
    if (!open) return;
    supabase.from("clientes").select("id,nome").order("nome").then(({data}) => setClientes(data ?? []));
  }, [open]);
  useMemo(() => { if (open) { setForm(defaults(orcamento, preset)); setErro(""); } }, [open, orcamento?.id, preset?.descricao, preset?.valor]);


  /**
   * Último passo da edição: o projeto não é atualizado em silêncio — se o
   * planejamento mudou, pergunta antes de sobrescrever o que está no projeto.
   */
  async function finalizar(orcamentoId: string, novoPlan: PlanejamentoValores) {
    if (!planejamentoVazio(novoPlan)) {
      const proj = await projetoDoOrcamento(orcamentoId);
      if (proj && !mesmoPlanejamento(proj.planejamento, novoPlan)) {
        setSobrescrever({ projetoId: proj.id, planejamento: novoPlan });
        return;
      }
    }
    onOpenChange(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const valorNum = form.valor ?? 0;
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
      responsavelTecnicoId: form.responsavelTecnicoId,
      responsavelComercialId: form.responsavelComercialId,
      data: toISODate(form.data) as unknown as string,
      validade: toISODate(form.validade) as unknown as string,
      status: form.status as OrcStatus,
      probabilidade: form.probabilidade,
      observacoes: form.observacoes.trim(),
      planejamento: formParaValores(form.planejamento),
    };


    if (editing && orcamento) {
      // `status` sai do patch: a mudança de status nunca viaja junto com o
      // resto do formulário, ela passa pelo diálogo de nota.
      const { status: _status, ...semStatus } = payload;
      const { error } = await orcamentosActions.atualizar(orcamento.id, semStatus);
      if (error) {
        toast.error(`Erro ao salvar orçamento: ${error.message ?? "erro desconhecido"}`);
        return;
      }
      toast.success("Orçamento atualizado.");

      if (payload.status !== orcamento.status) {
        setMudanca({
          orcamentoId: orcamento.id,
          numero: orcamento.numero,
          de: orcamento.status,
          para: payload.status,
        });
        return;
      }
      await finalizar(orcamento.id, payload.planejamento);
      return;
    }
    const { error } = await orcamentosActions.criar(payload);
    if (error) {
      toast.error(`Erro ao criar orçamento: ${error.message ?? "erro desconhecido"}`);
      return;
    }
    toast.success("Orçamento criado.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Editar orçamento" : "Novo orçamento"}</DialogTitle></DialogHeader>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
          <Campo label="Nº do orçamento"><Input value={form.numero} onChange={e => setForm({ ...form, numero: e.target.value })} /></Campo>
          <Campo label="Data de emissão"><DateBRInput value={form.data} onChange={iso => setForm({ ...form, data: iso })} /></Campo>
          <Campo label="Cliente *" className="relative">
            <Input value={buscaCliente || form.cliente} onChange={e => { setBuscaCliente(e.target.value); setForm({ ...form, cliente: e.target.value }); }} placeholder="Buscar ou digitar cliente..." />
            {buscaCliente && clientes.filter(c => c.nome.toLowerCase().includes(buscaCliente.toLowerCase())).length > 0 && (
              <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-white shadow-lg">
                {clientes.filter(c => c.nome.toLowerCase().includes(buscaCliente.toLowerCase())).map(c => (
                  <button key={c.id} type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-[#213368]/5 hover:text-[#213368]"
                    onClick={() => { setForm({ ...form, cliente: c.nome }); setBuscaCliente(""); }}>
                    {c.nome}
                  </button>
                ))}
              </div>
            )}
          </Campo>
          <Campo label="Técnico responsável">
            <ResponsavelSelect
              papel="tecnico"
              value={form.responsavelTecnicoId}
              fallbackNome={form.cnpj}
              onChange={id => setForm({ ...form, responsavelTecnicoId: id })}
            />
          </Campo>
          <Campo label="Tipo de serviço">
            <Input value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} placeholder="Tipo de serviço" />
          </Campo>
          <Campo label="Responsável comercial">
            <ResponsavelSelect
              papel="comercial"
              value={form.responsavelComercialId}
              fallbackNome={form.responsavel}
              onChange={id => setForm({ ...form, responsavelComercialId: id })}
            />
          </Campo>
          <Campo label="Obra *" className="md:col-span-2"><Input value={form.obra} onChange={e => setForm({ ...form, obra: e.target.value })} placeholder="Descrição da obra" /></Campo>
          <Campo label="Descrição" className="md:col-span-2"><Textarea rows={2} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></Campo>
          <Campo label="Valor estimado *"><InputMoeda valor={form.valor} onChange={v => setForm({ ...form, valor: v })} placeholder="1.500,50" /></Campo>


          <Campo label="Status">
            <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            {editing && form.status !== orcamento?.status && (
              <p className="text-xs text-[#F37032]">
                Ao salvar, será pedida uma nota explicando a mudança de status.
              </p>
            )}
          </Campo>

          <Campo label={`Probabilidade de fechamento — ${form.probabilidade}%`} className="md:col-span-2">
            <Slider value={[form.probabilidade]} min={0} max={100} step={5} onValueChange={([v]) => setForm({ ...form, probabilidade: v })} />
          </Campo>
          <div className="md:col-span-2">
            <PlanejamentoCampos
              form={form.planejamento}
              onChange={pl => setForm({ ...form, planejamento: pl })}
              valorBase={form.valor ?? 0}
            />
          </div>

          <Campo label="Observações" className="md:col-span-2"><Textarea rows={3} value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></Campo>

          {erro && <div className="md:col-span-2 text-sm text-red-600">{erro}</div>}
          <DialogFooter className="md:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" className="bg-[#F37032] text-white hover:bg-[#ff8850]">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <StatusComNotaDialog
        mudanca={mudanca}
        onCancelar={() => {
          // O resto do formulário já foi salvo; só o status ficou como estava.
          setMudanca(null);
          toast.info("Status mantido — a mudança precisa de uma nota.");
          onOpenChange(false);
        }}
        onConcluido={() => {
          const pendente = mudanca;
          setMudanca(null);
          if (pendente) void finalizar(pendente.orcamentoId, formParaValores(form.planejamento));
          else onOpenChange(false);
        }}
      />

      <AlertDialog open={!!sobrescrever} onOpenChange={o => { if (!o) { setSobrescrever(null); onOpenChange(false); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Atualizar o planejamento do projeto?</AlertDialogTitle>
            <AlertDialogDescription>
              Este orçamento já virou projeto, e o projeto tem um planejamento diferente do que
              você acabou de salvar aqui. O orçamento já foi atualizado; o projeto só muda se
              você confirmar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setSobrescrever(null); onOpenChange(false); }}>
              Manter o do projeto
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!sobrescrever) return;
                const ok = await aplicarPlanejamentoNoProjeto(sobrescrever.projetoId, sobrescrever.planejamento);
                toast[ok ? "success" : "error"](
                  ok ? "Planejamento do projeto atualizado." : "Não foi possível atualizar o projeto.",
                );
                setSobrescrever(null);
                onOpenChange(false);
              }}
              className="bg-[#213368] hover:bg-[#2a4185]"
            >
              Atualizar o projeto
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function defaults(o?: Orcamento, preset?: { descricao?: string; valor?: number }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const val30 = new Date(); val30.setDate(val30.getDate() + 30);
  const presetValor = preset?.valor;
  return {
    numero: o?.numero ?? orcamentosActions.proximoNumero(),
    cliente: o?.cliente ?? "",
    cnpj: o?.cnpj ?? "",
    tipo: (o?.tipo ?? "") as string,
    obra: o?.obra ?? "",
    descricao: o?.descricao ?? preset?.descricao ?? "",
    // Number: o campo de valor cuida sozinho de exibir "1.500,50" e de ler
    // a vírgula de volta, então o formulário não guarda mais texto formatado.
    valor: (o?.valor
      ?? (typeof presetValor === "number" && Number.isFinite(presetValor) ? presetValor : null)) as number | null,
    responsavel: o?.responsavel ?? "",
    responsavelTecnicoId: o?.responsavelTecnicoId ?? null,
    responsavelComercialId: o?.responsavelComercialId ?? null,
    data: o?.data ?? hoje,
    validade: o?.validade ?? val30.toISOString().slice(0, 10),
    status: (o?.status ?? "LEVANTAMENTO") as string,

    probabilidade: o?.probabilidade ?? 50,
    observacoes: o?.observacoes ?? "",
    planejamento: valoresParaForm(o?.planejamento),
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
  const atual = useOrcamentos(s => s.find(x => x.id === orcamento?.id));
  const responsaveis = useResponsaveis(s => s);
  const o = atual ?? orcamento;
  // Mudança de status pedida pelo select do drawer, aguardando a nota.
  const [mudanca, setMudanca] = useState<MudancaPendente | null>(null);
  // Incrementado quando uma nota é gravada fora do histórico (mudança de
  // status), para o componente recarregar a lista.
  const [versaoNotas, setVersaoNotas] = useState(0);

  if (!o) return null;

  return (
    <Sheet open={!!orcamento} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-[#213368]">{o.numero} · {o.cliente}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusBadge status={o.status} />
          <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold">{o.tipo}</span>
          <InatividadeBadge orcamento={o} />
        </div>

        <div className="mt-6 space-y-4">
          <Info label="Obra" value={o.obra} />
          {o.descricao && <Info label="Descrição" value={o.descricao} />}
          <div className="grid grid-cols-2 gap-4">
            <Info label="Valor" value={brl(o.valor)} />
            <Info label="Probabilidade" value={`${o.probabilidade}%`} />
            <Info label="Responsável comercial" value={nomeDoResponsavel(responsaveis, o.responsavelComercialId) || o.responsavel || "—"} />
            <Info label="Técnico responsável" value={nomeDoResponsavel(responsaveis, o.responsavelTecnicoId) || o.cnpj || "—"} />
            <Info label="Emissão" value={new Date(o.data).toLocaleDateString("pt-BR")} />
          </div>
          {o.observacoes && <Info label="Observações" value={o.observacoes} />}

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alterar status</div>
            <Select
              value={o.status}
              onValueChange={v => {
                if (v === o.status) return;
                setMudanca({ orcamentoId: o.id, numero: o.numero, de: o.status, para: v as OrcStatus });
              }}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Toda mudança de status pede uma nota — as duas gravam juntas.
            </p>
          </div>

          <HistoricoNotas orcamentoId={o.id} recarregarEm={versaoNotas} />

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button onClick={() => onEdit(o)} className="bg-[#F37032] text-white hover:bg-[#ff8850]"><Pencil className="mr-1 h-4 w-4" /> Editar</Button>
            <Button variant="outline" onClick={() => { orcamentosActions.duplicar(o.id); toast.success("Duplicado."); onClose(); }}><Copy className="mr-1 h-4 w-4" /> Duplicar</Button>
          </div>
        </div>

        <StatusComNotaDialog
          mudanca={mudanca}
          onCancelar={() => setMudanca(null)}
          onConcluido={() => { setMudanca(null); setVersaoNotas(v => v + 1); }}
        />
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
  valor: number | null;
  data: string; // ISO
  status: OrcStatus;
};

function novaLinha(numero: string): LoteRow {
  return {
    numero,
    cliente: "",
    obra: "",
    valor: null,
    data: new Date().toISOString().slice(0, 10),
    status: "LEVANTAMENTO",
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
    const validas = rows.filter(r => r.cliente.trim() || r.obra.trim() || r.valor !== null);
    if (validas.length === 0) { setErro("Adicione ao menos uma linha preenchida."); return; }
    for (const [i, r] of validas.entries()) {
      const v = r.valor ?? 0;
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
        valor: r.valor ?? 0,
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
                  <td className="p-1"><InputMoeda valor={r.valor} onChange={v => setRow(i, { valor: v })} prefixo={null} placeholder="1.500,50" className="h-8 w-28" /></td>
                  <td className="p-1 w-36"><DateBRInput value={r.data} onChange={iso => setRow(i, { data: iso })} className="h-8" /></td>
                  <td className="p-1">
                    <Select value={r.status} onValueChange={v => setRow(i, { status: v as OrcStatus })}>
                      <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUS_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
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
