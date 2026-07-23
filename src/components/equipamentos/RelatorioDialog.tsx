/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, parse, differenceInCalendarDays, differenceInCalendarMonths, startOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/current-user";
import * as XLSX from "xlsx";
import {
  Document, Page, Text, View, StyleSheet, Image, pdf, Font,
} from "@react-pdf/renderer";

// ---------- Fonts ----------
try {
  Font.register({
    family: "Montserrat",
    fonts: [
      { src: "https://fonts.gstatic.com/s/montserrat/v25/JTUSjIg1_i6t8kCHKm459Wlhyw.ttf", fontWeight: 400 },
      { src: "https://fonts.gstatic.com/s/montserrat/v25/JTUSjIg1_i6t8kCHKm459WRhyzbi.ttf", fontWeight: 700 },
    ],
  });
} catch {}

// ---------- Constants ----------
const AZUL = "#213368";
const LARANJA = "#F37032";
const CINZA = "#F5F5F5";
const VERMELHO = "#DC2626";
const LOGO_URL = "https://grupogrdbrasil.com.br/logo_grd.jpeg";

// ---------- Helpers ----------
const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
const pct = (n: number) => `${(Number.isFinite(n) ? n : 0).toFixed(1)}%`;
const fmtDate = (d: Date | string | null | undefined) => {
  if (!d) return "-";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (!(dt instanceof Date) || isNaN(dt.getTime())) return "-";
  return format(dt, "dd/MM/yyyy", { locale: ptBR });
};
const normStatus = (s: string | null | undefined) =>
  (s ?? "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

function parseMask(v: string): Date | null {
  const t = v.trim();
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(t)) return null;
  const d = parse(t, "dd/MM/yyyy", new Date());
  return isNaN(d.getTime()) ? null : d;
}
function maskDate(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** custo_periodo → equivalente mensal (dia×30, semana×4.29, mês×1) */
function equivMensal(cp: number, unidade: string): number {
  const u = (unidade || "dia").toLowerCase();
  if (u.startsWith("mês") || u.startsWith("mes")) return cp;
  if (u.startsWith("sem")) return cp * 4.29;
  return cp * 30;
}
/** custo_periodo → diária equivalente */
function diariaEq(cp: number, unidade: string): number {
  const u = (unidade || "dia").toLowerCase();
  if (u.startsWith("mês") || u.startsWith("mes")) return cp / 30;
  if (u.startsWith("sem")) return cp / 7;
  return cp;
}
/** intersecção de dias entre [aI,aF] e [bI,bF] */
function intersecDias(aI: Date, aF: Date, bI: Date, bF: Date): number {
  const i = new Date(Math.max(aI.getTime(), bI.getTime()));
  const f = new Date(Math.min(aF.getTime(), bF.getTime()));
  const d = differenceInCalendarDays(f, i) + 1;
  return d > 0 ? d : 0;
}

// ---------- Types ----------
type Secao = "capa" | "frota" | "equipamentos" | "payback" | "clientes" | "manutencoes" | "ociosos";
const SECOES: { key: Secao; label: string }[] = [
  { key: "capa", label: "CAPA E SUMÁRIO EXECUTIVO" },
  { key: "frota", label: "FROTA POR STATUS E CATEGORIA" },
  { key: "equipamentos", label: "DETALHAMENTO POR EQUIPAMENTO" },
  { key: "payback", label: "ANÁLISE DE PAYBACK E RENTABILIDADE" },
  { key: "clientes", label: "RELATÓRIO POR CLIENTE" },
  { key: "manutencoes", label: "MANUTENÇÕES" },
  { key: "ociosos", label: "EQUIPAMENTOS OCIOSOS" },
];

type ReportData = {
  periodo: { inicio: Date; fim: Date; dias: number; meses: number };
  usuario: string;
  geradoEm: Date;
  resumo: {
    total: number; valorFrota: number; disp: number; alug: number; manut: number;
    receitaPeriodo: number; custoManutPeriodo: number; liquido: number; roiMedio: number;
  };
  frota: Array<{ categoria: string; total: number; disp: number; alug: number; manut: number; valor: number; pctValor: number }>;
  equipamentos: Array<{
    codigo: string; nome: string; categoria: string; status: string; valor: number;
    custoPeriodo: number; unidade: string;
    locacoes: number; diasAlug: number; utilizacao: number;
    receita: number; custoManut: number; liquido: number; payback: number;
  }>;
  payback: Array<{
    codigo: string; nome: string; valor: number; receitaHist: number; pctRecup: number;
    paybackReal: number; paybackTeorico: number; classe: "PAGO" | "SAUDÁVEL" | "ATENÇÃO" | "CRÍTICO";
  }>;
  classCount: Record<"PAGO" | "SAUDÁVEL" | "ATENÇÃO" | "CRÍTICO", number>;
  clientes: Array<{
    id: string; nome: string; qtdEquip: number; qtdLoc: number; totalDias: number;
    receita: number; ticket: number; prazoMedio: number;
    itens: Array<{ equip: string; saida: Date; prevista: Date | null; real: Date | null; status: string }>;
  }>;
  manutencoes: Array<{ equip: string; categoria: string; data: Date | null; tipo: string; descricao: string; custo: number; diasParado: number }>;
  manutAgreg: {
    custoTotal: number; custoMedio: number;
    topRazao: Array<{ equip: string; custoAcum: number; valor: number; razao: number }>;
  };
  ociosos: Array<{ codigo: string; nome: string; categoria: string; valor: number; oportunidade: number }>;
  ociososTotal: number;
  erros: string[];
};

// ---------- Data loader ----------
async function coletar(
  inicio: Date, fim: Date,
  categoriasSel: Set<string>, clientesSel: Set<string>,
  usuario: string,
): Promise<ReportData> {
  const erros: string[] = [];
  const dias = Math.max(1, differenceInCalendarDays(fim, inicio) + 1);
  const meses = Math.max(1, differenceInCalendarMonths(fim, inicio) + 1);

  const safe = async <T,>(nome: string, p: PromiseLike<{ data: T | null; error: any }>): Promise<T[]> => {
    try {
      const { data, error } = await p;
      if (error) { erros.push(nome); toast.error(`Falha ao carregar ${nome}: ${error.message}`); return []; }
      return (data as any) ?? [];
    } catch (e: any) { erros.push(nome); toast.error(`Falha ao carregar ${nome}: ${e?.message ?? e}`); return []; }
  };

  const [equipamentos, emprestimos, manutencoes, clientesTb, categoriasTb] = await Promise.all([
    safe<any>("equipamentos", supabase.from("equipamentos").select("*")),
    safe<any>("aluguéis", supabase.from("emprestimos").select("*")),
    safe<any>("manutenções", supabase.from("manutencoes").select("*")),
    safe<any>("clientes", supabase.from("clientes").select("*")),
    safe<any>("categorias", supabase.from("categorias_equipamentos").select("*")),
  ]);

  const filtroCat = (c: string) => categoriasSel.size === 0 || categoriasSel.has(c ?? "");
  const equipFilt = equipamentos.filter((e) => filtroCat(e.categoria));
  const equipIds = new Set(equipFilt.map((e) => e.id));

  const empPeriodo = emprestimos.filter((e) => {
    if (!equipIds.has(e.equipamento_id)) return false;
    if (clientesSel.size > 0 && !clientesSel.has(e.cliente_id ?? "")) return false;
    const di = e.data_inicio ? new Date(e.data_inicio) : null;
    const df = e.data_devolucao_real ? new Date(e.data_devolucao_real) : fim;
    if (!di) return false;
    return di <= fim && df >= inicio;
  });

  const manutPeriodo = manutencoes.filter((m) => {
    if (!equipIds.has(m.equipamento_id)) return false;
    const d = m.data ? new Date(m.data) : null;
    return d ? d >= inicio && d <= fim : false;
  });

  // Frota / resumo
  const valorFrota = equipFilt.reduce((s, e) => s + Number(e.valor ?? 0), 0);
  let disp = 0, alug = 0, manut = 0;
  equipFilt.forEach((e) => {
    const s = normStatus(e.status);
    if (s.includes("dispon")) disp++;
    else if (s.includes("alug") || s.includes("empre")) alug++;
    else if (s.includes("manut")) manut++;
  });

  // Receita e custo por equipamento
  const receitaPorEq = new Map<string, number>();
  const diasPorEq = new Map<string, number>();
  const locPorEq = new Map<string, number>();
  empPeriodo.forEach((e) => {
    const di = new Date(e.data_inicio);
    const df = e.data_devolucao_real ? new Date(e.data_devolucao_real) : fim;
    const d = intersecDias(inicio, fim, di, df);
    if (d <= 0) return;
    const eq = equipFilt.find((x) => x.id === e.equipamento_id);
    const diaria = diariaEq(Number(e.custo_periodo ?? eq?.custo_periodo ?? 0), e.unidade ?? eq?.unidade_periodo ?? "dia");
    receitaPorEq.set(e.equipamento_id, (receitaPorEq.get(e.equipamento_id) ?? 0) + diaria * d);
    diasPorEq.set(e.equipamento_id, (diasPorEq.get(e.equipamento_id) ?? 0) + d);
    locPorEq.set(e.equipamento_id, (locPorEq.get(e.equipamento_id) ?? 0) + 1);
  });

  const custoManutPorEq = new Map<string, number>();
  const diasParadoPorEq = new Map<string, number>();
  manutPeriodo.forEach((m) => {
    const c = Number(m.custo ?? (Number(m.custo_pecas ?? 0) + Number(m.custo_mao_obra ?? 0)));
    custoManutPorEq.set(m.equipamento_id, (custoManutPorEq.get(m.equipamento_id) ?? 0) + c);
    if (m.data && m.data_fim) {
      const d = Math.max(0, differenceInCalendarDays(new Date(m.data_fim), new Date(m.data)));
      diasParadoPorEq.set(m.equipamento_id, (diasParadoPorEq.get(m.equipamento_id) ?? 0) + d);
    }
  });

  const receitaTotal = Array.from(receitaPorEq.values()).reduce((s, v) => s + v, 0);
  const custoManutTotal = Array.from(custoManutPorEq.values()).reduce((s, v) => s + v, 0);
  const liquidoTotal = receitaTotal - custoManutTotal;

  // ROI médio: receita histórica / valor de cada equip
  const receitaHistPorEq = new Map<string, number>();
  emprestimos.filter((e) => equipIds.has(e.equipamento_id)).forEach((e) => {
    receitaHistPorEq.set(e.equipamento_id, (receitaHistPorEq.get(e.equipamento_id) ?? 0) + Number(e.custo_total ?? 0));
  });
  const rois = equipFilt
    .filter((e) => Number(e.valor ?? 0) > 0)
    .map((e) => ((receitaHistPorEq.get(e.id) ?? 0) / Number(e.valor)) * 100);
  const roiMedio = rois.length ? rois.reduce((s, v) => s + v, 0) / rois.length : 0;

  // Frota por categoria
  const catMap = new Map<string, { total: number; disp: number; alug: number; manut: number; valor: number }>();
  equipFilt.forEach((e) => {
    const cat = e.categoria || "SEM CATEGORIA";
    const cur = catMap.get(cat) ?? { total: 0, disp: 0, alug: 0, manut: 0, valor: 0 };
    cur.total++;
    cur.valor += Number(e.valor ?? 0);
    const s = normStatus(e.status);
    if (s.includes("dispon")) cur.disp++;
    else if (s.includes("alug") || s.includes("empre")) cur.alug++;
    else if (s.includes("manut")) cur.manut++;
    catMap.set(cat, cur);
  });
  const frota = Array.from(catMap.entries()).map(([categoria, v]) => ({
    categoria, ...v, pctValor: valorFrota > 0 ? (v.valor / valorFrota) * 100 : 0,
  })).sort((a, b) => b.valor - a.valor);

  // Detalhamento
  const equipamentosDet = equipFilt.map((e) => {
    const rec = receitaPorEq.get(e.id) ?? 0;
    const cm = custoManutPorEq.get(e.id) ?? 0;
    const d = diasPorEq.get(e.id) ?? 0;
    const util = dias > 0 ? (d / dias) * 100 : 0;
    const paybackMes = rec > 0 ? (Number(e.valor ?? 0) / ((rec / dias) * 30)) : 0;
    return {
      codigo: e.codigo ?? "", nome: e.nome ?? "", categoria: e.categoria ?? "",
      status: (e.status ?? "").toString().toUpperCase(),
      valor: Number(e.valor ?? 0),
      custoPeriodo: Number(e.custo_periodo ?? 0),
      unidade: (e.unidade_periodo ?? "dia").toString().toUpperCase(),
      locacoes: locPorEq.get(e.id) ?? 0,
      diasAlug: d, utilizacao: util,
      receita: rec, custoManut: cm, liquido: rec - cm, payback: paybackMes,
    };
  }).sort((a, b) => b.liquido - a.liquido);

  // Payback
  const payback = equipFilt.map((e) => {
    const valor = Number(e.valor ?? 0);
    const receitaHist = receitaHistPorEq.get(e.id) ?? 0;
    const primeira = emprestimos.filter((x) => x.equipamento_id === e.id && x.data_inicio)
      .map((x) => new Date(x.data_inicio).getTime()).sort()[0];
    const mesesHist = primeira
      ? Math.max(1, differenceInCalendarMonths(new Date(), new Date(primeira)) + 1) : 1;
    const receitaMediaMes = receitaHist / mesesHist;
    const paybackReal = receitaMediaMes > 0 ? valor / receitaMediaMes : 0;
    const em = equivMensal(Number(e.custo_periodo ?? 0), e.unidade_periodo ?? "dia");
    const paybackTeorico = em > 0 ? valor / em : 0;
    const pctRecup = valor > 0 ? Math.min(100, (receitaHist / valor) * 100) : 0;
    let classe: ReportData["payback"][number]["classe"];
    if (receitaHist >= valor && valor > 0) classe = "PAGO";
    else if (receitaHist <= 0 || paybackReal > 60) classe = "CRÍTICO";
    else if (paybackReal <= 30) classe = "SAUDÁVEL";
    else classe = "ATENÇÃO";
    return {
      codigo: e.codigo ?? "", nome: e.nome ?? "", valor,
      receitaHist, pctRecup, paybackReal, paybackTeorico, classe,
    };
  }).sort((a, b) => a.pctRecup - b.pctRecup);

  const classCount: ReportData["classCount"] = { PAGO: 0, "SAUDÁVEL": 0, "ATENÇÃO": 0, "CRÍTICO": 0 };
  payback.forEach((p) => classCount[p.classe]++);

  // Clientes
  const clienteMap = new Map<string, ReportData["clientes"][number]>();
  empPeriodo.forEach((e) => {
    const cid = e.cliente_id ?? "sem-id";
    const nomeCli = clientesTb.find((c) => c.id === cid)?.nome ?? e.destino ?? e.responsavel ?? "SEM CLIENTE";
    const equipObj = equipFilt.find((x) => x.id === e.equipamento_id);
    const di = new Date(e.data_inicio);
    const df = e.data_devolucao_real ? new Date(e.data_devolucao_real) : fim;
    const d = intersecDias(inicio, fim, di, df);
    const diaria = diariaEq(Number(e.custo_periodo ?? equipObj?.custo_periodo ?? 0), e.unidade ?? equipObj?.unidade_periodo ?? "dia");
    const receita = diaria * Math.max(0, d);
    const cur = clienteMap.get(cid) ?? { id: cid, nome: nomeCli, qtdEquip: 0, qtdLoc: 0, totalDias: 0, receita: 0, ticket: 0, prazoMedio: 0, itens: [] };
    cur.qtdLoc++;
    cur.totalDias += d;
    cur.receita += receita;
    const prevista = e.data_devolucao_prevista ? new Date(e.data_devolucao_prevista) : null;
    const real = e.data_devolucao_real ? new Date(e.data_devolucao_real) : null;
    let status = "EM ABERTO";
    if (real) status = "DEVOLVIDO";
    else if (prevista && prevista < new Date()) status = "EM ATRASO";
    cur.itens.push({ equip: equipObj?.nome ?? "-", saida: di, prevista, real, status });
    clienteMap.set(cid, cur);
  });
  const clientes = Array.from(clienteMap.values()).map((c) => {
    const equipsUnicos = new Set(c.itens.map((i) => i.equip));
    const prazos = c.itens.filter((i) => i.real).map((i) => differenceInCalendarDays(i.real!, i.saida));
    return {
      ...c,
      qtdEquip: equipsUnicos.size,
      ticket: c.qtdLoc ? c.receita / c.qtdLoc : 0,
      prazoMedio: prazos.length ? prazos.reduce((s, v) => s + v, 0) / prazos.length : 0,
    };
  }).sort((a, b) => b.receita - a.receita);

  // Manutenções
  const manutRows = manutPeriodo.map((m) => {
    const eq = equipFilt.find((x) => x.id === m.equipamento_id);
    const custo = Number(m.custo ?? (Number(m.custo_pecas ?? 0) + Number(m.custo_mao_obra ?? 0)));
    const diasP = m.data && m.data_fim ? Math.max(0, differenceInCalendarDays(new Date(m.data_fim), new Date(m.data))) : 0;
    return {
      equip: eq?.nome ?? "-", categoria: eq?.categoria ?? "-",
      data: m.data ? new Date(m.data) : null,
      tipo: (m.tipo ?? "").toString().toUpperCase(),
      descricao: (m.descricao ?? "").toString(),
      custo, diasParado: diasP,
    };
  }).sort((a, b) => (b.data?.getTime() ?? 0) - (a.data?.getTime() ?? 0));

  const custoTotalM = manutRows.reduce((s, v) => s + v.custo, 0);
  const equipsComManut = new Set(manutRows.map((m) => m.equip)).size;
  const custoMedioM = equipsComManut ? custoTotalM / equipsComManut : 0;
  const acumPorEq = new Map<string, { valor: number; custo: number }>();
  manutPeriodo.forEach((m) => {
    const eq = equipFilt.find((x) => x.id === m.equipamento_id);
    if (!eq) return;
    const cur = acumPorEq.get(eq.id) ?? { valor: Number(eq.valor ?? 0), custo: 0 };
    cur.custo += Number(m.custo ?? (Number(m.custo_pecas ?? 0) + Number(m.custo_mao_obra ?? 0)));
    acumPorEq.set(eq.id, cur);
  });
  const topRazao = Array.from(acumPorEq.entries()).map(([id, v]) => {
    const eq = equipFilt.find((x) => x.id === id);
    return { equip: eq?.nome ?? "-", custoAcum: v.custo, valor: v.valor, razao: v.valor > 0 ? (v.custo / v.valor) * 100 : 0 };
  }).sort((a, b) => b.custoAcum - a.custoAcum).slice(0, 10);

  // Ociosos
  const alugadosPeriodo = new Set(empPeriodo.map((e) => e.equipamento_id));
  const ociosos = equipFilt.filter((e) => !alugadosPeriodo.has(e.id)).map((e) => {
    const em = equivMensal(Number(e.custo_periodo ?? 0), e.unidade_periodo ?? "dia");
    return {
      codigo: e.codigo ?? "", nome: e.nome ?? "", categoria: e.categoria ?? "",
      valor: Number(e.valor ?? 0), oportunidade: em * meses,
    };
  }).sort((a, b) => b.valor - a.valor);
  const ociososTotal = ociosos.reduce((s, v) => s + v.valor, 0);

  return {
    periodo: { inicio, fim, dias, meses },
    usuario, geradoEm: new Date(),
    resumo: {
      total: equipFilt.length, valorFrota, disp, alug, manut,
      receitaPeriodo: receitaTotal, custoManutPeriodo: custoManutTotal,
      liquido: liquidoTotal, roiMedio,
    },
    frota, equipamentos: equipamentosDet, payback, classCount,
    clientes, manutencoes: manutRows,
    manutAgreg: { custoTotal: custoTotalM, custoMedio: custoMedioM, topRazao },
    ociosos, ociososTotal, erros,
  };
}

// ---------- PDF ----------
const s = StyleSheet.create({
  page: { padding: 30, paddingBottom: 50, fontFamily: "Montserrat", fontSize: 8, color: "#111" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottom: `1pt solid ${AZUL}`, paddingBottom: 6, marginBottom: 10 },
  logo: { width: 60, height: 30, objectFit: "contain" },
  headerTitle: { fontSize: 11, fontWeight: 700, color: AZUL },
  footer: { position: "absolute", bottom: 20, left: 30, right: 30, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#666" },
  h1: { fontSize: 16, fontWeight: 700, color: AZUL, marginBottom: 4, textTransform: "uppercase" },
  h2: { fontSize: 12, fontWeight: 700, color: AZUL, marginTop: 8, marginBottom: 6, textTransform: "uppercase" },
  small: { fontSize: 8, color: "#444" },
  row: { flexDirection: "row" },
  cellH: { backgroundColor: AZUL, color: "#fff", fontWeight: 700, padding: 4, fontSize: 8, textTransform: "uppercase" },
  cell: { padding: 4, fontSize: 8, borderBottom: "0.5pt solid #ddd" },
  cellAlt: { backgroundColor: CINZA },
  kpiWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  kpi: { width: "23%", padding: 6, backgroundColor: CINZA, borderLeft: `3pt solid ${AZUL}` },
  kpiL: { fontSize: 7, color: "#555", textTransform: "uppercase" },
  kpiV: { fontSize: 10, fontWeight: 700, color: AZUL },
  laranja: { color: LARANJA, fontWeight: 700 },
  vermelho: { color: VERMELHO, fontWeight: 700 },
  empty: { padding: 8, backgroundColor: CINZA, color: "#666", fontStyle: "italic" },
});

function HeaderPDF({ titulo }: { titulo: string }) {
  return (
    <View style={s.header} fixed>
      <Image src={LOGO_URL} style={s.logo} />
      <Text style={s.headerTitle}>{titulo.toUpperCase()}</Text>
    </View>
  );
}
function FooterPDF() {
  return (
    <View style={s.footer} fixed>
      <Text>GRUPO GRD PROJETOS E CONSTRUÇÕES · grupogrdbrasil.com.br</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}

function Table({ cols, rows, widths }: { cols: string[]; rows: (string | { text: string; color?: string })[][]; widths: number[] }) {
  if (rows.length === 0) return <Text style={s.empty}>NENHUM REGISTRO NO PERÍODO SELECIONADO</Text>;
  const total = widths.reduce((a, b) => a + b, 0);
  return (
    <View>
      <View style={s.row}>
        {cols.map((c, i) => (
          <Text key={i} style={[s.cellH, { width: `${(widths[i] / total) * 100}%` }]}>{c}</Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View style={s.row} key={ri} wrap={false}>
          {r.map((c, i) => {
            const alt = ri % 2 === 1 ? s.cellAlt : undefined;
            const val = typeof c === "string" ? c : c.text;
            const color = typeof c === "string" ? undefined : c.color;
            return (
              <Text key={i} style={[s.cell, alt as any, { width: `${(widths[i] / total) * 100}%`, color: color ?? "#111", fontWeight: color ? 700 : 400 }]}>
                {val}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function RelatorioPDF({ data, secoes }: { data: ReportData; secoes: Set<Secao> }) {
  const per = `${fmtDate(data.periodo.inicio)} A ${fmtDate(data.periodo.fim)}`;
  return (
    <Document>
      {/* CAPA */}
      {secoes.has("capa") && (
        <Page size="A4" orientation="landscape" style={s.page}>
          <HeaderPDF titulo="Relatório de Equipamentos" />
          <FooterPDF />
          <Text style={s.h1}>RELATÓRIO DE EQUIPAMENTOS</Text>
          <Text style={s.small}>PERÍODO: {per}</Text>
          <Text style={s.small}>GERADO EM: {fmtDate(data.geradoEm)} {format(data.geradoEm, "HH:mm")}</Text>
          <Text style={s.small}>USUÁRIO: {data.usuario.toUpperCase()}</Text>
          <Text style={s.h2}>SUMÁRIO EXECUTIVO</Text>
          <View style={s.kpiWrap}>
            {[
              ["TOTAL DE EQUIPAMENTOS", String(data.resumo.total)],
              ["VALOR TOTAL DA FROTA", brl(data.resumo.valorFrota)],
              ["DISPONÍVEIS", String(data.resumo.disp)],
              ["ALUGADOS", String(data.resumo.alug)],
              ["EM MANUTENÇÃO", String(data.resumo.manut)],
              ["RECEITA DO PERÍODO", brl(data.resumo.receitaPeriodo)],
              ["CUSTO MANUTENÇÃO", brl(data.resumo.custoManutPeriodo)],
              ["RESULTADO LÍQUIDO", brl(data.resumo.liquido)],
              ["ROI MÉDIO DA FROTA", pct(data.resumo.roiMedio)],
            ].map(([l, v], i) => (
              <View key={i} style={s.kpi}>
                <Text style={s.kpiL}>{l}</Text>
                <Text style={s.kpiV}>{v}</Text>
              </View>
            ))}
          </View>
        </Page>
      )}

      {/* FROTA */}
      {secoes.has("frota") && (
        <Page size="A4" orientation="landscape" style={s.page}>
          <HeaderPDF titulo="Frota por Status e Categoria" />
          <FooterPDF />
          <Text style={s.h1}>FROTA POR STATUS E CATEGORIA</Text>
          <Table
            cols={["CATEGORIA", "QTD", "DISPONÍVEIS", "ALUGADOS", "MANUTENÇÃO", "VALOR TOTAL", "% VALOR"]}
            widths={[3, 1, 1.2, 1.2, 1.2, 2, 1]}
            rows={[
              ...data.frota.map((f) => [
                (f.categoria || "-").toUpperCase(), String(f.total), String(f.disp), String(f.alug), String(f.manut), brl(f.valor), pct(f.pctValor),
              ]),
              [
                { text: "TOTAL", color: AZUL },
                { text: String(data.frota.reduce((s, x) => s + x.total, 0)), color: AZUL },
                { text: String(data.frota.reduce((s, x) => s + x.disp, 0)), color: AZUL },
                { text: String(data.frota.reduce((s, x) => s + x.alug, 0)), color: AZUL },
                { text: String(data.frota.reduce((s, x) => s + x.manut, 0)), color: AZUL },
                { text: brl(data.frota.reduce((s, x) => s + x.valor, 0)), color: AZUL },
                { text: "100,0%", color: AZUL },
              ],
            ]}
          />
        </Page>
      )}

      {/* EQUIPAMENTOS */}
      {secoes.has("equipamentos") && (
        <Page size="A4" orientation="landscape" style={s.page}>
          <HeaderPDF titulo="Detalhamento por Equipamento" />
          <FooterPDF />
          <Text style={s.h1}>DETALHAMENTO POR EQUIPAMENTO</Text>
          <Table
            cols={["CÓDIGO", "NOME", "CATEGORIA", "STATUS", "VALOR", "CUSTO/PER.", "LOC.", "DIAS", "UTIL.", "RECEITA", "MANUT.", "LÍQUIDO", "PAYBACK"]}
            widths={[1.2, 2.5, 1.8, 1.3, 1.5, 1.3, 0.7, 0.7, 0.9, 1.5, 1.3, 1.5, 1]}
            rows={data.equipamentos.map((e) => [
              e.codigo, e.nome, (e.categoria || "-").toUpperCase(), e.status,
              brl(e.valor), `${brl(e.custoPeriodo)}/${e.unidade}`,
              String(e.locacoes), String(e.diasAlug), pct(e.utilizacao),
              brl(e.receita), brl(e.custoManut),
              { text: brl(e.liquido), color: e.liquido < 0 ? LARANJA : undefined } as any,
              e.payback > 0 ? `${e.payback.toFixed(1)} M` : "-",
            ])}
          />
        </Page>
      )}

      {/* PAYBACK */}
      {secoes.has("payback") && (
        <Page size="A4" orientation="landscape" style={s.page}>
          <HeaderPDF titulo="Payback e Rentabilidade" />
          <FooterPDF />
          <Text style={s.h1}>ANÁLISE DE PAYBACK E RENTABILIDADE</Text>
          <View style={s.kpiWrap}>
            {(["PAGO", "SAUDÁVEL", "ATENÇÃO", "CRÍTICO"] as const).map((k) => (
              <View key={k} style={s.kpi}>
                <Text style={s.kpiL}>{k}</Text>
                <Text style={[s.kpiV, k === "CRÍTICO" ? { color: LARANJA } : {}]}>{data.classCount[k]}</Text>
              </View>
            ))}
          </View>
          <View style={{ height: 8 }} />
          <Table
            cols={["CÓDIGO", "NOME", "VALOR", "RECEITA ACUM.", "% RECUP.", "PAYBACK REAL", "PAYBACK TEÓRICO", "CLASSE"]}
            widths={[1, 3, 1.5, 1.7, 1, 1.3, 1.3, 1.2]}
            rows={data.payback.map((p) => [
              p.codigo, p.nome, brl(p.valor), brl(p.receitaHist), pct(p.pctRecup),
              p.paybackReal > 0 ? `${p.paybackReal.toFixed(1)} M` : "-",
              p.paybackTeorico > 0 ? `${p.paybackTeorico.toFixed(1)} M` : "-",
              { text: p.classe, color: p.classe === "CRÍTICO" ? LARANJA : p.classe === "PAGO" ? "#16a34a" : undefined } as any,
            ])}
          />
        </Page>
      )}

      {/* CLIENTES */}
      {secoes.has("clientes") && (
        <Page size="A4" orientation="landscape" style={s.page}>
          <HeaderPDF titulo="Relatório por Cliente" />
          <FooterPDF />
          <Text style={s.h1}>RELATÓRIO POR CLIENTE</Text>
          {data.clientes.length === 0 ? (
            <Text style={s.empty}>NENHUM REGISTRO NO PERÍODO SELECIONADO</Text>
          ) : (
            data.clientes.map((c, i) => (
              <View key={i} wrap={false} style={{ marginBottom: 10 }}>
                <Text style={[s.h2, { marginBottom: 2 }]}>{(c.nome || "-").toUpperCase()}</Text>
                <Text style={s.small}>
                  EQUIPAMENTOS: {c.qtdEquip} · LOCAÇÕES: {c.qtdLoc} · DIAS: {c.totalDias} · RECEITA: {brl(c.receita)} · TICKET MÉDIO: {brl(c.ticket)} · PRAZO MÉDIO: {c.prazoMedio.toFixed(1)} DIAS
                </Text>
                <View style={{ height: 4 }} />
                <Table
                  cols={["EQUIPAMENTO", "SAÍDA", "PREVISTA", "REAL", "STATUS"]}
                  widths={[3, 1, 1, 1, 1.2]}
                  rows={c.itens.map((it) => [
                    (it.equip || "-").toUpperCase(),
                    fmtDate(it.saida), fmtDate(it.prevista), fmtDate(it.real),
                    { text: it.status, color: it.status === "EM ATRASO" ? VERMELHO : undefined } as any,
                  ])}
                />
              </View>
            ))
          )}
        </Page>
      )}

      {/* MANUTENÇÕES */}
      {secoes.has("manutencoes") && (
        <Page size="A4" orientation="landscape" style={s.page}>
          <HeaderPDF titulo="Manutenções" />
          <FooterPDF />
          <Text style={s.h1}>MANUTENÇÕES</Text>
          <Table
            cols={["EQUIPAMENTO", "CATEGORIA", "DATA", "TIPO", "DESCRIÇÃO", "CUSTO", "DIAS PARADO"]}
            widths={[2.5, 1.7, 1, 1.2, 3.5, 1.3, 1]}
            rows={data.manutencoes.map((m) => [
              (m.equip || "-").toUpperCase(), (m.categoria || "-").toUpperCase(),
              fmtDate(m.data), m.tipo, m.descricao, brl(m.custo), String(m.diasParado),
            ])}
          />
          <Text style={s.h2}>AGREGADO</Text>
          <Text style={s.small}>CUSTO TOTAL: {brl(data.manutAgreg.custoTotal)} · CUSTO MÉDIO POR EQUIPAMENTO: {brl(data.manutAgreg.custoMedio)}</Text>
          <View style={{ height: 6 }} />
          <Text style={s.h2}>TOP 10 · CUSTO DE MANUTENÇÃO / VALOR</Text>
          <Table
            cols={["EQUIPAMENTO", "CUSTO ACUM.", "VALOR", "RAZÃO"]}
            widths={[3, 1.5, 1.5, 1]}
            rows={data.manutAgreg.topRazao.map((t) => [
              (t.equip || "-").toUpperCase(), brl(t.custoAcum), brl(t.valor),
              { text: pct(t.razao) + (t.razao > 20 ? " (SUBSTITUIR)" : ""), color: t.razao > 20 ? LARANJA : undefined } as any,
            ])}
          />
        </Page>
      )}

      {/* OCIOSOS */}
      {secoes.has("ociosos") && (
        <Page size="A4" orientation="landscape" style={s.page}>
          <HeaderPDF titulo="Equipamentos Ociosos" />
          <FooterPDF />
          <Text style={s.h1}>EQUIPAMENTOS OCIOSOS</Text>
          <Table
            cols={["CÓDIGO", "NOME", "CATEGORIA", "VALOR IMOBILIZADO", "CUSTO DE OPORTUNIDADE"]}
            widths={[1, 3, 2, 1.6, 1.8]}
            rows={data.ociosos.map((o) => [
              o.codigo, o.nome, (o.categoria || "-").toUpperCase(), brl(o.valor), brl(o.oportunidade),
            ])}
          />
          <Text style={s.h2}>TOTAL IMOBILIZADO OCIOSO: {brl(data.ociososTotal)}</Text>
        </Page>
      )}
    </Document>
  );
}

// ---------- Excel ----------
function gerarExcel(data: ReportData, secoes: Set<Secao>, nome: string) {
  const wb = XLSX.utils.book_new();
  const addSheet = (title: string, rows: any[][], colWidths?: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    if (rows[0]) {
      // bold headers
      for (let c = 0; c < rows[0].length; c++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c });
        if (ws[addr]) ws[addr].s = { font: { bold: true } };
      }
    }
    if (colWidths) ws["!cols"] = colWidths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));
  };

  if (secoes.has("capa")) {
    addSheet("RESUMO", [
      ["INDICADOR", "VALOR"],
      ["PERÍODO", `${fmtDate(data.periodo.inicio)} A ${fmtDate(data.periodo.fim)}`],
      ["GERADO EM", `${fmtDate(data.geradoEm)} ${format(data.geradoEm, "HH:mm")}`],
      ["USUÁRIO", data.usuario.toUpperCase()],
      ["TOTAL DE EQUIPAMENTOS", data.resumo.total],
      ["VALOR TOTAL DA FROTA", data.resumo.valorFrota],
      ["DISPONÍVEIS", data.resumo.disp],
      ["ALUGADOS", data.resumo.alug],
      ["EM MANUTENÇÃO", data.resumo.manut],
      ["RECEITA DO PERÍODO", data.resumo.receitaPeriodo],
      ["CUSTO MANUTENÇÃO PERÍODO", data.resumo.custoManutPeriodo],
      ["RESULTADO LÍQUIDO", data.resumo.liquido],
      ["ROI MÉDIO %", Number(data.resumo.roiMedio.toFixed(2))],
    ], [32, 22]);
  }
  if (secoes.has("frota")) {
    addSheet("FROTA", [
      ["CATEGORIA", "QTD", "DISPONÍVEIS", "ALUGADOS", "MANUTENÇÃO", "VALOR TOTAL", "% VALOR"],
      ...data.frota.map((f) => [f.categoria.toUpperCase(), f.total, f.disp, f.alug, f.manut, f.valor, Number(f.pctValor.toFixed(2))]),
    ], [30, 8, 12, 10, 12, 16, 10]);
  }
  if (secoes.has("equipamentos")) {
    addSheet("EQUIPAMENTOS", [
      ["CÓDIGO", "NOME", "CATEGORIA", "STATUS", "VALOR", "CUSTO PERÍODO", "UNIDADE", "LOCAÇÕES", "DIAS ALUGADO", "UTILIZAÇÃO %", "RECEITA", "CUSTO MANUT.", "LÍQUIDO", "PAYBACK (MESES)"],
      ...data.equipamentos.map((e) => [
        e.codigo, e.nome, e.categoria.toUpperCase(), e.status, e.valor, e.custoPeriodo, e.unidade,
        e.locacoes, e.diasAlug, Number(e.utilizacao.toFixed(2)), e.receita, e.custoManut, e.liquido, Number(e.payback.toFixed(2)),
      ]),
    ], [12, 30, 20, 16, 14, 14, 10, 10, 12, 12, 14, 14, 14, 14]);
  }
  if (secoes.has("payback")) {
    addSheet("PAYBACK", [
      ["CÓDIGO", "NOME", "VALOR", "RECEITA ACUMULADA", "% RECUPERADO", "PAYBACK REAL (M)", "PAYBACK TEÓRICO (M)", "CLASSE"],
      ...data.payback.map((p) => [
        p.codigo, p.nome, p.valor, p.receitaHist, Number(p.pctRecup.toFixed(2)),
        Number(p.paybackReal.toFixed(2)), Number(p.paybackTeorico.toFixed(2)), p.classe,
      ]),
    ], [12, 30, 14, 16, 14, 16, 18, 12]);
  }
  if (secoes.has("clientes")) {
    addSheet("CLIENTES", [
      ["CLIENTE", "QTD EQUIP.", "LOCAÇÕES", "DIAS TOTAL", "RECEITA", "TICKET MÉDIO", "PRAZO MÉDIO (DIAS)"],
      ...data.clientes.map((c) => [
        c.nome.toUpperCase(), c.qtdEquip, c.qtdLoc, c.totalDias, c.receita, Number(c.ticket.toFixed(2)), Number(c.prazoMedio.toFixed(1)),
      ]),
      [],
      ["CLIENTE", "EQUIPAMENTO", "SAÍDA", "PREVISTA", "REAL", "STATUS"],
      ...data.clientes.flatMap((c) =>
        c.itens.map((i) => [
          c.nome.toUpperCase(), (i.equip || "").toUpperCase(),
          fmtDate(i.saida), fmtDate(i.prevista), fmtDate(i.real), i.status,
        ]),
      ),
    ], [30, 20, 16, 12, 12, 12, 12]);
  }
  if (secoes.has("manutencoes")) {
    addSheet("MANUTENÇÕES", [
      ["EQUIPAMENTO", "CATEGORIA", "DATA", "TIPO", "DESCRIÇÃO", "CUSTO", "DIAS PARADO"],
      ...data.manutencoes.map((m) => [
        m.equip.toUpperCase(), m.categoria.toUpperCase(), fmtDate(m.data), m.tipo, m.descricao, m.custo, m.diasParado,
      ]),
      [],
      ["AGREGADO", ""],
      ["CUSTO TOTAL", data.manutAgreg.custoTotal],
      ["CUSTO MÉDIO POR EQUIP", data.manutAgreg.custoMedio],
      [],
      ["TOP 10 CUSTO/VALOR"],
      ["EQUIPAMENTO", "CUSTO ACUM.", "VALOR", "RAZÃO %"],
      ...data.manutAgreg.topRazao.map((t) => [t.equip.toUpperCase(), t.custoAcum, t.valor, Number(t.razao.toFixed(2))]),
    ], [30, 20, 12, 14, 40, 14, 12]);
  }
  if (secoes.has("ociosos")) {
    addSheet("OCIOSOS", [
      ["CÓDIGO", "NOME", "CATEGORIA", "VALOR IMOBILIZADO", "CUSTO DE OPORTUNIDADE"],
      ...data.ociosos.map((o) => [o.codigo, o.nome, o.categoria.toUpperCase(), o.valor, o.oportunidade]),
      [],
      ["TOTAL IMOBILIZADO OCIOSO", data.ociososTotal],
    ], [12, 30, 20, 20, 22]);
  }

  XLSX.writeFile(wb, nome);
}

// ---------- Dialog ----------
export function RelatorioDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const usuario = useCurrentUser();
  const hoje = new Date();
  const inicioAno = startOfYear(hoje);

  const [ini, setIni] = useState(format(inicioAno, "dd/MM/yyyy"));
  const [fim, setFim] = useState(format(hoje, "dd/MM/yyyy"));
  const [categorias, setCategorias] = useState<{ id: string; nome: string }[]>([]);
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
  const [catSel, setCatSel] = useState<Set<string>>(new Set());
  const [cliSel, setCliSel] = useState<Set<string>>(new Set());
  const [secoes, setSecoes] = useState<Set<Secao>>(new Set(SECOES.map((s) => s.key)));
  const [formato, setFormato] = useState<"pdf" | "xlsx">("pdf");
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [cats, clis] = await Promise.all([
        supabase.from("categorias_equipamentos").select("id,nome").order("nome"),
        supabase.from("clientes").select("id,nome").order("nome"),
      ]);
      setCategorias((cats.data ?? []) as any);
      setClientes((clis.data ?? []) as any);
    })();
  }, [open]);

  const toggle = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set);
    n.has(v) ? n.delete(v) : n.add(v);
    return n;
  };

  async function gerar() {
    const di = parseMask(ini);
    const df = parseMask(fim);
    if (!di || !df) { toast.error("Datas inválidas — use DD/MM/YYYY"); return; }
    if (di > df) { toast.error("Data inicial deve ser anterior à final"); return; }
    if (secoes.size === 0) { toast.error("Selecione ao menos uma seção"); return; }

    setGerando(true);
    try {
      const catNomes = new Set(categorias.filter((c) => catSel.has(c.id)).map((c) => c.nome));
      const data = await coletar(di, df, catNomes, cliSel, usuario?.nome ?? "USUÁRIO");
      const stamp = format(new Date(), "dd-MM-yyyy");
      if (formato === "pdf") {
        const blob = await pdf(<RelatorioPDF data={data} secoes={secoes} />).toBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `relatorio-equipamentos-${stamp}.pdf`; a.click();
        URL.revokeObjectURL(url);
      } else {
        gerarExcel(data, secoes, `relatorio-equipamentos-${stamp}.xlsx`);
      }
      toast.success("Relatório gerado");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Erro ao gerar: ${e?.message ?? e}`);
    } finally {
      setGerando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#213368]">GERAR RELATÓRIO DE EQUIPAMENTOS</DialogTitle>
        </DialogHeader>

        {gerando ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-[#213368]" />
            <p className="text-sm font-semibold text-[#213368]">GERANDO RELATÓRIO...</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Período */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>DATA INICIAL</Label>
                <Input value={ini} onChange={(e) => setIni(maskDate(e.target.value))} placeholder="DD/MM/AAAA" maxLength={10} />
              </div>
              <div>
                <Label>DATA FINAL</Label>
                <Input value={fim} onChange={(e) => setFim(maskDate(e.target.value))} placeholder="DD/MM/AAAA" maxLength={10} />
              </div>
            </div>

            {/* Categorias */}
            <div>
              <Label className="mb-2 block">
                CATEGORIAS ({catSel.size === 0 ? "TODAS" : `${catSel.size} SELECIONADAS`})
              </Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-32 overflow-y-auto border rounded p-2">
                {categorias.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox checked={catSel.has(c.id)} onCheckedChange={() => setCatSel((s) => toggle(s, c.id))} />
                    {c.nome}
                  </label>
                ))}
                {categorias.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma categoria cadastrada</p>}
              </div>
            </div>

            {/* Clientes */}
            <div>
              <Label className="mb-2 block">
                CLIENTES ({cliSel.size === 0 ? "TODOS" : `${cliSel.size} SELECIONADOS`})
              </Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-32 overflow-y-auto border rounded p-2">
                {clientes.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox checked={cliSel.has(c.id)} onCheckedChange={() => setCliSel((s) => toggle(s, c.id))} />
                    {c.nome}
                  </label>
                ))}
                {clientes.length === 0 && <p className="text-xs text-muted-foreground">Nenhum cliente cadastrado</p>}
              </div>
            </div>

            {/* Seções */}
            <div>
              <Label className="mb-2 block">SEÇÕES A INCLUIR</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {SECOES.map((s) => (
                  <label key={s.key} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox checked={secoes.has(s.key)} onCheckedChange={() => setSecoes((cur) => toggle(cur, s.key))} />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Formato */}
            <div>
              <Label className="mb-2 block">FORMATO</Label>
              <RadioGroup value={formato} onValueChange={(v) => setFormato(v as "pdf" | "xlsx")} className="flex gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="pdf" /> PDF
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="xlsx" /> EXCEL (XLSX)
                </label>
              </RadioGroup>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={gerando}>CANCELAR</Button>
          <Button onClick={gerar} disabled={gerando} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
            {gerando ? "GERANDO..." : "GERAR"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
