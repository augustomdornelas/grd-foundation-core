// ============================================================
// Painel inicial — dashboard completo em tempo real (Supabase)
// ============================================================
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/mock-data";
import { StatusBadge } from "@/components/portal/StatusBadge";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, PieChart, Pie, Cell, Legend, ComposedChart,
} from "recharts";
import {
  FileText, DollarSign, CheckCircle2, Percent, Target, Handshake,
  FolderKanban, ClipboardList, Wallet, TrendingUp,
  Package, PackageCheck, PackageX, Wrench, BarChart3, Activity,
} from "lucide-react";

export const Route = createFileRoute("/app/")({ component: PainelHome });

const NAVY = "#213368";
const ORANGE = "#F37032";
const MESES = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];

const ORC_COLORS: Record<string, string> = {
  "APROVADO": "#16a34a",
  "LEVANTAMENTO": "#0ea5e9",
  "AGUARDANDO RETORNO": "#f59e0b",
  "EM NEGOCIAÇÃO": "#F37032",
  "NÃO APROVADO": "#ef4444",
  "CANCELADO": "#64748b",
};
const PROJ_COLORS: Record<string, string> = {
  "PLANEJAMENTO": "#0ea5e9",
  "EM ANDAMENTO": "#F37032",
  "CONCLUÍDO": "#16a34a",
  "PAUSADO": "#f59e0b",
};
const EQ_COLORS: Record<string, string> = {
  "DISPONÍVEL": "#16a34a",
  "ALUGADO": "#F37032",
  "MANUTENÇÃO": "#ef4444",
};

type Row = Record<string, any>;

function diffDias(ini: string, fim: string): number {
  if (!ini || !fim) return 0;
  const a = new Date(ini).getTime(); const b = new Date(fim).getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}
function receitaEmprestimo(e: Row): number {
  const total = Number(e.custo_total ?? 0);
  if (total > 0) return total;
  const fim = e.data_devolucao_real ?? e.data_devolucao_prevista;
  const dias = diffDias(e.data_inicio, fim);
  const unidade = String(e.unidade ?? "dia").toLowerCase();
  const cp = Number(e.custo_periodo ?? 0);
  if (unidade.startsWith("mes") || unidade.startsWith("mês")) return cp * Math.max(1, Math.ceil(dias / 30));
  if (unidade.startsWith("sem")) return cp * Math.max(1, Math.ceil(dias / 7));
  return cp * dias;
}
function noAno(iso: string | null | undefined, ano: number): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getFullYear() === ano;
}

