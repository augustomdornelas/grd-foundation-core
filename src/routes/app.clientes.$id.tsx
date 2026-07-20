import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, DollarSign, FileText, Handshake, Calculator, FileClock, Wrench, RefreshCw } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";

export const Route = createFileRoute("/app/clientes/$id")({
  component: ClienteDetalhe,
  errorComponent: ({ error }) => <div className="p-6 text-red-600">Erro: {error.message}</div>,
});

type Cliente = {
  id: string; nome: string; tipo: string; cpf_cnpj: string | null;
  email: string | null; telefone: string | null; endereco: string | null;
  cidade: string | null; estado: string | null; colaborador_grd: boolean; ativo: boolean; observacoes: string | null;
};
type Orcamento = { id: string; numero: string; cliente: string; obra: string; valor: number; status: string; data_emissao: string | null; created_at: string };
type Emprestimo = { id: string; equipamento_id: string; destino: string; data_inicio: string; data_devolucao_prevista: string; data_devolucao_real: string | null; custo_total: number; ativo: boolean; created_at: string };
type Equipamento = { id: string; nome: string };

const BRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";

const STATUS_COLORS: Record<string, string> = {
  "Aprovado": "#213368",
  "Em negociação": "#F37032",
  "Aguardando Retorno": "#f59e0b",
  "Levantamento": "#64748b",
  "Não aprovado": "#dc2626",
  "Cancelado": "#94a3b8",
};

