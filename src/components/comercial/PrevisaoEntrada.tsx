// ============================================================
// Previsão de Entrada — página completa
// ------------------------------------------------------------
// Consome os orçamentos aprovados do Comercial (orcamentos-store)
// e as medições (medicoes-comercial-store). Todos os KPIs, gráficos
// e tabela derivam desses dados — sem valores estáticos.
// ============================================================
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { toast } from "sonner";
import {
  ChevronDown, ChevronRight, Plus, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown,
  DollarSign, Wallet, TrendingUp, PieChart as PieIcon, Search, Circle,
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

const NOMES_MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MED_STATUS: MedStatus[] = ["Lançada", "Em aprovação", "Recebida", "Prevista"];

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function fmtData(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function progressColor(pct: number) {
  if (pct > 90) return "#213368";
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

  const kpis = useMemo(() => {
    try {
      const prevista = resumos.reduce((a, r) => a + (r.orcamento?.valor ?? 0), 0);
      const faturado = resumos.reduce((a, r) => a + (r.faturado ?? 0), 0);
      const saldo = Math.max(0, prevista - faturado);
      const pct = prevista > 0 ? (faturado / prevista) * 100 : 0;
      return { prevista, faturado, saldo, pct };
    } catch (err) {
      console.error("[previsao] kpis error:", err);
      return { prevista: 0, faturado: 0, saldo: 0, pct: 0 };
    }
  }, [resumos]);

  // Fluxo mensal: últimos 6 + próximos 3
  const fluxo = useMemo(() => {
    try {
      const hoje = new Date();
      const arr: { mes: string; previsto: number; faturado: number; acumulado: number }[] = [];
      let acc = 0;
      for (let i = -5; i <= 3; i++) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
        const dNext = new Date(hoje.getFullYear(), hoje.getMonth() + i + 1, 1);
        const previsto = medicoes
          .filter(m => { const md = new Date(m.previsaoRecebimento || m.data || 0); return md >= d && md < dNext; })
          .reduce((a, m) => a + (m.valor ?? 0), 0);
        const faturado = medicoes
          .filter(m => { const md = new Date(m.data || 0); return md >= d && md < dNext && m.status === "Recebida"; })
          .reduce((a, m) => a + (m.valor ?? 0), 0);
        acc += faturado;
        arr.push({ mes: `${NOMES_MES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, previsto, faturado, acumulado: acc });
      }
      return arr;
    } catch (err) {
      console.error("[previsao] fluxo error:", err);
      return [];
    }
  }, [medicoes]);

  const donut = [
    { name: "Já faturado", value: kpis.faturado, color: "#F37032" },
    { name: "Saldo a faturar", value: kpis.saldo, color: "#213368" },
  ].filter(x => x.value > 0);

  // Filtros da tabela
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("todos");
  const [sortBy, setSortBy] = useState<SortCol>("saldo");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [novaMed, setNovaMed] = useState<{ open: boolean; orcamentoId?: string }>({ open: false });
  const [editMed, setEditMed] = useState<Medicao | null>(null);

  const filtrados = useMemo(() => {
    const qLower = q.toLowerCase();
    let list = resumos;
    if (q) list = list.filter(r =>
      r.orcamento.cliente.toLowerCase().includes(qLower) ||
      r.orcamento.obra.toLowerCase().includes(qLower) ||
      r.orcamento.numero.toLowerCase().includes(qLower));
    if (fStatus !== "todos") list = list.filter(r => r.statusExec === fStatus);
    list = [...list].sort((a, b) => {
      const get = (r: ResumoOrcamento): string | number => {
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
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [resumos, q, fStatus, sortBy, sortDir]);

  function toggleSort(col: SortCol) {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-extrabold text-[#213368]">Previsão de Entrada</h1>
        <p className="text-xs text-muted-foreground">Acompanhamento de receita por orçamento aprovado</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Receita prevista" value={brl(kpis.prevista)} icon={DollarSign} tone="azul" />
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
                <YAxis stroke="#6E7280" fontSize={12} tickFormatter={v => `${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip formatter={(v: number) => brl(v)} />
                <Legend />
                <Bar dataKey="previsto" name="Previsto" fill="#213368" radius={[4, 4, 0, 0]} />
                <Bar dataKey="faturado" name="Faturado" fill="#F37032" radius={[4, 4, 0, 0]} />
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

      {/* Modais */}
      <MedicaoForm
        key={novaMed.open ? `nova-${novaMed.orcamentoId ?? "vazio"}` : "nova-closed"}
        open={novaMed.open}
        onOpenChange={o => !o && setNovaMed({ open: false })}
        orcamentoIdInicial={novaMed.orcamentoId}
        orcamentosAprovados={orcamentosAprovados}
      />
      <MedicaoForm
        key={editMed?.id ?? "edit-closed"}
        open={!!editMed}
        onOpenChange={o => !o && setEditMed(null)}
        medicao={editMed ?? undefined}
        orcamentosAprovados={orcamentosAprovados}
      />
    </div>
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
  label: string; col: SortCol; sortBy: SortCol; sortDir: "asc" | "desc"; onClick: (c: SortCol) => void;
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
  const medicoes = useMedicoes(s =>
    s.filter(m => m.orcamentoId === r.orcamento.id).sort((a, b) => a.data.localeCompare(b.data))
  );
  const cor = progressColor(r.pct);
  const statusMap: Record<string, string> = {
    "Concluído": "Concluído",
    "Em execução": "Em andamento",
    "Aguardando início": "Planejamento",
  };

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
        <TableCell className="text-xs">{r.proximaMedicao ? fmtData(r.proximaMedicao) : "—"}</TableCell>
        <TableCell><StatusBadge status={statusMap[r.statusExec] ?? r.statusExec} /></TableCell>
        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={onToggle} className="text-xs h-8">Ver medições</Button>
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
  const medStatusBadgeCor: Record<MedStatus, string> = {
    "Recebida": "#16A34A",
    "Lançada": "#F37032",
    "Em aprovação": "#213368",
    "Prevista": "#94A3B8",
  };

  return (
    <div className="space-y-5">
      {/* Mini-timeline */}
      <div>
        <div className="text-xs font-semibold text-[#213368] mb-3">Linha do tempo</div>
        {medicoes.length === 0 ? (
          <div className="text-xs text-muted-foreground">Nenhuma medição lançada.</div>
        ) : (
          <div className="relative flex items-center overflow-x-auto pb-2">
            <div className="absolute left-0 right-0 top-3 h-0.5 bg-[#213368]/20" />
            {medicoes.map((m, idx) => (
              <div key={m.id} className="relative flex flex-col items-center min-w-[110px] px-2">
                <div
                  className="z-10 h-6 w-6 rounded-full border-2 border-white shadow flex items-center justify-center"
                  style={{ background: medStatusBadgeCor[m.status] }}
                >
                  <Circle className="h-2 w-2 fill-white text-white" />
                </div>
                <div className="mt-2 text-[10px] font-bold text-[#213368]">{m.numero}</div>
                <div className="text-[10px] text-muted-foreground">{fmtData(m.data)}</div>
                <div className="text-[10px] font-semibold text-[#F37032]">{brl(m.valor)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabela de medições */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-[#213368]">Medições — {r.orcamento.numero}</div>
          <Button size="sm" onClick={onLancar} className="bg-[#F37032] text-white hover:bg-[#ff8850] h-8 text-xs">
            <Plus className="mr-1 h-3 w-3" /> Lançar nova medição
          </Button>
        </div>
        {medicoes.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
            Sem medições registradas para este orçamento.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Previsão receb.</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {medicoes.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="font-bold text-[#213368]">{m.numero}</TableCell>
                    <TableCell className="text-xs">{fmtData(m.data)}</TableCell>
                    <TableCell className="text-xs">{m.descricao || "—"}</TableCell>
                    <TableCell className="font-semibold text-[#F37032]">{brl(m.valor)}</TableCell>
                    <TableCell className="text-xs">{fmtData(m.previsaoRecebimento)}</TableCell>
                    <TableCell>
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                        style={{ background: medStatusBadgeCor[m.status] }}
                      >
                        {m.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEditMed(m)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                          onClick={() => {
                            if (confirm(`Excluir medição ${m.numero}?`)) {
                              medicoesActions.excluir(m.id);
                              toast.success("Medição excluída.");
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
function MedicaoForm({ open, onOpenChange, orcamentoIdInicial, medicao, orcamentosAprovados }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orcamentoIdInicial?: string;
  medicao?: Medicao;
  orcamentosAprovados: Orcamento[];
}) {
  const medicoes = useMedicoes(s => s);
  const isEdit = !!medicao;

  const [orcamentoId, setOrcamentoId] = useState<string>(
    medicao?.orcamentoId ?? orcamentoIdInicial ?? orcamentosAprovados[0]?.id ?? "",
  );
  const [data, setData] = useState(medicao?.data ?? new Date().toISOString().slice(0, 10));
  const [valor, setValor] = useState<number>(medicao?.valor ?? 0);
  const [descricao, setDescricao] = useState(medicao?.descricao ?? "");
  const [previsao, setPrevisao] = useState(medicao?.previsaoRecebimento ?? new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<MedStatus>(medicao?.status ?? "Lançada");
  const [obs, setObs] = useState(medicao?.observacoes ?? "");

  const orc = orcamentosAprovados.find(o => o.id === orcamentoId);
  const numero = useMemo(
    () => medicao?.numero ?? (orcamentoId ? proximoNumeroMedicao(orcamentoId) : "MED-001"),
    [orcamentoId, medicao],
  );

  const outrasMeds = medicoes.filter(m => m.orcamentoId === orcamentoId && m.id !== medicao?.id);
  const jaFaturadoOutros = outrasMeds.reduce((a, m) => a + m.valor, 0);
  const saldoAntes = orc ? Math.max(0, orc.valor - jaFaturadoOutros) : 0;
  const pctSaldo = saldoAntes > 0 ? Math.min(100, (valor / saldoAntes) * 100) : 0;

  function salvar() {
    if (!orcamentoId) return toast.error("Selecione um orçamento.");
    if (valor <= 0) return toast.error("Valor deve ser maior que zero.");
    if (isEdit && medicao) {
      medicoesActions.atualizar(medicao.id, {
        orcamentoId, data, valor, descricao, previsaoRecebimento: previsao, status, observacoes: obs,
      });
      toast.success("Medição atualizada.");
    } else {
      medicoesActions.criar({
        orcamentoId, numero, data, valor, descricao, previsaoRecebimento: previsao, status, observacoes: obs,
      });
      toast.success(`Medição ${numero} lançada.`);
    }
    onOpenChange(false);
  }

  const corBarra = pctSaldo > 90 ? "#DC2626" : pctSaldo >= 50 ? "#F37032" : "#16A34A";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[#213368]">{isEdit ? "Editar medição" : "Lançar nova medição"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[#213368]">Orçamento vinculado</label>
            <Select value={orcamentoId} onValueChange={setOrcamentoId} disabled={isEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {orcamentosAprovados.map(o => (
                  <SelectItem key={o.id} value={o.id}>{o.numero} — {o.cliente}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#213368]">Nº medição</label>
              <Input value={numero} disabled />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#213368]">Data</label>
              <Input type="date" value={data} onChange={e => setData(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#213368]">Valor (R$)</label>
            <Input
              type="number" min={0} step={1000} value={valor}
              onChange={e => setValor(Number(e.target.value) || 0)}
            />
            {orc && (
              <div className="mt-1 space-y-1">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{pctSaldo.toFixed(1)}% do saldo restante</span>
                  <span>Saldo antes: {brl(saldoAntes)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#213368]/10">
                  <div className="h-full transition-all" style={{ width: `${pctSaldo}%`, background: corBarra }} />
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-[#213368]">Descrição</label>
            <Input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex: Fundações, estrutura..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#213368]">Previsão recebimento</label>
              <Input type="date" value={previsao} onChange={e => setPrevisao(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#213368]">Status</label>
              <Select value={status} onValueChange={v => setStatus(v as MedStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MED_STATUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#213368]">Observações</label>
            <Textarea rows={2} value={obs} onChange={e => setObs(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
            {isEdit ? "Salvar alterações" : "Lançar medição"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
