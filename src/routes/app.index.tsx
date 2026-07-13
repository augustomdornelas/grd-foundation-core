// ============================================================
// Painel inicial — relatórios por módulo, respeitando permissões.
// ------------------------------------------------------------
// NOTA DE SEGURANÇA: a checagem `useHasPermission` no front é
// apenas para EXIBIÇÃO. Quando o Supabase for conectado, a
// segurança REAL será garantida por Row Level Security no banco:
// mesmo que a UI renderize um relatório, o servidor deve recusar
// dados que o usuário não pode acessar.
// ------------------------------------------------------------
// Fonte de dados: lê exatamente das mesmas stores que os módulos
// (projetos-store, equipamentos-store, mock-data). Quando ligar
// o banco, basta trocar a origem — os relatórios não mudam.
// ============================================================
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/portal/StatusBadge";
import {
  BriefcaseBusiness, FolderKanban, Wrench, TrendingUp, AlertTriangle,
  DollarSign, CheckCircle2, Clock, PackageCheck, PackageX, Hammer, ArrowRight,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import { useCurrentUser, useHasPermission, useCanShowPainel, type ModuloKey } from "@/lib/current-user";
import { useProjetosStore } from "@/lib/projetos-store";
import { useEquipStore, periodos } from "@/lib/equipamentos-store";
import { brl } from "@/lib/mock-data";
import { useOrcamentos, STATUS_COLORS } from "@/lib/orcamentos-store";
import { useMedicoes, resumoDoOrcamento } from "@/lib/medicoes-comercial-store";

export const Route = createFileRoute("/app/")({ component: PainelHome });

// ---------- Filtro de período ----------
type Periodo = "mes" | "trimestre" | "ano";
const PERIODO_LABEL: Record<Periodo, string> = {
  mes: "Mês atual",
  trimestre: "Últimos 3 meses",
  ano: "Ano",
};
function inicioDoPeriodo(p: Periodo): Date {
  const hoje = new Date();
  if (p === "mes") return new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  if (p === "trimestre") return new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1);
  return new Date(hoje.getFullYear(), 0, 1);
}
function noPeriodo(dataISO: string, p: Periodo): boolean {
  if (!dataISO) return false;
  const d = new Date(dataISO);
  return d >= inicioDoPeriodo(p) && d <= new Date();
}