function ClienteDetalhe() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [emprestimos, setEmprestimos] = useState<Emprestimo[]>([]);
  const [equipamentos, setEquipamentos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const cRes = await supabase.from("clientes").select("*").eq("id", id).maybeSingle();
        const c = (cRes.data as Cliente | null) ?? null;
        setCliente(c);
        if (c) {
          const [oRes, eRes, eqRes] = await Promise.all([
            supabase.from("orcamentos").select("id,numero,cliente,obra,valor,status,data_emissao,created_at").eq("cliente", c.nome).order("created_at", { ascending: false }),
            supabase.from("emprestimos").select("id,equipamento_id,destino,data_inicio,data_devolucao_prevista,data_devolucao_real,custo_total,ativo,created_at").eq("destino", c.nome).order("created_at", { ascending: false }),
            supabase.from("equipamentos").select("id,nome"),
          ]);
          setOrcamentos((oRes.data as Orcamento[]) ?? []);
          setEmprestimos((eRes.data as Emprestimo[]) ?? []);
          const map: Record<string, string> = {};
          for (const e of ((eqRes.data as Equipamento[]) ?? [])) map[e.id] = e.nome;
          setEquipamentos(map);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const kpis = useMemo(() => {
    const total = orcamentos.reduce((a, o) => a + Number(o.valor ?? 0), 0);
    const aprovado = orcamentos.filter(o => o.status === "Aprovado").reduce((a, o) => a + Number(o.valor ?? 0), 0);
    const negociacao = orcamentos.filter(o => o.status === "Em negociação").reduce((a, o) => a + Number(o.valor ?? 0), 0);
    const ticket = orcamentos.length ? total / orcamentos.length : 0;
    return { total, aprovado, negociacao, ticket };
  }, [orcamentos]);

  const donut = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orcamentos) m.set(o.status, (m.get(o.status) ?? 0) + Number(o.valor ?? 0));
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [orcamentos]);

  const barras = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orcamentos) {
      const d = o.data_emissao ?? o.created_at;
      if (!d) continue;
      const dt = new Date(d);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      m.set(key, (m.get(key) ?? 0) + Number(o.valor ?? 0));
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([mes, valor]) => ({ mes, valor }));
  }, [orcamentos]);

  const timeline = useMemo(() => {
    const evts: { ts: string; tipo: "orcamento" | "emprestimo" | "devolucao"; titulo: string; sub: string }[] = [];
    for (const o of orcamentos) {
      evts.push({ ts: o.created_at, tipo: "orcamento", titulo: `Orçamento ${o.numero} criado`, sub: `${o.obra} — ${BRL(Number(o.valor ?? 0))} (${o.status})` });
    }
    for (const e of emprestimos) {
      evts.push({ ts: e.created_at, tipo: "emprestimo", titulo: `Aluguel: ${equipamentos[e.equipamento_id] ?? e.equipamento_id}`, sub: `Destino ${e.destino} — ${BRL(Number(e.custo_total ?? 0))}` });
      if (e.data_devolucao_real) {
        evts.push({ ts: e.data_devolucao_real, tipo: "devolucao", titulo: `Devolução: ${equipamentos[e.equipamento_id] ?? e.equipamento_id}`, sub: `Devolvido em ${fmtDate(e.data_devolucao_real)}` });
      }
    }
    return evts.sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""));
  }, [orcamentos, emprestimos, equipamentos]);

  if (loading) return <div className="p-8 text-muted-foreground">Carregando…</div>;
  if (!cliente) return (
    <div className="p-8">
      <p>Cliente não encontrado.</p>
      <Button variant="link" onClick={() => navigate({ to: "/app/clientes" })}>Voltar</Button>
    </div>
  );

  const kpiCards = [
    { label: "Total em orçamentos", value: BRL(kpis.total), icon: FileText, tone: "#213368" },
    { label: "Aprovados", value: BRL(kpis.aprovado), icon: DollarSign, tone: "#213368" },
    { label: "Em negociação", value: BRL(kpis.negociacao), icon: Handshake, tone: "#F37032" },
    { label: "Ticket médio", value: BRL(kpis.ticket), icon: Calculator, tone: "#F37032" },
  ];

  return (
    <div className="space-y-6" style={{ fontFamily: "Montserrat, sans-serif" }}>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/app/clientes" })}><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold" style={{ color: "#213368" }}>{cliente.nome}</h2>
            <div className="mt-1 text-sm text-muted-foreground">
              {cliente.cpf_cnpj ?? "—"} · {cliente.cidade ?? "—"}{cliente.estado ? `/${cliente.estado}` : ""} · {cliente.telefone ?? "—"} · {cliente.email ?? "—"}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{cliente.tipo === "PF" ? "Pessoa Física" : "Pessoa Jurídica"}</Badge>
            {cliente.colaborador_grd && <Badge style={{ background: "#F37032" }} className="text-white">Colaborador GRD</Badge>}
            {cliente.ativo
              ? <Badge style={{ background: "#213368" }} className="text-white">Ativo</Badge>
              : <Badge variant="secondary">Inativo</Badge>}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map(k => (
          <Card key={k.label} className="border-l-4" style={{ borderLeftColor: k.tone }}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground">{k.label}</div>
                <div className="mt-1 text-xl font-bold" style={{ color: "#213368" }}>{k.value}</div>
              </div>
              <k.icon className="h-7 w-7" style={{ color: k.tone }} />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle style={{ color: "#213368" }}>Orçamentos por status</CardTitle></CardHeader>
          <CardContent style={{ height: 300 }}>
            {donut.length === 0 ? <p className="text-muted-foreground">Sem dados</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donut} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                    {donut.map((d, i) => <Cell key={i} fill={STATUS_COLORS[d.name] ?? (i % 2 ? "#F37032" : "#213368")} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => BRL(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle style={{ color: "#213368" }}>Valor por mês</CardTitle></CardHeader>
          <CardContent style={{ height: 300 }}>
            {barras.length === 0 ? <p className="text-muted-foreground">Sem dados</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barras}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => BRL(v)} />
                  <Bar dataKey="valor" fill="#213368" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="orcamentos">
        <TabsList>
          <TabsTrigger value="orcamentos"><FileText className="mr-1 h-4 w-4" /> Orçamentos</TabsTrigger>
          <TabsTrigger value="equipamentos"><Wrench className="mr-1 h-4 w-4" /> Equipamentos</TabsTrigger>
          <TabsTrigger value="historico"><FileClock className="mr-1 h-4 w-4" /> Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="orcamentos">
          <Card><CardContent className="p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Nº</th><th className="py-2 pr-3">Obra</th><th className="py-2 pr-3">Valor</th><th className="py-2 pr-3">Data</th><th className="py-2 pr-3">Status</th>
              </tr></thead>
              <tbody>
                {orcamentos.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Nenhum orçamento</td></tr>}
                {orcamentos.map(o => (
                  <tr key={o.id} className="border-b">
                    <td className="py-2 pr-3 font-medium">{o.numero}</td>
                    <td className="py-2 pr-3">{o.obra}</td>
                    <td className="py-2 pr-3">{BRL(Number(o.valor ?? 0))}</td>
                    <td className="py-2 pr-3">{fmtDate(o.data_emissao ?? o.created_at)}</td>
                    <td className="py-2 pr-3"><Badge style={{ background: STATUS_COLORS[o.status] ?? "#64748b" }} className="text-white">{o.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="equipamentos">
          <Card><CardContent className="p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Equipamento</th><th className="py-2 pr-3">Destino</th><th className="py-2 pr-3">Início</th><th className="py-2 pr-3">Devolução</th><th className="py-2 pr-3">Custo total</th><th className="py-2 pr-3">Status</th>
              </tr></thead>
              <tbody>
                {emprestimos.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Nenhum aluguel</td></tr>}
                {emprestimos.map(e => (
                  <tr key={e.id} className="border-b">
                    <td className="py-2 pr-3 font-medium">{equipamentos[e.equipamento_id] ?? e.equipamento_id}</td>
                    <td className="py-2 pr-3">{e.destino}</td>
                    <td className="py-2 pr-3">{fmtDate(e.data_inicio)}</td>
                    <td className="py-2 pr-3">{fmtDate(e.data_devolucao_real ?? e.data_devolucao_prevista)}</td>
                    <td className="py-2 pr-3">{BRL(Number(e.custo_total ?? 0))}</td>
                    <td className="py-2 pr-3">
                      {e.data_devolucao_real
                        ? <Badge style={{ background: "#213368" }} className="text-white">Devolvido</Badge>
                        : <Badge style={{ background: "#F37032" }} className="text-white">Em uso</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="historico">
          <Card><CardContent className="p-4">
            {timeline.length === 0 && <p className="text-center text-muted-foreground py-6">Sem eventos</p>}
            <ul className="space-y-3">
              {timeline.map((ev, i) => {
                const Icon = ev.tipo === "orcamento" ? FileText : ev.tipo === "emprestimo" ? Wrench : RefreshCw;
                const color = ev.tipo === "orcamento" ? "#213368" : ev.tipo === "emprestimo" ? "#F37032" : "#16a34a";
                return (
                  <li key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="rounded-full p-2 text-white" style={{ background: color }}><Icon className="h-4 w-4" /></div>
                      {i < timeline.length - 1 && <div className="w-px flex-1 bg-border" />}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="text-sm font-semibold" style={{ color: "#213368" }}>{ev.titulo}</div>
                      <div className="text-xs text-muted-foreground">{ev.sub}</div>
                      <div className="text-[11px] text-muted-foreground">{fmtDate(ev.ts)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
