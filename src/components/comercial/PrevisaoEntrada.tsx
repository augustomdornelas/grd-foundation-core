// ============================================================
// Previsão de Entrada — seção do Dashboard Comercial
// ------------------------------------------------------------
// KPIs, gráficos, tabela de orçamentos aprovados com accordion
// de medições, modal para lançar medição.
// ============================================================
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { toast } from "sonner";
import {
  ChevronDown, ChevronRight, Plus, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown,
  DollarSign, Wallet, TrendingUp, PieChart as PieIcon, Search,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { useOrcamentos, type Orcamento } from "@/lib/orcamentos-store";
import {
  useMedicoes, medicoesActions, proximoNumeroMedicao, resumoDoOrcamento,
  type Medicao, type MedStatus, type ResumoOrcamento,
} from "@/lib/medicoes-comercial-store";

const NOMES_MES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MED_STATUS: MedStatus[] = ["Lançada", "Em aprovação", "Recebida", "Prevista"];

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function progressColor(pct: number) {
  if (pct >= 90) return "#213368";
  if (pct >= 50) return "#F37032";
  return "#16A34A";
}

type SortCol = "cliente" | "valor" | "faturado" | "saldo" | "pct" | "proximaMedicao";

export function PrevisaoEntrada() {
  const orcamentosAprovados = useOrcamentos(s => s.filter(o => o.status === "Aprovado"));
  const medicoes = useMedicoes(s => s);

  const resumos = useMemo(
    () => orcamentosAprovados.map(o => resumoDoOrcamento(o, medicoes)),
    [orcamentosAprovados, medicoes],
  );

  // KPIs
  const kpis = useMemo(() => {
    const prevista = resumos.reduce((a, r) => a + r.orcamento.valor, 0);
    const faturado = resumos.reduce((a, r) => a + r.faturado, 0);
    const saldo = Math.max(0, prevista - faturado);
    const pct = prevista > 0 ? (faturado / prevista) * 100 : 0;
    return { prevista, faturado, saldo, pct };
  }, [resumos]);

  // Gráfico A — fluxo mensal (últimos 6 + próximos 3)
  const fluxo = useMemo(() => {
    const hoje = new Date();
    const arr: { mes: string; previsto: number; realizado: number; acumulado: number }[] = [];
    let acc = 0;
    for (let i = -5; i <= 3; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
      const dNext = new Date(hoje.getFullYear(), hoje.getMonth() + i + 1, 1);
      const previsto = medicoes.filter(m => {
        const md = new Date(m.previsaoRecebimento);
        return md >= d && md < dNext;
      }).reduce((a, m) => a + m.valor, 0);
      const realizado = medicoes.filter(m => {
        const md = new Date(m.data);
        return md >= d && md < dNext && m.status === "Recebida";
      }).reduce((a, m) => a + m.valor, 0);
      acc += realizado;
      arr.push({ mes: `${NOMES_MES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, previsto, realizado, acumulado: acc });
    }
    return arr;
  }, [medicoes]);

  // Gráfico B — donut
  const donut = [
    { name: "Já faturado", value: kpis.faturado, color: "#F37032" },
    { name: "Saldo a faturar", value: kpis.saldo, color: "#213368" },
  ].filter(x => x.value > 0);

  // Filtros da tabela
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("todos");
  const [fCliente, setFCliente] = useState("todos");
  const [sortBy, setSortBy] = useState<SortCol>("saldo");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [novaMed, setNovaMed] = useState<{ open: boolean; orcamentoId?: string }>({ open: false });
  const [editMed, setEditMed] = useState<Medicao | null>(null);

  const clientes = useMemo(() => Array.from(new Set(orcamentosAprovados.map(o => o.cliente))).sort(), [orcamentosAprovados]);

  const filtrados = useMemo(() => {
    const qLower = q.toLowerCase();
    let list = resumos;
    if (q) list = list.filter(r =>
      r.orcamento.cliente.toLowerCase().includes(qLower) ||
      r.orcamento.obra.toLowerCase().includes(qLower) ||
      r.orcamento.numero.toLowerCase().includes(qLower),
    );
    if (fStatus !== "todos") list = list.filter(r => r.statusExec === fStatus);
    if (fCliente !== "todos") list = list.filter(r => r.orcamento.cliente === fCliente);
    list = [...list].sort((a, b) => {
      const get = (r: ResumoOrcamento) => {
        switch (sortBy) {
          case "cliente": return r.orcamento.cliente;
          case "valor": return r.orcamento.valor;
          case "faturado": return r.faturado;
          case "saldo": return r.saldo;
          case "pct": return r.pct;
          case "proximaMedicao": return r.proximaMedicao ?? "";
        }
      };
      const va = get(a), vb = get(b);
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [resumos, q, fStatus, fCliente, sortBy, sortDir]);

  function toggleSort(col: SortCol) {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  }

  return (
    <section className="mt-10 space-y-6 border-t pt-10">
      <div>
        <h2 className="text-2xl font-extrabold text-[#213368]">Previsão de Entrada</h2>
        <p className="text-xs text-muted-foreground">Acompanhamento de receita por orçamento aprovado</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Receita prevista total" value={brl(kpis.prevista)} icon={DollarSign} tone="azul" />
        <KpiCard label="Já faturado" value={brl(kpis.faturado)} icon={TrendingUp} tone="azul" />
        <KpiCard label="Saldo a faturar" value={brl(kpis.saldo)} icon={Wallet} tone="laranja" />
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#213368] text-white">
              <PieIcon className="h-4 w-4" />
            </div>
            <span className="text-xs font-semibold text-green-600">{kpis.pct.toFixed(0)}%</span>
          </div>
          <div className="mt-3 text-xl font-extrabold text-[#213368]">Executado</div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#213368]/10">
            <div className="h-full bg-green-600 transition-all" style={{ width: `${kpis.pct}%` }} />
          </div>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="text-sm font-semibold text-[#213368]">Fluxo de entrada mensal</div>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={fluxo}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="mes" stroke="#6E7280" fontSize={12} />
                <YAxis stroke="#6E7280" fontSize={12} tickFormatter={v => `${(v/1_000_000).toFixed(1)}M`} />
                <Tooltip formatter={(v: number) => brl(v)} />
                <Legend />
                <Bar dataKey="previsto" name="Previsto" fill="#213368" radius={[4,4,0,0]} />
                <Bar dataKey="realizado" name="Realizado" fill="#F37032" radius={[4,4,0,0]} />
                <Line type="monotone" dataKey="acumulado" name="Acumulado" stroke="#16A34A" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-semibold text-[#213368]">Execução financeira</div>
          <div className="mt-4 h-72 relative">
            {donut.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donut} dataKey="value" nameKey="name" innerRadius={70} outerRadius={105} paddingAngle={3}>
                      {donut.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Legend />
                    <Tooltip formatter={(v: number) => brl(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" style={{ marginTop: -20 }}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total previsto</div>
                  <div className="text-lg font-extrabold text-[#213368]">{brl(kpis.prevista)}</div>
                </div>
              </>
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">Nenhum orçamento aprovado.</div>
            )}
          </div>
        </Card>
      </div>

      {/* Tabela */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-[#213368]">Orçamentos aprovados</h3>
            <p className="text-xs text-muted-foreground">{filtrados.length} orçamento(s).</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cliente ou obra..." className="pl-9 w-64" />
            </div>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="Aguardando início">Aguardando início</SelectItem>
                <SelectItem value="Em execução">Em execução</SelectItem>
                <SelectItem value="Concluído">Concluído</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fCliente} onValueChange={setFCliente}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os clientes</SelectItem>
                {clientes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={() => setNovaMed({ open: true })} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
              <Plus className="mr-1 h-4 w-4" /> Lançar medição
            </Button>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <Th label="Cliente" col="cliente" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <TableHead>Descrição</TableHead>
                <Th label="Valor aprovado" col="valor" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <Th label="Faturado" col="faturado" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <Th label="Saldo" col="saldo" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <Th label="% Executado" col="pct" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <Th label="Próx. medição" col="proximaMedicao" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">Nenhum orçamento aprovado encontrado.</TableCell></TableRow>
              ) : filtrados.map(r => (
                <LinhaOrc
                  key={r.orcamento.id}
                  resumo={r}
                  expandido={expandido === r.orcamento.id}
                  onToggle={() => setExpandido(x => x === r.orcamento.id ? null : r.orcamento.id)}
                  onLancar={() => setNovaMed({ open: true, orcamentoId: r.orcamento.id })}
                  onEditMed={m => setEditMed(m)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <MedicaoForm
        open={novaMed.open}
        onOpenChange={o => setNovaMed(o ? novaMed : { open: false })}
        orcamentoIdInicial={novaMed.orcamentoId}
        orcamentosAprovados={orcamentosAprovados}
      />
      <MedicaoForm
        open={!!editMed}
        onOpenChange={o => !o && setEditMed(null)}
        medicao={editMed ?? undefined}
        orcamentosAprovados={orcamentosAprovados}
      />
    </section>
  );
}

// ------------------------------------------------------------
function KpiCard({ label, value, icon: Icon, tone }: {
  label: string; value: string; icon: React.ElementType; tone: "azul" | "laranja";
}) {
  const cor = tone === "laranja" ? "text-[#F37032]" : "text-[#213368]";
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#213368] text-white">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className={`mt-3 text-xl font-extrabold ${cor}`}>{value}</div>
      <div className="mt-1 text-[11px] font-medium text-muted-foreground">{label}</div>
    </Card>
  );
}

function Th({ label, col, sortBy, sortDir, onClick }: {
  label: string; col: SortCol; sortBy: SortCol; sortDir: "asc"|"desc"; onClick: (c: SortCol) => void;
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
function LinhaOrc({ resumo: r, expandido, onToggle, onLancar, onEditMed }: {
  resumo: ResumoOrcamento; expandido: boolean; onToggle: () => void;
  onLancar: () => void; onEditMed: (m: Medicao) => void;
}) {
  const medicoes = useMedicoes(s => s.filter(m => m.orcamentoId === r.orcamento.id).sort((a, b) => a.data.localeCompare(b.data)));
  const cor = progressColor(r.pct);
  const statusMap: Record<string, string> = { "Concluído": "Concluído", "Em execução": "Em andamento", "Aguardando início": "Planejamento" };

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={onToggle}>
        <TableCell>
          {expandido ? <ChevronDown className="h-4 w-4 text-[#213368]" /> : <ChevronRight className="h-4 w-4 text-[#213368]" />}
        </TableCell>
        <TableCell className="font-semibold">{r.orcamento.cliente}</TableCell>
        <TableCell className="max-w-xs truncate text-xs">{r.orcamento.obra}</TableCell>
        <TableCell className="font-semibold">{brl(r.orcamento.valor)}</TableCell>
        <TableCell className="text-[#F37032] font-semibold">{brl(r.faturado)}</TableCell>
        <TableCell className="font-semibold">{brl(r.saldo)}</TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <div className="h-2 w-24 overflow-hidden rounded-full bg-[#213368]/10">
              <div className="h-full transition-all" style={{ width: `${r.pct}%`, background: cor }} />
            </div>
            <span className="text-xs font-semibold text-[#213368]">{r.pct}%</span>
          </div>
        </TableCell>
        <TableCell className="text-xs">{r.proximaMedicao ? new Date(r.proximaMedicao).toLocaleDateString("pt-BR") : "—"}</TableCell>
        <TableCell><StatusBadge status={statusMap[r.statusExec] ?? r.statusExec} /></TableCell>
        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={onToggle} className="text-xs">Ver medições</Button>
            <Button size="sm" onClick={onLancar} className="bg-[#F37032] text-white hover:bg-[#ff8850] text-xs h-8">
              <Plus className="mr-1 h-3 w-3" /> Lançar
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {expandido && (
        <TableRow>
          <TableCell colSpan={10} className="bg-muted/30 p-6">
            <AccordionMedicoes resumo={r} medicoes={medicoes} onLancar={onLancar} onEditMed={onEditMed} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ------------------------------------------------------------
function AccordionMedicoes({ resumo: r, medicoes, onLancar, onEditMed }: {
  resumo: ResumoOrcamento; medicoes: Medicao[]; onLancar: () => void; onEditMed: (m: Medicao) => void;
}) {
  return (
    <div className="space-y-5">
      {/* Timeline horizontal */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cronograma de medições</div>
        {medicoes.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhuma medição lançada ainda.</div>
        ) : (
          <div className="relative overflow-x-auto py-2">
            <div className="flex items-center gap-3 min-w-max">
              {medicoes.map((m, i) => {
                const lancada = m.status === "Recebida" || m.status === "Lançada";
                return (
                  <div key={m.id} className="flex items-center gap-3">
                    <div className={`flex flex-col items-center ${lancada ? "" : "opacity-70"}`}>
                      <div className={`h-4 w-4 rounded-full ${lancada ? "bg-[#F37032]" : "border-2 border-dashed border-[#213368] bg-white"}`} />
                      <div className="mt-1 text-[10px] font-semibold text-[#213368]">{m.numero}</div>
                      <div className="text-[10px] text-muted-foreground">{new Date(m.data).toLocaleDateString("pt-BR")}</div>
                      <div className="text-[11px] font-bold text-[#F37032]">{brl(m.valor)}</div>
                      <div className="text-[9px] text-muted-foreground">{m.status}</div>
                    </div>
                    {i < medicoes.length - 1 && <div className="h-0.5 w-8 bg-[#213368]/30" />}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Barra de progresso */}
      <div>
        <div className="flex justify-between text-xs">
          <span className="font-semibold text-[#213368]">Faturado {brl(r.faturado)}</span>
          <span className="text-muted-foreground">Saldo {brl(r.saldo)}</span>
        </div>
        <Progress value={r.pct} className="mt-1 h-2" />
      </div>

      {/* Tabela de medições */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Medições</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>% do total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {medicoes.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-4 text-center text-sm text-muted-foreground">Sem medições.</TableCell></TableRow>
            ) : medicoes.map(m => (
              <TableRow key={m.id}>
                <TableCell className="font-semibold">{m.numero}</TableCell>
                <TableCell>{new Date(m.data).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell className="max-w-xs truncate text-xs">{m.descricao}</TableCell>
                <TableCell className="font-semibold text-[#F37032]">{brl(m.valor)}</TableCell>
                <TableCell>{r.orcamento.valor ? ((m.valor / r.orcamento.valor) * 100).toFixed(1) : 0}%</TableCell>
                <TableCell><StatusBadge status={m.status} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => onEditMed(m)} aria-label="Editar"><Pencil className="h-4 w-4 text-[#213368]" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => { if (confirm("Excluir esta medição?")) { medicoesActions.excluir(m.id); toast.success("Medição excluída."); } }} aria-label="Excluir"><Trash2 className="h-4 w-4 text-red-600" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div>
        <Button onClick={onLancar} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
          <Plus className="mr-1 h-4 w-4" /> Lançar nova medição
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
function MedicaoForm({ open, onOpenChange, orcamentoIdInicial, medicao, orcamentosAprovados }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  orcamentoIdInicial?: string; medicao?: Medicao; orcamentosAprovados: Orcamento[];
}) {
  const editing = !!medicao;
  const medicoes = useMedicoes(s => s);
  const hoje = new Date().toISOString().slice(0, 10);
  const [orcId, setOrcId] = useState<string>("");
  const [numero, setNumero] = useState("");
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [previsao, setPrevisao] = useState(hoje);
  const [status, setStatus] = useState<MedStatus>("Lançada");
  const [obs, setObs] = useState("");
  const [anexo, setAnexo] = useState<string | undefined>();
  const [erro, setErro] = useState("");

  useMemo(() => {
    if (!open) return;
    if (medicao) {
      setOrcId(medicao.orcamentoId);
      setNumero(medicao.numero);
      setData(medicao.data);
      setValor(String(medicao.valor));
      setDescricao(medicao.descricao);
      setPrevisao(medicao.previsaoRecebimento);
      setStatus(medicao.status);
      setObs(medicao.observacoes);
      setAnexo(medicao.anexo);
    } else {
      const id = orcamentoIdInicial ?? orcamentosAprovados[0]?.id ?? "";
      setOrcId(id);
      setNumero(id ? proximoNumeroMedicao(id) : "MED-001");
      setData(hoje); setValor(""); setDescricao(""); setPrevisao(hoje);
      setStatus("Lançada"); setObs(""); setAnexo(undefined);
    }
    setErro("");
  }, [open, medicao?.id, orcamentoIdInicial]);

  const orc = orcamentosAprovados.find(o => o.id === orcId);
  const resumo = orc ? resumoDoOrcamento(orc, medicoes.filter(m => !editing || m.id !== medicao?.id)) : null;
  const saldoDisponivel = resumo?.saldo ?? 0;
  const valorNum = Number(valor) || 0;
  const pctDoSaldo = saldoDisponivel > 0 ? Math.min(100, (valorNum / saldoDisponivel) * 100) : 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!orcId) { setErro("Selecione um orçamento."); return; }
    if (!valor || valorNum <= 0) { setErro("Informe um valor válido."); return; }
    const payload = { orcamentoId: orcId, numero, data, valor: valorNum, descricao: descricao.trim(), previsaoRecebimento: previsao, status, observacoes: obs.trim(), anexo };
    if (editing && medicao) {
      medicoesActions.atualizar(medicao.id, payload);
      toast.success("Medição atualizada.");
    } else {
      medicoesActions.criar(payload);
      toast.success("Medição lançada.");
    }
    onOpenChange(false);
  }

  function onSelectOrc(id: string) {
    setOrcId(id);
    if (!editing) setNumero(proximoNumeroMedicao(id));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Editar medição" : "Lançar medição"}</DialogTitle></DialogHeader>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
          <div className="grid gap-2 md:col-span-2">
            <label className="text-sm font-medium text-[#213368]">Orçamento vinculado</label>
            <Select value={orcId} onValueChange={onSelectOrc} disabled={editing}>
              <SelectTrigger><SelectValue placeholder="Selecione um orçamento aprovado" /></SelectTrigger>
              <SelectContent>
                {orcamentosAprovados.map(o => (
                  <SelectItem key={o.id} value={o.id}>{o.numero} · {o.cliente} · {brl(o.valor)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field label="Nº da medição"><Input value={numero} onChange={e => setNumero(e.target.value)} /></Field>
          <Field label="Data da medição"><Input type="date" value={data} onChange={e => setData(e.target.value)} /></Field>
          <Field label="Valor (R$)">
            <Input type="number" value={valor} onChange={e => setValor(e.target.value)} />
            {orc && (
              <div className="mt-1 text-xs text-muted-foreground">
                Saldo disponível: <b>{brl(saldoDisponivel)}</b> · {pctDoSaldo.toFixed(1)}% do saldo
              </div>
            )}
          </Field>
          <Field label="Previsão de recebimento"><Input type="date" value={previsao} onChange={e => setPrevisao(e.target.value)} /></Field>
          <Field label="Descrição / etapa" className="md:col-span-2"><Input value={descricao} onChange={e => setDescricao(e.target.value)} /></Field>
          <Field label="Status">
            <Select value={status} onValueChange={v => setStatus(v as MedStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MED_STATUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Anexo (mock)">
            <Input type="file" onChange={e => setAnexo(e.target.files?.[0]?.name)} />
            {anexo && <div className="mt-1 text-xs text-muted-foreground">{anexo}</div>}
          </Field>
          <Field label="Observações" className="md:col-span-2"><Textarea rows={3} value={obs} onChange={e => setObs(e.target.value)} /></Field>

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

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid gap-2 ${className}`}>
      <label className="text-sm font-medium text-[#213368]">{label}</label>
      {children}
    </div>
  );
}
