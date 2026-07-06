import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { BriefcaseBusiness, FolderKanban, Wrench, Mail, TrendingUp, ArrowRight } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { comercialSerie, brl } from "@/lib/mock-data";

export const Route = createFileRoute("/app/")({ component: PainelHome });

const kpis = [
  { label: "Orçamentos do mês", value: "R$ 6,1M", icon: BriefcaseBusiness, delta: "+18%" },
  { label: "Projetos ativos", value: "12", icon: FolderKanban, delta: "+2" },
  { label: "Equipamentos em uso", value: "38", icon: Wrench, delta: "76% frota" },
  { label: "E-mails não lidos", value: "7", icon: Mail, delta: "hoje" },
];

const atalhos = [
  { to: "/app/comercial", label: "Comercial", desc: "Orçamentos, funil e conversão", icon: BriefcaseBusiness },
  { to: "/app/projetos", label: "Projetos", desc: "Andamento, medições e finanças", icon: FolderKanban },
  { to: "/app/equipamentos", label: "Equipamentos", desc: "Aluguéis, empréstimos e frota", icon: Wrench },
  { to: "/app/webmail", label: "Webmail", desc: "Caixa integrada Microsoft 365", icon: Mail },
] as const;

function PainelHome() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-extrabold text-[#213368]">Olá, Rafael 👋</h2>
        <p className="mt-1 text-sm text-muted-foreground">Aqui está um resumo do seu dia no Grupo GRD Brasil.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(k => (
          <Card key={k.label} className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#213368] text-white"><k.icon className="h-5 w-5" /></div>
              <span className="text-xs font-semibold text-[#F37032]">{k.delta}</span>
            </div>
            <div className="mt-4 text-2xl font-extrabold text-[#213368]">{k.value}</div>
            <div className="mt-1 text-xs font-medium text-muted-foreground">{k.label}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-muted-foreground">Faturamento comercial</div>
              <div className="text-lg font-bold text-[#213368]">Últimos 7 meses</div>
            </div>
            <TrendingUp className="h-5 w-5 text-[#F37032]" />
          </div>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={comercialSerie}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F37032" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#F37032" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="mes" stroke="#6E7280" fontSize={12} />
                <YAxis stroke="#6E7280" fontSize={12} tickFormatter={v => `${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip formatter={(v: number) => brl(v)} />
                <Area type="monotone" dataKey="valor" stroke="#F37032" strokeWidth={2.5} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-semibold text-muted-foreground">Atalhos</div>
          <div className="mt-4 space-y-3">
            {atalhos.map(a => (
              <Link key={a.to} to={a.to} className="flex items-center gap-3 rounded-lg border p-3 transition hover:border-[#F37032] hover:bg-[#F37032]/5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#213368] text-white"><a.icon className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-[#213368]">{a.label}</div>
                  <div className="truncate text-xs text-muted-foreground">{a.desc}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