function PainelHome() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState<number>(anoAtual);
  const [loading, setLoading] = useState(true);
  const [orcamentos, setOrcamentos] = useState<Row[]>([]);
  const [projetos, setProjetos] = useState<Row[]>([]);
  const [medicoes, setMedicoes] = useState<Row[]>([]);
  const [equipamentos, setEquipamentos] = useState<Row[]>([]);
  const [emprestimos, setEmprestimos] = useState<Row[]>([]);
  const [manutencoes, setManutencoes] = useState<Row[]>([]);
  const [clientes, setClientes] = useState<Row[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [orc, proj, med, eq, emp, man, cli] = await Promise.all([
        supabase.from("orcamentos").select("*"),
        supabase.from("projetos").select("*"),
        supabase.from("medicoes").select("*"),
        supabase.from("equipamentos").select("*"),
        supabase.from("emprestimos").select("*"),
        supabase.from("manutencoes").select("*"),
        supabase.from("clientes").select("id, nome"),
      ]);
      if (!alive) return;
      setOrcamentos(orc.data ?? []);
      setProjetos(proj.data ?? []);
      setMedicoes(med.data ?? []);
      setEquipamentos(eq.data ?? []);
      setEmprestimos(emp.data ?? []);
      setManutencoes(man.data ?? []);
      setClientes(cli.data ?? []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const anosDisponiveis = useMemo(() => {
    const set = new Set<number>([anoAtual]);
    orcamentos.forEach(o => { if (o.data_emissao) set.add(new Date(o.data_emissao).getFullYear()); });
    medicoes.forEach(m => { if (m.data) set.add(new Date(m.data).getFullYear()); });
    return Array.from(set).sort((a, b) => b - a);
  }, [orcamentos, medicoes, anoAtual]);

  // === COMERCIAL ===
  const orcAno = useMemo(() => orcamentos.filter(o => noAno(o.data_emissao, ano)), [orcamentos, ano]);
  const totalOrc = orcAno.length;
  const valorOrc = orcAno.reduce((a, o) => a + (Number(o.valor) || 0), 0);
  const aprovados = orcAno.filter(o => o.status === "APROVADO");
  const valorAprovado = aprovados.reduce((a, o) => a + (Number(o.valor) || 0), 0);
  const taxaAprov = totalOrc > 0 ? (aprovados.length / totalOrc) * 100 : 0;
  const ticket = aprovados.length > 0 ? valorAprovado / aprovados.length : 0;
  const emNeg = orcAno.filter(o => o.status === "EM NEGOCIAÇÃO");
  const valorEmNeg = emNeg.reduce((a, o) => a + (Number(o.valor) || 0), 0);

  // === OPERACIONAL ===
  const projAndamento = projetos.filter(p => p.status === "EM ANDAMENTO");
  const projConcluidosAno = projetos.filter(p => p.status === "CONCLUÍDO" && (
    noAno(p.data_inicio, ano) || noAno(p.prazo, ano) || noAno(p.created_at, ano)
  ));
  const medAno = useMemo(() => medicoes.filter(m => noAno(m.data, ano)), [medicoes, ano]);
  const totalMed = medAno.length;
  const faturado = medAno.filter(m => m.data_recebimento).reduce((a, m) => a + (Number(m.valor) || 0), 0);
  const saldoFaturar = Math.max(0, valorAprovado - faturado);

  // === EQUIPAMENTOS ===
  const totalEq = equipamentos.length;
  const disponiveis = equipamentos.filter(e => e.status === "DISPONÍVEL").length;
  const alugados = equipamentos.filter(e => e.status === "ALUGADO").length;
  const emManut = equipamentos.filter(e => e.status === "MANUTENÇÃO").length;
  const empAno = useMemo(() => emprestimos.filter(e => noAno(e.data_inicio, ano)), [emprestimos, ano]);
  const receitaEq = empAno.reduce((a, e) => a + receitaEmprestimo(e), 0);
  const taxaUtil = totalEq > 0 ? (alugados / totalEq) * 100 : 0;

  // === CHARTS ===
  const orcPorMes = useMemo(() => {
    const arr = MESES.map((m, i) => ({ mes: m, qtd: 0, valor: 0, _i: i }));
    orcAno.forEach(o => {
      if (!o.data_emissao) return;
      const i = new Date(o.data_emissao).getMonth();
      arr[i].qtd += 1;
      arr[i].valor += Number(o.valor) || 0;
    });
    return arr;
  }, [orcAno]);

  const orcPorStatus = useMemo(() => {
    const map: Record<string, number> = {};
    orcAno.forEach(o => { const s = o.status || "LEVANTAMENTO"; map[s] = (map[s] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value, color: ORC_COLORS[name] || "#94a3b8" }));
  }, [orcAno]);

  const previsaoVsFat = useMemo(() => {
    const arr = MESES.map(m => ({ mes: m, previsto: 0, faturado: 0 }));
    aprovados.forEach(o => {
      if (!o.data_emissao) return;
      const i = new Date(o.data_emissao).getMonth();
      arr[i].previsto += Number(o.valor) || 0;
    });
    medAno.forEach(m => {
      if (!m.data_recebimento) return;
      const i = new Date(m.data_recebimento).getMonth();
      arr[i].faturado += Number(m.valor) || 0;
    });
    return arr;
  }, [aprovados, medAno]);

  const projPorStatus = useMemo(() => {
    const map: Record<string, number> = {};
    projetos.forEach(p => { const s = p.status || "PLANEJAMENTO"; map[s] = (map[s] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value, color: PROJ_COLORS[name] || "#94a3b8" }));
  }, [projetos]);

  const receitaEqPorMes = useMemo(() => {
    const arr = MESES.map(m => ({ mes: m, valor: 0 }));
    empAno.forEach(e => {
      if (!e.data_inicio) return;
      const i = new Date(e.data_inicio).getMonth();
      arr[i].valor += receitaEmprestimo(e);
    });
    return arr;
  }, [empAno]);

  const eqPorStatus = useMemo(() => {
    const map: Record<string, number> = { "DISPONÍVEL": 0, "ALUGADO": 0, "MANUTENÇÃO": 0 };
    equipamentos.forEach(e => { const s = e.status || "DISPONÍVEL"; map[s] = (map[s] || 0) + 1; });
    return Object.entries(map).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value, color: EQ_COLORS[name] || "#94a3b8" }));
  }, [equipamentos]);

  const topClientes = useMemo(() => {
    const map: Record<string, number> = {};
    aprovados.forEach(o => { const c = (o.cliente || "—").toString().toUpperCase(); map[c] = (map[c] || 0) + (Number(o.valor) || 0); });
    return Object.entries(map).map(([name, valor]) => ({ name, valor })).sort((a, b) => b.valor - a.valor).slice(0, 10);
  }, [aprovados]);

  const acumulado = useMemo(() => {
    const arr = MESES.map(m => ({ mes: m, valor: 0 }));
    aprovados.forEach(o => {
      if (!o.data_emissao) return;
      const i = new Date(o.data_emissao).getMonth();
      arr[i].valor += Number(o.valor) || 0;
    });
    let acc = 0;
    return arr.map(x => ({ mes: x.mes, acumulado: (acc += x.valor) }));
  }, [aprovados]);

  // === TABELAS ===
  const ultimosOrc = useMemo(() =>
    [...orcamentos].sort((a, b) => (b.data_emissao || b.created_at || "").localeCompare(a.data_emissao || a.created_at || "")).slice(0, 5)
  , [orcamentos]);
  const projEmObra = useMemo(() => projAndamento.slice(0, 5), [projAndamento]);
  const eqManut = useMemo(() => {
    const abertas = manutencoes.filter(m => m.aberta !== false && m.status !== "CONCLUÍDA");
    return (abertas as Row[]).slice(0, 5).map((m: Row) => ({
      ...m, nomeEq: equipamentos.find(e => e.id === m.equipamento_id)?.nome || "—",
    }));
  }, [manutencoes, equipamentos]);
  const proxDevolucoes = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    return (emprestimos as Row[])
      .filter(e => !e.data_devolucao_real && e.data_devolucao_prevista && e.data_devolucao_prevista >= hoje)
      .sort((a, b) => String(a.data_devolucao_prevista).localeCompare(String(b.data_devolucao_prevista)))
      .slice(0, 5)
      .map((e: Row) => ({ ...e, nomeEq: equipamentos.find(x => x.id === e.equipamento_id)?.nome || "—" }));
  }, [emprestimos, equipamentos]);


  if (loading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold" style={{ color: NAVY }}>Painel inicial</h2>
          <p className="mt-1 text-sm text-muted-foreground">Visão consolidada em tempo real</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-white p-2 shadow-sm">
          <span className="text-xs font-semibold" style={{ color: NAVY }}>ANO:</span>
          <select
            value={ano}
            onChange={e => setAno(Number(e.target.value))}
            className="rounded-md border-0 bg-transparent text-sm font-bold outline-none"
            style={{ color: NAVY }}
          >
            {anosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* SEÇÃO 1 — COMERCIAL */}
      <Section title="Comercial" icon={<FileText className="h-4 w-4" />}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Kpi icon={<FileText />} label="Orçamentos no ano" value={String(totalOrc)} />
          <Kpi icon={<DollarSign />} label="Valor total orçado" value={brl(valorOrc)} />
          <Kpi icon={<CheckCircle2 />} label="Aprovados" value={`${aprovados.length} · ${brl(valorAprovado)}`} tone="green" />
          <Kpi icon={<Percent />} label="Taxa de aprovação" value={`${taxaAprov.toFixed(1)}%`} />
          <Kpi icon={<Target />} label="Ticket médio" value={brl(ticket)} />
          <Kpi icon={<Handshake />} label="Em negociação" value={`${emNeg.length} · ${brl(valorEmNeg)}`} tone="orange" />
        </div>
      </Section>

      {/* SEÇÃO 2 — OPERACIONAL */}
      <Section title="Operacional" icon={<FolderKanban className="h-4 w-4" />}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <Kpi icon={<FolderKanban />} label="Projetos em andamento" value={String(projAndamento.length)} tone="orange" />
          <Kpi icon={<CheckCircle2 />} label="Concluídos no ano" value={String(projConcluidosAno.length)} tone="green" />
          <Kpi icon={<ClipboardList />} label="Medições lançadas" value={String(totalMed)} />
          <Kpi icon={<Wallet />} label="Faturado" value={brl(faturado)} tone="green" />
          <Kpi icon={<TrendingUp />} label="Saldo a faturar" value={brl(saldoFaturar)} />
        </div>
      </Section>

      {/* SEÇÃO 3 — EQUIPAMENTOS */}
      <Section title="Equipamentos" icon={<Package className="h-4 w-4" />}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Kpi icon={<Package />} label="Total" value={String(totalEq)} />
          <Kpi icon={<PackageCheck />} label="Disponíveis" value={String(disponiveis)} tone="green" />
          <Kpi icon={<PackageX />} label="Alugados" value={String(alugados)} tone="orange" />
          <Kpi icon={<Wrench />} label="Manutenção" value={String(emManut)} tone="red" />
          <Kpi icon={<DollarSign />} label="Receita no ano" value={brl(receitaEq)} tone="green" />
          <Kpi icon={<Percent />} label="Taxa de utilização" value={`${taxaUtil.toFixed(1)}%`} />
        </div>
      </Section>

      {/* SEÇÃO 4 — GRÁFICOS */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Orçamentos por mês">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={orcPorMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="l" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number, n: string) => n === "valor" ? brl(v) : v} />
              <Legend />
              <Bar yAxisId="l" dataKey="qtd" name="Qtd" fill={NAVY} radius={[4,4,0,0]} />
              <Bar yAxisId="r" dataKey="valor" name="Valor" fill={ORANGE} radius={[4,4,0,0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Orçamentos por status">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={orcPorStatus} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                {orcPorStatus.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Previsão de entrada vs Faturado">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={previsaoVsFat}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => brl(v)} />
              <Legend />
              <Bar dataKey="previsto" name="Previsto" fill={NAVY} radius={[4,4,0,0]} />
              <Bar dataKey="faturado" name="Faturado" fill={ORANGE} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Projetos por status">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={projPorStatus} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                {projPorStatus.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Receita de equipamentos por mês">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={receitaEqPorMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => brl(v)} />
              <Line type="monotone" dataKey="valor" name="Receita" stroke={ORANGE} strokeWidth={3} dot={{ fill: ORANGE, r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Equipamentos por status">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={eqPorStatus} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                {eqPorStatus.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top 10 clientes por valor aprovado">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={topClientes} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={140} />
              <Tooltip formatter={(v: number) => brl(v)} />
              <Bar dataKey="valor" name="Valor" fill={NAVY} radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Evolução acumulada — orçamentos aprovados">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={acumulado}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => brl(v)} />
              <Line type="monotone" dataKey="acumulado" name="Acumulado" stroke={ORANGE} strokeWidth={3} dot={{ fill: NAVY, r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* SEÇÃO 5 — TABELAS */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TableCard title="Últimos 5 orçamentos" link="/app/comercial">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2">Obra</th><th>Cliente</th><th>Valor</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ultimosOrc.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Sem registros</td></tr>}
              {ultimosOrc.map(o => (
                <tr key={o.id} className="border-b last:border-0">
                  <td className="py-2 font-semibold" style={{ color: NAVY }}>{o.obra || "—"}</td>
                  <td>{o.cliente || "—"}</td>
                  <td className="font-semibold">{brl(Number(o.valor) || 0)}</td>
                  <td><StatusBadge status={o.status || "LEVANTAMENTO"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>

        <TableCard title="Projetos em obra" link="/app/projetos">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2">Nome</th><th>Cliente</th><th className="text-right">Progresso</th>
              </tr>
            </thead>
            <tbody>
              {projEmObra.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">Sem projetos em andamento</td></tr>}
              {projEmObra.map(p => {
                const clienteNome = p.cliente || clientes.find(c => c.id === p.cliente_id)?.nome || "—";
                const pct = Number(p.progresso) || 0;
                return (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2 font-semibold" style={{ color: NAVY }}>{p.nome || "—"}</td>
                    <td>{clienteNome}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: ORANGE }} />
                        </div>
                        <span className="text-xs font-bold" style={{ color: NAVY }}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>

        <TableCard title="Equipamentos em manutenção" link="/app/equipamentos">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2">Equipamento</th><th>Data início</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {eqManut.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">Nenhuma manutenção aberta</td></tr>}
              {eqManut.map(m => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="py-2 font-semibold" style={{ color: NAVY }}>{m.nomeEq}</td>
                  <td>{m.data ? new Date(m.data).toLocaleDateString("pt-BR") : "—"}</td>
                  <td><StatusBadge status={m.status || "ABERTA"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>

        <TableCard title="Próximas devoluções" link="/app/equipamentos">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2">Equipamento</th><th>Responsável</th><th>Prevista</th>
              </tr>
            </thead>
            <tbody>
              {proxDevolucoes.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">Sem devoluções futuras</td></tr>}
              {proxDevolucoes.map(e => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="py-2 font-semibold" style={{ color: NAVY }}>{e.nomeEq}</td>
                  <td>{e.responsavel || "—"}</td>
                  <td className="font-semibold" style={{ color: ORANGE }}>
                    {new Date(e.data_devolucao_prevista).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      </div>
    </div>
  );
}

// ---------- UI ----------
function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide" style={{ color: NAVY }}>
        {icon} {title}
      </h3>
      {children}
    </section>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "green" | "orange" | "red" }) {
  const bg = tone === "green" ? "#16a34a" : tone === "orange" ? ORANGE : tone === "red" ? "#ef4444" : NAVY;
  return (
    <Card className="p-4 transition-all hover:shadow-md">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg text-white" style={{ background: bg }}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-0.5 truncate text-base font-extrabold" style={{ color: NAVY }}>{value}</div>
        </div>
      </div>
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-bold" style={{ color: NAVY }}>
        <BarChart3 className="h-4 w-4" /> {title}
      </h4>
      {children}
    </Card>
  );
}

function TableCard({ title, link, children }: { title: string; link: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-bold" style={{ color: NAVY }}>
          <Activity className="h-4 w-4" /> {title}
        </h4>
        <Link to={link} className="text-xs font-semibold hover:underline" style={{ color: ORANGE }}>Ver todos →</Link>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-72" />)}
      </div>
    </div>
  );
}