const NOMES_MES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function PainelHome() {
  const user = useCurrentUser();
  const [periodo, setPeriodo] = useState<Periodo>("trimestre");

  const podeComercial = useHasPermission("comercial");
  const podeProjetos = useHasPermission("projetos");
  const podeEquip = useHasPermission("equipamentos");
  const podeFinanceiro = useHasPermission("financeiro");

  const showComercial = useCanShowPainel("comercial");
  const showPrevisao = useCanShowPainel("previsao");
  const showProjetos = useCanShowPainel("projetos");
  const showEquip = useCanShowPainel("equipamentos");
  const showFinanceiro = useCanShowPainel("financeiro");

  const nada = !showComercial && !showPrevisao && !showProjetos && !showEquip && !showFinanceiro;

  return (
    <div className="space-y-8">
      {/* Cabeçalho + filtro global */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-[#213368]">Olá, {user.nome.split(" ")[0]} 👋</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            {" · "}
            Perfil: <span className="font-semibold text-[#213368]">{user.perfil}</span>
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-white p-1 shadow-sm">
          {(Object.keys(PERIODO_LABEL) as Periodo[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                periodo === p ? "bg-[#213368] text-white" : "text-[#213368] hover:bg-[#213368]/5"
              }`}
            >
              {PERIODO_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {podeComercial && showComercial && <SecaoComercial periodo={periodo} showPrevisao={showPrevisao} />}
      {podeComercial && !showComercial && showPrevisao && <SecaoPrevisaoAvulsa />}
      {podeProjetos && showProjetos && <SecaoProjetos periodo={periodo} />}
      {podeEquip && showEquip && <SecaoEquipamentos periodo={periodo} />}
      {podeFinanceiro && showFinanceiro && <SecaoFinanceiro periodo={periodo} />}

      {nada && (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhum bloco do painel está liberado para você. Fale com o administrador.
          </p>
        </Card>
      )}
    </div>
  );
}

// Seção com apenas o resumo de Previsão de Entrada, quando o usuário só habilitou esse bloco.
function SecaoPrevisaoAvulsa() {
  return (
    <Secao titulo="Previsão de Entrada" subtitulo="Receita por orçamento aprovado" icon={TrendingUp} modulo="comercial">
      <PrevisaoEntradaResumo />
    </Secao>
  );
}

// ============================================================
// Bloco base de seção
// ============================================================
function Secao({ titulo, subtitulo, icon: Icon, modulo, children }: {
  titulo: string; subtitulo: string; icon: typeof BriefcaseBusiness;
  modulo: ModuloKey; children: React.ReactNode;
}) {
  return (
    <section aria-label={titulo} data-modulo={modulo} className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#213368] text-white">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-[#213368]">{titulo}</h3>
          <p className="text-xs text-muted-foreground">{subtitulo}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, delta, icon: Icon }: {
  label: string; value: string; delta?: string; icon: typeof BriefcaseBusiness;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#213368] text-white">
          <Icon className="h-5 w-5" />
        </div>
        {delta && <span className="text-xs font-semibold text-[#F37032]">{delta}</span>}
      </div>
      <div className="mt-4 text-2xl font-extrabold text-[#213368]">{value}</div>
      <div className="mt-1 text-xs font-medium text-muted-foreground">{label}</div>
    </Card>
  );
}

function Vazio({ msg }: { msg?: string }) {
  return <div className="grid h-48 place-items-center text-sm text-muted-foreground">{msg ?? "Sem dados no período."}</div>;
}

// ============================================================
// COMERCIAL
// ============================================================
function SecaoComercial({ periodo, showPrevisao }: { periodo: Periodo; showPrevisao: boolean }) {
  const orcamentos = useOrcamentos(s => s);
  const dados = useMemo(() => {
    const noPer = orcamentos.filter(o => noPeriodo(o.data, periodo));
    const total = noPer.reduce((a, o) => a + o.valor, 0);
    const qtd = noPer.length;
    const ticket = qtd ? total / qtd : 0;
    const valorAprovado = noPer.filter(o => o.status === "Aprovado").reduce((a, o) => a + o.valor, 0);
    const conv = total > 0 ? (valorAprovado / total) * 100 : 0;

    // Série mensal (últimos 6 meses)
    const hoje = new Date();
    const meses: { mes: string; valor: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const soma = orcamentos
        .filter(o => { const od = new Date(o.data); return `${od.getFullYear()}-${od.getMonth()}` === key; })
        .reduce((a, o) => a + o.valor, 0);
      meses.push({ mes: NOMES_MES[d.getMonth()], valor: soma });
    }

    // Por status
    const porStatus = Object.entries(
      noPer.reduce<Record<string, number>>((acc, o) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc; }, {}),
    ).map(([name, value]) => ({ name, value, color: (STATUS_COLORS as Record<string, string>)[name] ?? "#94A3B8" }));

    const ultimos = [...noPer].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5);
    const topClientes = (Object.entries(
      noPer.reduce<Record<string, number>>((acc, o) => { acc[o.cliente] = (acc[o.cliente] || 0) + o.valor; return acc; }, {}),
    ) as [string, number][]).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return { total, qtd, ticket, conv, meses, porStatus, ultimos, topClientes };
  }, [orcamentos, periodo]);

  return (
    <Secao titulo="Comercial" subtitulo={`Orçamentos e conversão · ${PERIODO_LABEL[periodo]}`} icon={BriefcaseBusiness} modulo="comercial">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Valor total de orçamentos" value={brl(dados.total)} icon={DollarSign} />
        <Kpi label="Nº de orçamentos" value={String(dados.qtd)} icon={BriefcaseBusiness} />
        <Kpi label="Ticket médio" value={brl(dados.ticket)} icon={TrendingUp} />
        <Kpi label="Taxa de conversão" value={`${dados.conv.toFixed(0)}%`} icon={CheckCircle2} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="text-sm font-semibold text-muted-foreground">Orçamentos mês a mês</div>
          <div className="mt-4 h-64">
            {dados.meses.some(m => m.valor > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dados.meses}>
                  <defs>
                    <linearGradient id="gComercial" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F37032" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#F37032" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="mes" stroke="#6E7280" fontSize={12} />
                  <YAxis stroke="#6E7280" fontSize={12} tickFormatter={v => `${(v / 1_000_000).toFixed(1)}M`} />
                  <Tooltip formatter={(v: number) => brl(v)} />
                  <Area type="monotone" dataKey="valor" stroke="#F37032" strokeWidth={2.5} fill="url(#gComercial)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <Vazio />}
          </div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-semibold text-muted-foreground">Orçamentos por status</div>
          <div className="mt-4 h-64">
            {dados.porStatus.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={dados.porStatus} dataKey="value" nameKey="name" outerRadius={80} innerRadius={45}>
                    {dados.porStatus.map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <Vazio />}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-muted-foreground">Últimos orçamentos</div>
            <Link to="/app/comercial" className="text-xs font-semibold text-[#F37032] hover:underline">Ver todos <ArrowRight className="inline h-3 w-3" /></Link>
          </div>
          <div className="mt-3 divide-y">
            {dados.ultimos.length === 0 ? <Vazio msg="Nenhum orçamento no período." /> :
              dados.ultimos.map(o => (
                <div key={o.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[#213368]">{o.obra}</div>
                    <div className="truncate text-xs text-muted-foreground">{o.cliente} · {o.id}</div>
                  </div>
                  <div className="ml-3 text-right">
                    <div className="text-sm font-bold text-[#213368]">{brl(o.valor)}</div>
                    <StatusBadge status={o.status} />
                  </div>
                </div>
              ))
            }
          </div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-semibold text-muted-foreground">Top clientes por valor</div>
          <div className="mt-3 space-y-3">
            {dados.topClientes.length === 0 ? <Vazio msg="Sem clientes no período." /> :
              dados.topClientes.map(([cliente, valor], i) => {
                const max = dados.topClientes[0][1] as number;
                const pct = ((valor as number) / max) * 100;
                return (
                  <div key={cliente}>
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-[#213368]">{i + 1}. {cliente}</span>
                      <span className="text-muted-foreground">{brl(valor as number)}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#213368]/10">
                      <div className="h-full bg-[#F37032]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            }
          </div>
        </Card>
      </div>

      {showPrevisao && <PrevisaoEntradaResumo />}
    </Secao>
  );
}

// ------------------------------------------------------------
// Bloco resumo — Previsão de Entrada (painel /app)
// ------------------------------------------------------------
function PrevisaoEntradaResumo() {
  const aprovados = useOrcamentos(s => s.filter(o => o.status === "Aprovado"));
  const medicoes = useMedicoes(s => s);
  const resumos = aprovados.map(o => resumoDoOrcamento(o, medicoes));
  const prevista = resumos.reduce((a, r) => a + r.orcamento.valor, 0);
  const faturado = resumos.reduce((a, r) => a + r.faturado, 0);
  const saldo = Math.max(0, prevista - faturado);
  const pct = prevista > 0 ? (faturado / prevista) * 100 : 0;
  const top3 = [...resumos].sort((a, b) => b.saldo - a.saldo).slice(0, 3);

  // Fluxo mensal compacto (últimos 4 + próximos 2)
  const hoje = new Date();
  const fluxo: { mes: string; previsto: number; realizado: number }[] = [];
  for (let i = -3; i <= 2; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    const dNext = new Date(hoje.getFullYear(), hoje.getMonth() + i + 1, 1);
    const previsto = medicoes.filter(m => { const md = new Date(m.previsaoRecebimento); return md >= d && md < dNext; }).reduce((a, m) => a + m.valor, 0);
    const realizado = medicoes.filter(m => { const md = new Date(m.data); return md >= d && md < dNext && m.status === "Recebida"; }).reduce((a, m) => a + m.valor, 0);
    fluxo.push({ mes: NOMES_MES[d.getMonth()], previsto, realizado });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="p-6">
        <div className="text-sm font-semibold text-muted-foreground">Previsão de entrada</div>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Prevista</span><span className="font-bold text-[#213368]">{brl(prevista)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Faturado</span><span className="font-bold text-[#F37032]">{brl(faturado)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Saldo</span><span className="font-bold text-[#213368]">{brl(saldo)}</span></div>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Executado</span><span className="font-semibold text-[#213368]">{pct.toFixed(0)}%</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#213368]/10">
            <div className="h-full bg-green-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </Card>
      <Card className="p-6">
        <div className="text-sm font-semibold text-muted-foreground">Fluxo mensal</div>
        <div className="mt-2 h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={fluxo}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="mes" stroke="#6E7280" fontSize={11} />
              <YAxis stroke="#6E7280" fontSize={11} tickFormatter={v => `${(v/1_000_000).toFixed(1)}M`} />
              <Tooltip formatter={(v: number) => brl(v)} />
              <Bar dataKey="previsto" name="Previsto" fill="#213368" radius={[4,4,0,0]} />
              <Bar dataKey="realizado" name="Realizado" fill="#F37032" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card className="p-6">
        <div className="text-sm font-semibold text-muted-foreground">Maiores saldos a faturar</div>
        <div className="mt-3 space-y-3">
          {top3.length === 0 ? (
            <div className="text-xs text-muted-foreground">Sem orçamentos aprovados.</div>
          ) : top3.map(r => (
            <div key={r.orcamento.id}>
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-[#213368] truncate">{r.orcamento.cliente}</span>
                <span className="text-muted-foreground">{brl(r.saldo)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#213368]/10">
                <div className="h-full bg-[#F37032]" style={{ width: `${r.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}



// ============================================================
// PROJETOS
// ============================================================
function SecaoProjetos({ periodo }: { periodo: Periodo }) {
  const projetos = useProjetosStore(s => s.projetos);
  const medicoes = useProjetosStore(s => s.medicoes);
  const notas = useProjetosStore(s => s.notas);
  const custos = useProjetosStore(s => s.custos);

  const dados = useMemo(() => {
    const ativos = projetos.filter(p => p.status === "Em andamento" || p.status === "Planejamento");
    const valorTotal = ativos.reduce((a, p) => a + p.orcado, 0);
    const execMedia = ativos.length ? ativos.reduce((a, p) => a + p.progresso, 0) / ativos.length : 0;
    const paralisados = projetos.filter(p => p.status === "Paralisado");

    // Prazo próximo (<= 30 dias)
    const hoje = new Date();
    const proximosPrazo = projetos
      .filter(p => p.status !== "Concluído")
      .map(p => ({ p, dias: Math.ceil((new Date(p.prazo).getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)) }))
      .filter(x => x.dias <= 30 && x.dias >= 0);

    // Curva S: soma medido e gasto por mês (últimos 6 meses)
    const hoje2 = new Date();
    const meses: { mes: string; fisico: number; financeiro: number }[] = [];
    let accFis = 0, accFin = 0;
    const orcado = projetos.reduce((a, p) => a + p.orcado, 0) || 1;
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje2.getFullYear(), hoje2.getMonth() - i, 1);
      const dNext = new Date(hoje2.getFullYear(), hoje2.getMonth() - i + 1, 1);
      const medMes = medicoes.filter(m => { const md = new Date(m.data); return md >= d && md < dNext; })
        .reduce((a, m) => a + m.valor, 0);
      const notaMes = notas.filter(n => { const nd = new Date(n.data); return nd >= d && nd < dNext; })
        .reduce((a, n) => a + n.valor, 0);
      const custoMes = custos.filter(c => { const cd = new Date(c.data); return cd >= d && cd < dNext; })
        .reduce((a, c) => a + c.valor, 0);
      accFis += medMes;
      accFin += notaMes + custoMes;
      meses.push({
        mes: NOMES_MES[d.getMonth()],
        fisico: Math.round((accFis / orcado) * 100),
        financeiro: Math.round((accFin / orcado) * 100),
      });
    }

    const ultimasMedicoes = [...medicoes].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5);
    const ultimasNotas = [...notas].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5);

    return { ativos, valorTotal, execMedia, paralisados, proximosPrazo, meses, ultimasMedicoes, ultimasNotas };
  }, [projetos, medicoes, notas, custos]);

  const projetoNome = (id: string) => projetos.find(p => p.id === id)?.nome ?? id;
  // periodo é reservado para futuras métricas por janela; a curva S usa 6 meses fixos
  void periodo;

  return (
    <Secao titulo="Projetos" subtitulo="Andamento físico, financeiro e alertas" icon={FolderKanban} modulo="projetos">
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Projetos ativos" value={String(dados.ativos.length)} icon={FolderKanban} />
        <Kpi label="Valor total em obras" value={brl(dados.valorTotal)} icon={DollarSign} />
        <Kpi label="Execução média" value={`${dados.execMedia.toFixed(0)}%`} icon={TrendingUp} />
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-muted-foreground">Curva S — avanço físico × financeiro</div>
            <div className="text-xs text-muted-foreground">Consolidado dos últimos 6 meses (acumulado)</div>
          </div>
        </div>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dados.meses}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="mes" stroke="#6E7280" fontSize={12} />
              <YAxis stroke="#6E7280" fontSize={12} tickFormatter={v => `${v}%`} />
              <Tooltip formatter={(v: number) => `${v}%`} />
              <Legend />
              <Line type="monotone" dataKey="fisico" stroke="#213368" strokeWidth={2.5} name="Físico" />
              <Line type="monotone" dataKey="financeiro" stroke="#F37032" strokeWidth={2.5} name="Financeiro" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#213368]">
            <AlertTriangle className="h-4 w-4 text-[#F37032]" /> Alertas
          </div>
          <div className="mt-3 space-y-2">
            {dados.paralisados.length === 0 && dados.proximosPrazo.length === 0 && (
              <div className="text-xs text-muted-foreground">Nenhum alerta no momento. 🎉</div>
            )}
            {dados.paralisados.map(p => (
              <Link key={p.id} to="/app/projetos/$id" params={{ id: p.id }} className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 hover:bg-red-100">
                <div className="text-sm font-semibold text-red-700">{p.nome}</div>
                <StatusBadge status="Paralisado" />
              </Link>
            ))}
            {dados.proximosPrazo.map(({ p, dias }) => (
              <Link key={p.id} to="/app/projetos/$id" params={{ id: p.id }} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 hover:bg-amber-100">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-amber-800">{p.nome}</div>
                  <div className="text-xs text-amber-700">Prazo em {dias} dia{dias === 1 ? "" : "s"}</div>
                </div>
                <Clock className="h-4 w-4 text-amber-700" />
              </Link>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-sm font-semibold text-muted-foreground">Últimas medições e notas</div>
          <div className="mt-3 divide-y">
            {dados.ultimasMedicoes.length === 0 && dados.ultimasNotas.length === 0 && <Vazio msg="Nada lançado ainda." />}
            {dados.ultimasMedicoes.map(m => (
              <div key={m.id} className="flex items-center justify-between py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-[#213368]">Medição #{m.numero} · {projetoNome(m.projetoId)}</div>
                  <div className="text-xs text-muted-foreground">{m.periodo}</div>
                </div>
                <div className="ml-3 text-right">
                  <div className="font-bold text-[#213368]">{brl(m.valor)}</div>
                  <StatusBadge status={m.status} />
                </div>
              </div>
            ))}
            {dados.ultimasNotas.map(n => (
              <div key={n.id} className="flex items-center justify-between py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-[#213368]">{n.numero} · {n.fornecedor}</div>
                  <div className="truncate text-xs text-muted-foreground">{projetoNome(n.projetoId)}</div>
                </div>
                <div className="ml-3 text-right">
                  <div className="font-bold text-[#213368]">{brl(n.valor)}</div>
                  <StatusBadge status={n.status} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Secao>
  );
}

// ============================================================
// EQUIPAMENTOS
// ============================================================
function SecaoEquipamentos({ periodo }: { periodo: Periodo }) {
  const equipamentos = useEquipStore(s => s.equipamentos);
  const emprestimos = useEquipStore(s => s.emprestimos);

  const dados = useMemo(() => {
    const emUso = equipamentos.filter(e => e.status === "Emprestado").length;
    const disponiveis = equipamentos.filter(e => e.status === "Disponível").length;
    const manutencao = equipamentos.filter(e => e.status === "Manutenção").length;

    const noPer = emprestimos.filter(e => noPeriodo(e.dataInicio, periodo));
    const custoPeriodoTotal = noPer.reduce((a, e) => a + e.custoTotal, 0);

    // Custo por mês (últimos 6 meses)
    const hoje = new Date();
    const meses: { mes: string; custo: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const dNext = new Date(hoje.getFullYear(), hoje.getMonth() - i + 1, 1);
      const custo = emprestimos.filter(e => { const ed = new Date(e.dataInicio); return ed >= d && ed < dNext; })
        .reduce((a, e) => a + e.custoTotal, 0);
      meses.push({ mes: NOMES_MES[d.getMonth()], custo });
    }

    // Devolução prevista próxima (<=15 dias, ativos)
    const proximas = emprestimos.filter(e => e.ativo).map(e => {
      const dias = Math.ceil((new Date(e.dataDevolucaoPrevista).getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
      return { emp: e, dias };
    }).filter(x => x.dias <= 15).sort((a, b) => a.dias - b.dias);

    return { emUso, disponiveis, manutencao, custoPeriodoTotal, meses, proximas };
  }, [equipamentos, emprestimos, periodo]);

  const eqNome = (id: string) => equipamentos.find(e => e.id === id)?.nome ?? id;

  return (
    <Secao titulo="Equipamentos" subtitulo={`Frota, empréstimos e custos · ${PERIODO_LABEL[periodo]}`} icon={Wrench} modulo="equipamentos">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Em uso" value={String(dados.emUso)} icon={PackageX} />
        <Kpi label="Disponíveis" value={String(dados.disponiveis)} icon={PackageCheck} />
        <Kpi label="Em manutenção" value={String(dados.manutencao)} icon={Hammer} />
        <Kpi label="Custo de empréstimos no período" value={brl(dados.custoPeriodoTotal)} icon={DollarSign} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="text-sm font-semibold text-muted-foreground">Custo de empréstimos por mês</div>
          <div className="mt-4 h-64">
            {dados.meses.some(m => m.custo > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dados.meses}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="mes" stroke="#6E7280" fontSize={12} />
                  <YAxis stroke="#6E7280" fontSize={12} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => brl(v)} />
                  <Bar dataKey="custo" fill="#F37032" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <Vazio />}
          </div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-semibold text-muted-foreground">Devoluções previstas (≤ 15 dias)</div>
          <div className="mt-3 space-y-2">
            {dados.proximas.length === 0 ? <Vazio msg="Sem devoluções próximas." /> :
              dados.proximas.slice(0, 6).map(({ emp, dias }) => (
                <Link key={emp.id} to="/app/equipamentos/$id" params={{ id: emp.equipamentoId }}
                  className="flex items-center justify-between rounded-lg border p-3 hover:border-[#F37032] hover:bg-[#F37032]/5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[#213368]">{eqNome(emp.equipamentoId)}</div>
                    <div className="truncate text-xs text-muted-foreground">{emp.destino}</div>
                  </div>
                  <span className={`text-xs font-semibold ${dias < 0 ? "text-red-600" : dias <= 3 ? "text-[#F37032]" : "text-[#213368]"}`}>
                    {dias < 0 ? `${Math.abs(dias)}d atraso` : `${dias}d`}
                  </span>
                </Link>
              ))
            }
          </div>
        </Card>
      </div>
    </Secao>
  );
}

// ============================================================
// FINANCEIRO CONSOLIDADO (dado sensível — respeitar permissão)
// ============================================================
function SecaoFinanceiro({ periodo }: { periodo: Periodo }) {
  const projetos = useProjetosStore(s => s.projetos);
  const medicoes = useProjetosStore(s => s.medicoes);
  const notas = useProjetosStore(s => s.notas);
  const custos = useProjetosStore(s => s.custos);
  const emprestimos = useEquipStore(s => s.emprestimos);

  const linhas = useMemo(() => {
    return projetos.map(p => {
      const receita = medicoes.filter(m => m.projetoId === p.id).reduce((a, m) => a + m.valor, 0);
      const custoNotas = notas.filter(n => n.projetoId === p.id).reduce((a, n) => a + n.valor, 0);
      const custoLancados = custos.filter(c => c.projetoId === p.id).reduce((a, c) => a + c.valor, 0);
      // Rateio de equipamentos por match parcial no destino
      const custoEquip = emprestimos.filter(e => e.destino.toLowerCase().includes(p.nome.split(" ")[0].toLowerCase()))
        .reduce((a, e) => a + e.custoTotal, 0);
      const custoTotal = custoNotas + custoLancados + custoEquip;
      const margem = receita - custoTotal;
      return { p, receita, custoTotal, margem };
    }).sort((a, b) => b.receita - a.receita);
  }, [projetos, medicoes, notas, custos, emprestimos]);
  void periodo;

  const totRec = linhas.reduce((a, l) => a + l.receita, 0);
  const totCus = linhas.reduce((a, l) => a + l.custoTotal, 0);

  return (
    <Secao titulo="Financeiro consolidado" subtitulo="Receita (medições) × custos por obra — dado restrito" icon={DollarSign} modulo="financeiro">
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Receita medida" value={brl(totRec)} icon={TrendingUp} />
        <Kpi label="Custos" value={brl(totCus)} icon={DollarSign} />
        <Kpi label="Margem" value={brl(totRec - totCus)} icon={CheckCircle2} delta={totRec ? `${(((totRec - totCus) / totRec) * 100).toFixed(0)}%` : undefined} />
      </div>

      <Card className="p-6">
        <div className="text-sm font-semibold text-muted-foreground">Receita × custos por obra</div>
        <div className="mt-4 h-80">
          {linhas.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={linhas.map(l => ({
                nome: l.p.nome.length > 22 ? l.p.nome.slice(0, 22) + "…" : l.p.nome,
                Receita: l.receita, Custos: l.custoTotal,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="nome" stroke="#6E7280" fontSize={11} angle={-15} textAnchor="end" height={70} />
                <YAxis stroke="#6E7280" fontSize={12} tickFormatter={v => `${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip formatter={(v: number) => brl(v)} />
                <Legend />
                <Bar dataKey="Receita" fill="#213368" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Custos" fill="#F37032" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Vazio />}
        </div>
      </Card>
    </Secao>
  );
}

// Silencia import não usado (periodos): reservado para janelas específicas futuras.
void periodos;
