import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { projetos, projetoFinanceiro, brl } from "@/lib/mock-data";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/app/projetos/$id")({ component: ProjetoDetalhe });

const notas = [
  { data: "2026-06-01", desc: "NF Cimento CP-II - Fornecedor Votorantim", valor: 42800, tipo: "Insumo" },
  { data: "2026-06-08", desc: "NF Aço CA-50 - Gerdau", valor: 118200, tipo: "Insumo" },
  { data: "2026-06-15", desc: "Serviço de terraplenagem - subcontratado", valor: 88600, tipo: "Serviço" },
  { data: "2026-06-22", desc: "Locação de equipamentos - Junho", valor: 34500, tipo: "Locação" },
];
const medicoes = [
  { periodo: "Medição 1", pct: 15, valor: 620000 },
  { periodo: "Medição 2", pct: 32, valor: 720000 },
  { periodo: "Medição 3", pct: 48, valor: 680000 },
  { periodo: "Medição 4", pct: 62, valor: 590000 },
];

function ProjetoDetalhe() {
  const { id } = Route.useParams();
  const p = projetos.find(x => x.id === id) ?? projetos[0];
  return (
    <div className="space-y-6">
      <Link to="/app/projetos" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-[#213368]">
        <ChevronLeft className="mr-1 h-4 w-4" /> Voltar para projetos
      </Link>
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[#F37032]">{p.id}</div>
            <h2 className="mt-1 text-2xl font-extrabold text-[#213368]">{p.nome}</h2>
            <div className="text-sm text-muted-foreground">Cliente: {p.cliente}</div>
          </div>
          <StatusBadge status={p.status} />
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <div className="mb-1 flex justify-between text-xs font-medium"><span>Progresso físico</span><span>{p.progresso}%</span></div>
            <Progress value={p.progresso} />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs font-medium"><span>Financeiro realizado</span><span>{p.financeiro}%</span></div>
            <Progress value={p.financeiro} />
          </div>
        </div>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="fin">Financeiro</TabsTrigger>
          <TabsTrigger value="notas">Notas</TabsTrigger>
          <TabsTrigger value="med">Medições</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card className="p-6">
            <h3 className="text-lg font-bold text-[#213368]">Descrição do projeto</h3>
            <p className="mt-3 text-sm text-muted-foreground">
              Obra de execução completa incluindo fundação, estrutura, alvenaria, acabamentos e instalações. Prazo contratual de 14 meses com marcos trimestrais e medições mensais. Equipe alocada de 42 profissionais em regime integral.
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="fin" className="mt-4 grid gap-6 lg:grid-cols-3">
          <Card className="p-6 lg:col-span-2">
            <div className="text-sm font-semibold text-muted-foreground">Previsto x Realizado</div>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={projetoFinanceiro}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="mes" stroke="#6E7280" fontSize={12} />
                  <YAxis stroke="#6E7280" fontSize={12} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => brl(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="previsto" stroke="#213368" strokeWidth={2.5} />
                  <Line type="monotone" dataKey="realizado" stroke="#F37032" strokeWidth={2.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="p-6">
            <div className="text-sm font-semibold text-muted-foreground">Resumo</div>
            <div className="mt-4 space-y-4">
              <div><div className="text-xs text-muted-foreground">Orçado</div><div className="text-2xl font-extrabold text-[#213368]">{brl(4820000)}</div></div>
              <div><div className="text-xs text-muted-foreground">Realizado</div><div className="text-2xl font-extrabold text-[#F37032]">{brl(2800000)}</div></div>
              <div><div className="text-xs text-muted-foreground">Saldo</div><div className="text-xl font-bold">{brl(2020000)}</div></div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="notas" className="mt-4">
          <Card className="p-6">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead>Tipo</TableHead><TableHead>Valor</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {notas.map((n, i) => (
                  <TableRow key={i}>
                    <TableCell>{new Date(n.data).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>{n.desc}</TableCell>
                    <TableCell>{n.tipo}</TableCell>
                    <TableCell className="font-semibold">{brl(n.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="med" className="mt-4">
          <Card className="p-6">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Período</TableHead><TableHead>Progresso</TableHead><TableHead>Valor</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {medicoes.map((m, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-semibold">{m.periodo}</TableCell>
                    <TableCell className="w-1/2">
                      <div className="flex items-center gap-3">
                        <Progress value={m.pct} className="flex-1" />
                        <span className="text-xs font-semibold">{m.pct}%</span>
                      </div>
                    </TableCell>
                    <TableCell>{brl(m.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
