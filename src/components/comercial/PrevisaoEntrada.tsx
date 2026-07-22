// ============================================================
// Previsão de Entrada — módulo Comercial
// ------------------------------------------------------------
// Cada orçamento aprovado vira uma linha de receita prevista.
// Medições são lançadas por cima para registrar o faturado.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, PieChart, Pie, Cell,
} from "recharts";
import {
  ChevronDown, ChevronRight, Plus, Pencil, Trash2, Search,
  ArrowUpDown, TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

// -------------------- tipos --------------------
type Orcamento = {
  id: string;
  numero: string;
  cliente: string;
  obra: string;
  valor: number;
  data_emissao: string | null;
  status: string;
};

type MedStatus = "LANÇADA" | "EM APROVAÇÃO" | "RECEBIDA";

type Medicao = {
  id: string;
  orcamento_id: string;
  numero: string;
  data: string;
  descricao: string;
  valor: number;
  data_recebimento: string | null;
  status: MedStatus;
  observacoes: string;
};

// -------------------- helpers --------------------
const AZUL = "#213368";
const LARANJA = "#F37032";

const brl = (v: number) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function mesLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`;
}

function statusExecucao(pct: number): { label: string; color: string } {
  if (pct >= 100) return { label: "CONCLUÍDO", color: "#16A34A" };
  if (pct > 0) return { label: "EM EXECUÇÃO", color: LARANJA };
  return { label: "AGUARDANDO INÍCIO", color: "#94A3B8" };
}

function corBarra(pct: number): string {
  if (pct <= 50) return "#16A34A";
  if (pct <= 90) return LARANJA;
  return AZUL;
}

// ============================================================
// COMPONENTE
// ============================================================
export function PrevisaoEntrada() {
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [medicoes, setMedicoes] = useState<Medicao[]>([]);
  const [projetos, setProjetos] = useState<{ id: string; orcamento_id: string | null; status: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [orcamentoSelecionado, setOrcamentoSelecionado] = useState<Orcamento | null>(null);
  const [editMed, setEditMed] = useState<Medicao | null>(null);
  const [busca, setBusca] = useState("");
  const [sortKey, setSortKey] = useState<"cliente" | "obra" | "valor" | "faturado" | "saldo" | "pct">("cliente");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [iniciando, setIniciando] = useState<string | null>(null);

  useEffect(() => {
    async function carregar() {
      try {
        const [{ data: orcs }, { data: meds }, { data: prjs }] = await Promise.all([
          supabase.from("orcamentos").select("*").eq("status", "APROVADO"),
          supabase.from("medicoes").select("*"),
          supabase.from("projetos").select("id, orcamento_id, status"),
        ]);
        setOrcamentos((orcs ?? []) as Orcamento[]);
        setMedicoes((meds ?? []) as Medicao[]);
        setProjetos((prjs ?? []) as any);
      } catch (err) {
        console.error("[previsao] carregar:", err);
        setOrcamentos([]);
        setMedicoes([]);
      } finally {
        setLoading(false);
      }
    }
    void carregar();
  }, []);

  async function iniciarObra(orc: Orcamento) {
    setIniciando(orc.id);
    try {
      const { garantirProjetoDeOrcamento } = await import("@/lib/projeto-auto");
      const projetoId = await garantirProjetoDeOrcamento({
        id: orc.id, obra: orc.obra, cliente: orc.cliente, valor: orc.valor,
        responsavel: (orc as any).responsavel ?? "",
      });
      if (!projetoId) { toast.error("Não foi possível criar o projeto vinculado."); return; }
      const hoje = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from("projetos").update({
        status: "EM ANDAMENTO", data_inicio: hoje,
      }).eq("id", projetoId);
      if (error) { toast.error(`Erro ao iniciar obra: ${error.message}`); return; }
      setProjetos(list => {
        const outros = list.filter(p => p.id !== projetoId);
        return [...outros, { id: projetoId, orcamento_id: orc.id, status: "EM ANDAMENTO" }];
      });
      toast.success("Obra iniciada.");
    } finally {
      setIniciando(null);
    }
  }


  // -------------------- cálculos --------------------
  const resumo = useMemo(() => {
    const list = orcamentos ?? [];
    const meds = medicoes ?? [];
    const receita = list.reduce((a, o) => a + (o.valor ?? 0), 0);
    const faturado = meds.reduce((a, m) => a + (m.valor ?? 0), 0);
    const saldo = Math.max(0, receita - faturado);
    const pct = receita > 0 ? Math.min(100, (faturado / receita) * 100) : 0;
    return { receita, faturado, saldo, pct };
  }, [orcamentos, medicoes]);

  const fluxoMensal = useMemo(() => {
    const map = new Map<string, { mes: string; previsto: number; faturado: number; ord: string }>();
    (orcamentos ?? []).forEach(o => {
      const m = mesLabel(o.data_emissao);
      if (!m) return;
      const ord = (o.data_emissao ?? "").slice(0, 7);
      const cur = map.get(m) ?? { mes: m, previsto: 0, faturado: 0, ord };
      cur.previsto += o.valor ?? 0;
      map.set(m, cur);
    });
    (medicoes ?? []).forEach(md => {
      const m = mesLabel(md.data);
      if (!m) return;
      const ord = (md.data ?? "").slice(0, 7);
      const cur = map.get(m) ?? { mes: m, previsto: 0, faturado: 0, ord };
      cur.faturado += md.valor ?? 0;
      map.set(m, cur);
    });
    return Array.from(map.values()).sort((a, b) => a.ord.localeCompare(b.ord));
  }, [orcamentos, medicoes]);

  const donutData = useMemo(() => ([
    { name: "Faturado", value: resumo.faturado, color: LARANJA },
    { name: "Saldo", value: resumo.saldo, color: AZUL },
  ]), [resumo]);

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = (orcamentos ?? [])
      .filter(o =>
        !q || (o.cliente ?? "").toLowerCase().includes(q) ||
        (o.obra ?? "").toLowerCase().includes(q)
      )
      .map(o => {
        const meds = (medicoes ?? []).filter(m => m.orcamento_id === o.id);
        const faturado = meds.reduce((a, m) => a + (m.valor ?? 0), 0);
        const saldo = Math.max(0, (o.valor ?? 0) - faturado);
        const pct = (o.valor ?? 0) > 0 ? Math.min(100, (faturado / o.valor) * 100) : 0;
        return { orc: o, meds, faturado, saldo, pct };
      });

    const dir = sortDir === "asc" ? 1 : -1;
    base.sort((a, b) => {
      let x: string | number = 0, y: string | number = 0;
      switch (sortKey) {
        case "cliente": x = a.orc.cliente ?? ""; y = b.orc.cliente ?? ""; break;
        case "obra":    x = a.orc.obra ?? "";    y = b.orc.obra ?? "";    break;
        case "valor":   x = a.orc.valor ?? 0;    y = b.orc.valor ?? 0;    break;
        case "faturado":x = a.faturado;          y = b.faturado;          break;
        case "saldo":   x = a.saldo;             y = b.saldo;             break;
        case "pct":     x = a.pct;               y = b.pct;               break;
      }
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
    return base;
  }, [orcamentos, medicoes, busca, sortKey, sortDir]);

  function toggleSort(k: typeof sortKey) {
    if (k === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }

  function proximoNumeroMed(orcamentoId: string): string {
    const n = (medicoes ?? []).filter(m => m.orcamento_id === orcamentoId).length + 1;
    return `MED-${String(n).padStart(3, "0")}`;
  }

  function abrirNovaMed(orc: Orcamento) {
    setOrcamentoSelecionado(orc);
    setEditMed(null);
    setModalOpen(true);
  }
  function abrirEditar(orc: Orcamento, med: Medicao) {
    setOrcamentoSelecionado(orc);
    setEditMed(med);
    setModalOpen(true);
  }

  async function excluirMed(id: string) {
    if (!confirm("Excluir esta medição?")) return;
    const anterior = medicoes;
    setMedicoes(m => m.filter(x => x.id !== id));
    const { error } = await supabase.from("medicoes").delete().eq("id", id);
    if (error) {
      setMedicoes(anterior);
      toast.error("Erro ao excluir medição");
    } else {
      toast.success("Medição excluída");
    }
  }

  async function salvarMed(payload: Omit<Medicao, "id"> & { id?: string }) {
    if (editMed) {
      const { error } = await supabase.from("medicoes").update({
        numero: payload.numero,
        data: payload.data,
        descricao: payload.descricao,
        valor: payload.valor,
        data_recebimento: payload.data_recebimento,
        status: payload.status,
        observacoes: payload.observacoes,
      }).eq("id", editMed.id);
      if (error) { toast.error("Erro ao salvar medição"); return; }
      setMedicoes(list => list.map(m => m.id === editMed.id ? { ...m, ...payload, id: editMed.id } : m));
      toast.success("Medição atualizada");
    } else {
      const id = `MED-${Date.now().toString(36).toUpperCase()}`;
      const nova: Medicao = { ...payload, id };
      setMedicoes(list => [nova, ...list]);
      const { error } = await supabase.from("medicoes").insert({
        id,
        orcamento_id: payload.orcamento_id,
        numero: payload.numero,
        data: payload.data,
        descricao: payload.descricao,
        valor: payload.valor,
        data_recebimento: payload.data_recebimento,
        status: payload.status,
        observacoes: payload.observacoes,
      });
      if (error) {
        setMedicoes(list => list.filter(m => m.id !== id));
        toast.error("Erro ao lançar medição");
        return;
      }
      toast.success("Medição lançada com sucesso");
    }
    setModalOpen(false);
  }

  // -------------------- render --------------------
  if (loading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Carregando previsão de entrada...</div>
    );
  }

  return (
    <div className="space-y-6 font-[Montserrat]">
      <div>
        <h1 className="text-2xl font-extrabold" style={{ color: AZUL }}>Previsão de Entrada</h1>
        <p className="text-xs text-muted-foreground">
          Receita prevista com base em orçamentos aprovados e medições faturadas.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <KpiCard titulo="Receita prevista total" valor={brl(resumo.receita)} cor={AZUL} />
        <KpiCard titulo="Já faturado" valor={brl(resumo.faturado)} cor={LARANJA} />
        <KpiCard titulo="Saldo a faturar" valor={brl(resumo.saldo)} cor={AZUL} />
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-muted-foreground">% Executado</p>
          <p className="mt-1 text-2xl font-extrabold" style={{ color: AZUL }}>
            {resumo.pct.toFixed(1)}%
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${resumo.pct}%`, background: corBarra(resumo.pct) }}
            />
          </div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold" style={{ color: AZUL }}>Fluxo de entrada mensal</h2>
          {fluxoMensal.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={fluxoMensal}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mes" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => brl(v)} />
                <Legend />
                <Bar dataKey="previsto" name="Previsto" fill={AZUL} radius={[6, 6, 0, 0]} />
                <Bar dataKey="faturado" name="Faturado" fill={LARANJA} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold" style={{ color: AZUL }}>Execução financeira</h2>
          {resumo.receita === 0 ? (
            <EmptyChart />
          ) : (
            <div className="relative">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={2}
                  >
                    {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => brl(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-8">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Previsto</span>
                <span className="text-base font-extrabold" style={{ color: AZUL }}>{brl(resumo.receita)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <h2 className="text-sm font-bold" style={{ color: AZUL }}>Orçamentos aprovados</h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente ou obra..."
              className="h-9 w-72 pl-8"
            />
          </div>
        </div>

        {linhas.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhum orçamento aprovado até o momento.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs uppercase text-muted-foreground">
                  <th className="w-8 px-3 py-2"></th>
                  <ThSort label="Cliente"       k="cliente"  sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <ThSort label="Obra"          k="obra"     sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <ThSort label="Valor aprovado" k="valor"   sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} className="text-right" />
                  <ThSort label="Faturado"      k="faturado" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} className="text-right" />
                  <ThSort label="Saldo"         k="saldo"    sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} className="text-right" />
                  <ThSort label="% Executado"   k="pct"      sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ orc, meds, faturado, saldo, pct }) => {
                  const aberto = expandido === orc.id;
                  const st = statusExecucao(pct);
                  return (
                    <>
                      <tr
                        key={orc.id}
                        className="cursor-pointer border-b hover:bg-slate-50"
                        onClick={() => setExpandido(aberto ? null : orc.id)}
                      >
                        <td className="px-3 py-3">
                          {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </td>
                        <td className="px-3 py-3 font-semibold" style={{ color: AZUL }}>{orc.cliente || "—"}</td>
                        <td className="px-3 py-3">{orc.obra || "—"}</td>
                        <td className="px-3 py-3 text-right">{brl(orc.valor)}</td>
                        <td className="px-3 py-3 text-right">{brl(faturado)}</td>
                        <td className="px-3 py-3 text-right">{brl(saldo)}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full" style={{ width: `${pct}%`, background: corBarra(pct) }} />
                            </div>
                            <span className="text-xs font-semibold">{pct.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {(() => {
                            const proj = projetos.find(p => p.orcamento_id === orc.id);
                            const label = proj?.status ?? st.label;
                            const cor = proj?.status === "EM ANDAMENTO" ? LARANJA
                              : proj?.status === "CONCLUÍDO" ? "#16A34A"
                              : proj?.status === "PLANEJAMENTO" ? "#94A3B8"
                              : proj?.status === "PARALISADO" ? "#DC2626"
                              : st.color;
                            return (
                              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: cor }}>
                                {label}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            {(() => {
                              const proj = projetos.find(p => p.orcamento_id === orc.id);
                              const jaIniciada = proj && proj.status !== "PLANEJAMENTO";
                              return (
                                <Button
                                  size="sm"
                                  className="h-8"
                                  variant="outline"
                                  disabled={iniciando === orc.id || jaIniciada}
                                  onClick={() => iniciarObra(orc)}
                                  style={{ borderColor: AZUL, color: AZUL }}
                                >
                                  <TrendingUp className="mr-1 h-3.5 w-3.5" />
                                  {jaIniciada ? "Obra iniciada" : (iniciando === orc.id ? "Iniciando..." : "Iniciar obra")}
                                </Button>
                              );
                            })()}
                            <Button
                              size="sm"
                              className="h-8"
                              style={{ background: LARANJA, color: "white" }}
                              onClick={() => abrirNovaMed(orc)}
                            >
                              <Plus className="mr-1 h-3.5 w-3.5" /> Medição
                            </Button>
                          </div>
                        </td>

                      </tr>
                      {aberto && (
                        <tr key={`${orc.id}-exp`} className="border-b bg-slate-50/60">
                          <td colSpan={9} className="p-4">
                            <AccordionMedicoes
                              orc={orc}
                              meds={meds}
                              pct={pct}
                              onEditar={(m) => abrirEditar(orc, m)}
                              onExcluir={excluirMed}
                              onNova={() => abrirNovaMed(orc)}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {orcamentoSelecionado && (
        <MedicaoModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          orcamento={orcamentoSelecionado}
          jaFaturado={
            (medicoes ?? [])
              .filter(m => m.orcamento_id === orcamentoSelecionado.id && (!editMed || m.id !== editMed.id))
              .reduce((a, m) => a + (m.valor ?? 0), 0)
          }
          proximoNumero={editMed ? editMed.numero : proximoNumeroMed(orcamentoSelecionado.id)}
          existente={editMed}
          onSalvar={salvarMed}
        />
      )}
    </div>
  );
}

// ============================================================
// Sub-componentes
// ============================================================

function KpiCard({ titulo, valor, cor }: { titulo: string; valor: string; cor: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-2xl font-extrabold" style={{ color: cor }}>{valor}</p>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
      <TrendingUp className="h-8 w-8 opacity-40" />
      Sem dados suficientes para exibir.
    </div>
  );
}

function ThSort({
  label, k, sortKey, sortDir, onClick, className = "",
}: {
  label: string;
  k: "cliente" | "obra" | "valor" | "faturado" | "saldo" | "pct";
  sortKey: string;
  sortDir: "asc" | "desc";
  onClick: (k: any) => void;
  className?: string;
}) {
  const active = sortKey === k;
  return (
    <th className={`px-3 py-2 ${className}`}>
      <button
        type="button"
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-1 ${active ? "text-slate-900" : ""}`}
      >
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"}`} />
        {active && <span className="text-[10px]">{sortDir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

function AccordionMedicoes({
  orc, meds, pct, onEditar, onExcluir, onNova,
}: {
  orc: Orcamento;
  meds: Medicao[];
  pct: number;
  onEditar: (m: Medicao) => void;
  onExcluir: (id: string) => void;
  onNova: () => void;
}) {
  const total = orc.valor ?? 0;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-semibold" style={{ color: AZUL }}>
              Execução do orçamento
            </span>
            <span className="font-semibold">{pct.toFixed(1)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full transition-all" style={{ width: `${pct}%`, background: corBarra(pct) }} />
          </div>
        </div>
        <Button
          size="sm"
          style={{ background: LARANJA, color: "white" }}
          onClick={onNova}
        >
          <Plus className="mr-1 h-4 w-4" /> Lançar nova medição
        </Button>
      </div>

      {meds.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          Nenhuma medição lançada para este orçamento.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Nº</th>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Descrição</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2 text-right">% do total</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {meds.map(m => (
                <tr key={m.id} className="border-t">
                  <td className="px-3 py-2 font-semibold">{m.numero}</td>
                  <td className="px-3 py-2">{m.data ? new Date(m.data).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-3 py-2">{m.descricao || "—"}</td>
                  <td className="px-3 py-2 text-right">{brl(m.valor)}</td>
                  <td className="px-3 py-2 text-right">
                    {total > 0 ? ((m.valor / total) * 100).toFixed(1) : "0"}%
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold">
                      {m.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEditar(m)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={() => onExcluir(m.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Modal de medição
// ============================================================
function MedicaoModal({
  open, onClose, orcamento, jaFaturado, proximoNumero, existente, onSalvar,
}: {
  open: boolean;
  onClose: () => void;
  orcamento: Orcamento;
  jaFaturado: number;
  proximoNumero: string;
  existente: Medicao | null;
  onSalvar: (m: Omit<Medicao, "id"> & { id?: string }) => Promise<void>;
}) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [numero, setNumero] = useState(proximoNumero);
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState<number>(0);
  const [descricao, setDescricao] = useState("");
  const [dataRecebimento, setDataRecebimento] = useState<string>("");
  const [status, setStatus] = useState<MedStatus>("LANÇADA");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (existente) {
      setNumero(existente.numero);
      setData(existente.data ?? hoje);
      setValor(existente.valor ?? 0);
      setDescricao(existente.descricao ?? "");
      setDataRecebimento(existente.data_recebimento ?? "");
      setStatus(existente.status);
      setObservacoes(existente.observacoes ?? "");
    } else {
      setNumero(proximoNumero);
      setData(hoje);
      setValor(0);
      setDescricao("");
      setDataRecebimento("");
      setStatus("LANÇADA");
      setObservacoes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existente, proximoNumero, open]);

  const saldoRestante = Math.max(0, (orcamento.valor ?? 0) - jaFaturado);
  const pctDoSaldo = saldoRestante > 0 ? Math.min(100, (valor / saldoRestante) * 100) : 0;

  async function submit() {
    if (valor <= 0) { toast.error("Informe um valor válido"); return; }
    setSalvando(true);
    try {
      await onSalvar({
        orcamento_id: orcamento.id,
        numero,
        data,
        descricao,
        valor,
        data_recebimento: dataRecebimento || null,
        status,
        observacoes,
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle style={{ color: AZUL }}>
            {existente ? "Editar medição" : "Lançar medição"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Orçamento vinculado</Label>
            <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm">
              <span className="font-semibold" style={{ color: AZUL }}>{orcamento.cliente || "—"}</span>
              {orcamento.obra ? ` · ${orcamento.obra}` : ""} · {brl(orcamento.valor)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nº da medição</Label>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-xs">Valor (R$)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={valor}
              onChange={(e) => setValor(Number(e.target.value) || 0)}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Saldo restante: <span className="font-semibold">{brl(saldoRestante)}</span> · Esta medição representa{" "}
              <span className="font-semibold" style={{ color: LARANJA }}>{pctDoSaldo.toFixed(1)}%</span> do saldo.
            </p>
          </div>

          <div>
            <Label className="text-xs">Descrição</Label>
            <Textarea
              rows={2}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Prev. recebimento</Label>
              <Input type="date" value={dataRecebimento} onChange={(e) => setDataRecebimento(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as MedStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LANÇADA">LANÇADA</SelectItem>
                  <SelectItem value="EM APROVAÇÃO">EM APROVAÇÃO</SelectItem>
                  <SelectItem value="RECEBIDA">RECEBIDA</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button
            style={{ background: LARANJA, color: "white" }}
            onClick={submit}
            disabled={salvando}
          >
            {salvando ? "Salvando..." : (existente ? "Salvar alterações" : "Lançar medição")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
