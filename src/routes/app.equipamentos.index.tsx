import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/portal/StatusBadge";
import {
  Plus, Search, MapPin, User, ArrowRight, Package, Wrench, Zap, Truck, Hammer,
  Drill, Cog, HardHat, Fuel, Boxes, TrendingUp, TrendingDown, ChevronDown, ChevronRight, FolderPlus,
  MapPinned, Trash2, Pencil,
} from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, LineChart, Line,
} from "recharts";
import { toast } from "sonner";
import { brl } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import {
  useEquipStore, equipActions,
  type EquipStatus, type UnidadePeriodo,
} from "@/lib/equipamentos-store";

export const Route = createFileRoute("/app/equipamentos/")({ component: EquipamentosList });

const STATUS: EquipStatus[] = ["Disponível", "Emprestado", "Manutenção"];
const UNIDADES: UnidadePeriodo[] = ["dia", "semana", "mês"];

export function iconeCategoria(cat: string) {
  const c = (cat || "").toLowerCase();
  if (c.includes("energia") || c.includes("gerador") || c.includes("elétri")) return Zap;
  if (c.includes("transp") || c.includes("caminh") || c.includes("veíc")) return Truck;
  if (c.includes("concreto") || c.includes("betoneira")) return Cog;
  if (c.includes("furad") || c.includes("perfur") || c.includes("parafus")) return Drill;
  if (c.includes("marte") || c.includes("demol")) return Hammer;
  if (c.includes("segurança") || c.includes("epi")) return HardHat;
  if (c.includes("combust") || c.includes("óleo")) return Fuel;
  if (c.includes("ferra")) return Wrench;
  if (c.includes("almox") || c.includes("mater")) return Boxes;
  return Package;
}

type FormEq = {
  nome: string; codigo: string; categoria: string; descricao: string;
  valor: string; custoPeriodo: string; unidade: UnidadePeriodo;
  status: EquipStatus; localBase: string; fotoUrl: string;
};
const novoForm = (categoria = ""): FormEq => ({
  nome: "", codigo: "", categoria, descricao: "",
  valor: "", custoPeriodo: "", unidade: "dia",
  status: "Disponível", localBase: "", fotoUrl: "",
});

type Grupo = { id: string; nome: string };
type LocalTipo = "Base" | "Almoxarifado" | "Obra";
type Local = { id: string; nome: string; tipo: LocalTipo };
const TIPOS_LOCAL: LocalTipo[] = ["Base", "Almoxarifado", "Obra"];

function EquipamentosList() {
  const navigate = useNavigate();
  const equipamentos = useEquipStore(s => s.equipamentos);
  const emprestimos = useEquipStore(s => s.emprestimos);
  const manutencoes = useEquipStore(s => s.manutencoes);

  const [openEq, setOpenEq] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormEq>(novoForm());
  const [uploadingFoto, setUploadingFoto] = useState(false);

  const [busca, setBusca] = useState("");
  const [statusF, setStatusF] = useState("todos");
  const [catF, setCatF] = useState("todas");

  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [openGrupo, setOpenGrupo] = useState(false);
  const [novoGrupoNome, setNovoGrupoNome] = useState("");
  const [savingGrupo, setSavingGrupo] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const [locais, setLocais] = useState<Local[]>([]);
  const [openLocais, setOpenLocais] = useState(false);
  const [novoLocalNome, setNovoLocalNome] = useState("");
  const [novoLocalTipo, setNovoLocalTipo] = useState<LocalTipo>("Base");
  const [editLocalId, setEditLocalId] = useState<string | null>(null);
  const [savingLocal, setSavingLocal] = useState(false);

  useEffect(() => {
    (async () => {
      const [gRes, lRes] = await Promise.all([
        supabase.from("categorias_equipamentos").select("id, nome").order("nome", { ascending: true }),
        supabase.from("locais_equipamentos").select("id, nome, tipo").order("nome", { ascending: true }),
      ]);
      if (gRes.error) console.error(gRes.error);
      else {
        const lista = (gRes.data ?? []) as Grupo[];
        setGrupos(lista);
        setCollapsed(Object.fromEntries([...lista.map(g => g.nome), "Sem grupo"].map(n => [n, true])));
      }
      if (lRes.error) console.error(lRes.error);
      else setLocais((lRes.data ?? []) as Local[]);
    })();
  }, []);

  const salvarLocal = async () => {
    const nome = novoLocalNome.trim();
    if (!nome) return toast.error("Informe o nome do local");
    setSavingLocal(true);
    if (editLocalId) {
      const { data, error } = await supabase
        .from("locais_equipamentos")
        .update({ nome, tipo: novoLocalTipo })
        .eq("id", editLocalId)
        .select("id, nome, tipo")
        .single();
      setSavingLocal(false);
      if (error) return toast.error(`Falha ao atualizar: ${error.message}`);
      setLocais(ls => ls.map(l => l.id === editLocalId ? (data as Local) : l).sort((a, b) => a.nome.localeCompare(b.nome)));
      toast.success("Local atualizado");
    } else {
      const { data, error } = await supabase
        .from("locais_equipamentos")
        .insert({ nome, tipo: novoLocalTipo })
        .select("id, nome, tipo")
        .single();
      setSavingLocal(false);
      if (error) return toast.error(`Falha ao criar: ${error.message}`);
      setLocais(ls => [...ls, data as Local].sort((a, b) => a.nome.localeCompare(b.nome)));
      toast.success("Local criado");
    }
    setNovoLocalNome(""); setNovoLocalTipo("Base"); setEditLocalId(null);
  };

  const editarLocal = (l: Local) => {
    setEditLocalId(l.id); setNovoLocalNome(l.nome); setNovoLocalTipo(l.tipo);
  };

  const excluirLocal = async (id: string) => {
    if (!confirm("Excluir este local?")) return;
    const { error } = await supabase.from("locais_equipamentos").delete().eq("id", id);
    if (error) return toast.error(`Falha ao excluir: ${error.message}`);
    setLocais(ls => ls.filter(l => l.id !== id));
    if (editLocalId === id) { setEditLocalId(null); setNovoLocalNome(""); setNovoLocalTipo("Base"); }
    toast.success("Local excluído");
  };


  const categoriasEquip = useMemo(
    () => Array.from(new Set(equipamentos.map(e => e.categoria))).filter(Boolean),
    [equipamentos],
  );
  const categoriasFiltro = useMemo(
    () => Array.from(new Set([...grupos.map(g => g.nome), ...categoriasEquip])),
    [grupos, categoriasEquip],
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return equipamentos.filter(e => {
      const okQ = !q || e.nome.toLowerCase().includes(q) || e.codigo.toLowerCase().includes(q);
      const okS = statusF === "todos" || e.status === statusF;
      const okC = catF === "todas" || e.categoria === catF;
      return okQ && okS && okC;
    });
  }, [equipamentos, busca, statusF, catF]);

  const gruposComEquipamentos = useMemo(() => {
    const nomes = new Set(grupos.map(g => g.nome.toLowerCase()));
    const porGrupo: { nome: string; equipamentos: typeof filtrados }[] = grupos.map(g => ({
      nome: g.nome,
      equipamentos: filtrados.filter(e => e.categoria.toLowerCase() === g.nome.toLowerCase()),
    }));
    const semGrupo = filtrados.filter(e => !nomes.has((e.categoria || "").toLowerCase()));
    return { porGrupo, semGrupo };
  }, [grupos, filtrados]);

  const kpis = useMemo(() => {
    const receita = emprestimos.reduce((a, e) => a + (e.custoTotal || 0), 0);
    const custoManut = manutencoes.reduce((a, m) => a + (m.custo || 0), 0);
    const valorFrota = equipamentos.reduce((a, e) => a + (e.valor || 0), 0);
    const liquidoFrota = receita - custoManut;
    const roi = valorFrota > 0 ? (liquidoFrota / valorFrota) * 100 : 0;
    return {
      total: equipamentos.length,
      emUso: equipamentos.filter(e => e.status === "Emprestado").length,
      disp: equipamentos.filter(e => e.status === "Disponível").length,
      manut: equipamentos.filter(e => e.status === "Manutenção").length,
      receita, custoManut, roi, valorFrota,
    };
  }, [equipamentos, emprestimos, manutencoes]);

  const charts = useMemo(() => {
    // 1. Status pie
    const statusMap: Record<EquipStatus, { name: string; value: number; color: string }> = {
      "Disponível": { name: "Disponível", value: 0, color: "#16a34a" },
      "Emprestado": { name: "Alugado", value: 0, color: "#F37032" },
      "Manutenção": { name: "Em Manutenção", value: 0, color: "#dc2626" },
    };
    equipamentos.forEach(e => { if (statusMap[e.status]) statusMap[e.status].value += 1; });
    const porStatus = Object.values(statusMap).filter(s => s.value > 0);

    // 2. Valor da frota por categoria (horizontal bar)
    const valorCatMap = new Map<string, number>();
    equipamentos.forEach(e => {
      const c = e.categoria || "Sem categoria";
      valorCatMap.set(c, (valorCatMap.get(c) || 0) + (e.valor || 0));
    });
    const valorPorCategoria = Array.from(valorCatMap.entries())
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor);

    // 3. Receita diária potencial por categoria (custoPeriodo dos disponíveis)
    const receitaCatMap = new Map<string, number>();
    equipamentos.filter(e => e.status === "Disponível").forEach(e => {
      const c = e.categoria || "Sem categoria";
      let diario = e.custoPeriodo || 0;
      if (e.unidade === "semana") diario = diario / 7;
      else if (e.unidade === "mês") diario = diario / 30;
      receitaCatMap.set(c, (receitaCatMap.get(c) || 0) + diario);
    });
    const receitaPorCategoria = Array.from(receitaCatMap.entries())
      .map(([categoria, valor]) => ({ categoria, valor: Math.round(valor) }))
      .sort((a, b) => b.valor - a.valor);

    // 4. Equipamentos por local
    const localMap = new Map<string, number>();
    equipamentos.forEach(e => {
      const l = e.localAtual || e.localBase || "Sem local";
      localMap.set(l, (localMap.get(l) || 0) + 1);
    });
    const porLocal = Array.from(localMap.entries())
      .map(([local, qtd]) => ({ local, qtd }))
      .sort((a, b) => b.qtd - a.qtd);

    // 5. Alugados vs Disponíveis por categoria
    const acMap = new Map<string, { categoria: string; alugados: number; disponiveis: number }>();
    equipamentos.forEach(e => {
      const c = e.categoria || "Sem categoria";
      if (!acMap.has(c)) acMap.set(c, { categoria: c, alugados: 0, disponiveis: 0 });
      const row = acMap.get(c)!;
      if (e.status === "Emprestado") row.alugados += 1;
      else if (e.status === "Disponível") row.disponiveis += 1;
    });
    const alugadosVsDisp = Array.from(acMap.values()).sort((a, b) => (b.alugados + b.disponiveis) - (a.alugados + a.disponiveis));

    // 6. Evolução de aluguéis por mês (ano atual)
    const anoAtual = new Date().getFullYear();
    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const evolucao = meses.map((mes, i) => ({ mes, qtd: 0, idx: i }));
    emprestimos.forEach(e => {
      const d = new Date(e.dataInicio);
      if (!isNaN(d.getTime()) && d.getFullYear() === anoAtual) {
        evolucao[d.getMonth()].qtd += 1;
      }
    });

    return { porStatus, valorPorCategoria, receitaPorCategoria, porLocal, alugadosVsDisp, evolucao };
  }, [equipamentos, emprestimos]);

  const abrirNovo = (categoria = "") => { setEditId(null); setForm(novoForm(categoria)); setOpenEq(true); };

  const salvarGrupo = async () => {
    const nome = novoGrupoNome.trim();
    if (!nome) return toast.error("Informe o nome do grupo");
    if (grupos.some(g => g.nome.toLowerCase() === nome.toLowerCase())) {
      return toast.error("Já existe um grupo com esse nome");
    }
    setSavingGrupo(true);
    const { data, error } = await supabase
      .from("categorias_equipamentos")
      .insert({ nome })
      .select("id, nome")
      .single();
    setSavingGrupo(false);
    if (error) { toast.error(`Falha ao criar grupo: ${error.message}`); return; }
    setGrupos(gs => [...gs, data as Grupo].sort((a, b) => a.nome.localeCompare(b.nome)));
    setNovoGrupoNome("");
    setOpenGrupo(false);
    toast.success("Grupo criado");
  };

  const onSelecionarFoto = async (file: File | null) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Foto deve ter até 5MB");
    setUploadingFoto(true);
    try {
      const targetId = editId ?? `tmp-${Date.now()}`;
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${targetId}/${Date.now()}.${ext}`;
      const up = await supabase.storage.from("equipamentos").upload(path, file, {
        cacheControl: "3600", upsert: true, contentType: file.type,
      });
      if (up.error) { toast.error(`Falha no upload: ${up.error.message}`); return; }
      const { data } = supabase.storage.from("equipamentos").getPublicUrl(path);
      setForm(f => ({ ...f, fotoUrl: data.publicUrl }));
      toast.success("Foto enviada");
    } finally {
      setUploadingFoto(false);
    }
  };

  const salvar = () => {
    if (!form.nome.trim() || !form.codigo.trim()) return toast.error("Preencha nome e código");
    if (!form.categoria.trim()) return toast.error("Informe a categoria");
    const valor = Number(form.valor.replace(/\D/g, "")) || 0;
    const custoPeriodo = Number(form.custoPeriodo.replace(/\D/g, "")) || 0;
    const base = {
      nome: form.nome, codigo: form.codigo, categoria: form.categoria, descricao: form.descricao,
      valor, custoPeriodo, unidade: form.unidade, status: form.status,
      localBase: form.localBase, localAtual: form.localBase,
      fotoUrl: form.fotoUrl || undefined,
    };
    if (editId) { equipActions.atualizarEquipamento(editId, base); toast.success("Equipamento atualizado"); }
    else { equipActions.criarEquipamento(base); toast.success("Equipamento cadastrado"); }
    setOpenEq(false); setEditId(null);
  };

  const toggleCollapse = (nome: string) => setCollapsed(c => ({ ...c, [nome]: !c[nome] }));

  const renderCard = (e: typeof filtrados[number]) => {
    const Ico = iconeCategoria(e.categoria);
    return (
      <button
        key={e.id}
        onClick={() => navigate({ to: "/app/equipamentos/$id", params: { id: e.id } })}
        className="group text-left transition-all hover:-translate-y-1"
      >
        <Card className="overflow-hidden border-2 border-transparent transition-colors group-hover:border-[#F37032]">
          <div className="relative flex h-32 items-center justify-center overflow-hidden bg-gradient-to-br from-[#213368] to-[#2a4185]">
            {e.fotoUrl ? (
              <img src={e.fotoUrl} alt={e.nome} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
            ) : (
              <Ico className="h-14 w-14 text-white/90" strokeWidth={1.5} />
            )}
            <div className="absolute right-3 top-3 z-10">
              <StatusBadge status={e.status} />
            </div>
            <div className="absolute left-3 top-3 z-10 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
              {e.codigo}
            </div>
          </div>
          <div className="space-y-2 p-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#F37032]">{e.categoria || "—"}</div>
              <div className="line-clamp-1 text-sm font-bold text-[#213368]">{e.nome}</div>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="line-clamp-1">{e.localAtual || e.localBase || "—"}</span>
            </div>
            {e.responsavelAtual && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <User className="h-3 w-3 shrink-0" />
                <span className="line-clamp-1">{e.responsavelAtual}</span>
              </div>
            )}
            <div className="mt-2 flex items-end justify-between border-t pt-2">
              <div>
                <div className="text-[10px] text-muted-foreground">Custo</div>
                <div className="text-sm font-bold text-[#F37032]">{brl(e.custoPeriodo)}<span className="text-[10px] font-normal text-muted-foreground">/{e.unidade}</span></div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-muted-foreground">Valor</div>
                <div className="text-sm font-semibold text-[#213368]">{brl(e.valor)}</div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-[#F37032]" />
            </div>
          </div>
        </Card>
      </button>
    );
  };

  const renderGrupoSection = (nome: string, itens: typeof filtrados, opts?: { grupo?: boolean }) => {
    const isCollapsed = !!collapsed[nome];
    return (
      <Card key={nome} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-[#F8F9FB] px-4 py-3">
          <button
            onClick={() => toggleCollapse(nome)}
            className="flex items-center gap-2 text-left"
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4 text-[#213368]" /> : <ChevronDown className="h-4 w-4 text-[#213368]" />}
            <span className="text-sm font-extrabold uppercase tracking-wide text-[#213368]">{nome}</span>
            <span className="rounded-full bg-[#213368]/10 px-2 py-0.5 text-[10px] font-bold text-[#213368]">{itens.length}</span>
          </button>
          {opts?.grupo && (
            <Button
              size="sm" variant="outline"
              onClick={() => abrirNovo(nome)}
              className="border-[#F37032] text-[#F37032] hover:bg-[#F37032] hover:text-white"
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Novo equipamento
            </Button>
          )}
        </div>
        {!isCollapsed && (
          <div className="p-4">
            {itens.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">Nenhum equipamento neste grupo.</div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {itens.map(renderCard)}
              </div>
            )}
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-6 font-[Montserrat] animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-[#213368]">Equipamentos</h2>
          <p className="text-xs text-muted-foreground">Frota, empréstimos, manutenções e rentabilidade.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setOpenGrupo(true)} className="border-[#213368] text-[#213368] hover:bg-[#213368] hover:text-white">
            <FolderPlus className="mr-1 h-4 w-4" /> Novo grupo
          </Button>
          <Button variant="outline" onClick={() => setOpenLocais(true)} className="border-[#213368] text-[#213368] hover:bg-[#213368] hover:text-white">
            <MapPinned className="mr-1 h-4 w-4" /> Gerenciar Locais
          </Button>
          <Button onClick={() => abrirNovo()} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
            <Plus className="mr-1 h-4 w-4" /> Novo equipamento
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-7">
        <KpiCard label="Total" value={String(kpis.total)} color="#213368" />
        <KpiCard label="Em uso" value={String(kpis.emUso)} color="#213368" />
        <KpiCard label="Disponíveis" value={String(kpis.disp)} color="#16a34a" />
        <KpiCard label="Em manutenção" value={String(kpis.manut)} color="#d97706" />
        <KpiCard label="Receita total" value={brl(kpis.receita)} color="#F37032" />
        <KpiCard label="Custo manutenções" value={brl(kpis.custoManut)} color="#dc2626" />
        <KpiCard
          label="ROI médio da frota"
          value={`${kpis.roi.toFixed(1)}%`}
          color={kpis.roi >= 0 ? "#16a34a" : "#dc2626"}
          icon={kpis.roi >= 0 ? TrendingUp : TrendingDown}
        />
      </div>

      {/* Gráficos */}
      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="Equipamentos por Status">
          {charts.porStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={charts.porStatus} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                  {charts.porStatus.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <Vazio />}
        </ChartCard>

        <ChartCard title="Valor da Frota por Categoria">
          {charts.valorPorCategoria.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.valorPorCategoria} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                <XAxis type="number" stroke="#6E7280" fontSize={11} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="categoria" stroke="#6E7280" fontSize={11} width={110} />
                <Tooltip formatter={(v: number) => brl(v)} />
                <Bar dataKey="valor" name="Valor" fill="#213368" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Vazio />}
        </ChartCard>

        <ChartCard title="Receita Diária Potencial por Categoria">
          {charts.receitaPorCategoria.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.receitaPorCategoria}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="categoria" stroke="#6E7280" fontSize={11} />
                <YAxis stroke="#6E7280" fontSize={11} tickFormatter={v => `${(v / 1000).toFixed(1)}k`} />
                <Tooltip formatter={(v: number) => brl(v)} />
                <Bar dataKey="valor" name="Receita/dia" fill="#F37032" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Vazio />}
        </ChartCard>

        <ChartCard title="Equipamentos por Local">
          {charts.porLocal.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.porLocal}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="local" stroke="#6E7280" fontSize={11} />
                <YAxis stroke="#6E7280" fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="qtd" name="Equipamentos" fill="#213368" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Vazio />}
        </ChartCard>

        <ChartCard title="Alugados vs Disponíveis por Categoria">
          {charts.alugadosVsDisp.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.alugadosVsDisp}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="categoria" stroke="#6E7280" fontSize={11} />
                <YAxis stroke="#6E7280" fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="alugados" name="Alugados" fill="#F37032" radius={[6, 6, 0, 0]} />
                <Bar dataKey="disponiveis" name="Disponíveis" fill="#213368" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Vazio />}
        </ChartCard>

        <ChartCard title="Evolução de Aluguéis por Mês">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={charts.evolucao}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="mes" stroke="#6E7280" fontSize={11} />
              <YAxis stroke="#6E7280" fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="qtd" name="Aluguéis" stroke="#F37032" strokeWidth={2.5} dot={{ r: 3, fill: "#213368" }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>


      {/* Filtros */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou código" className="pl-9" />
          </div>
          <Select value={statusF} onValueChange={setStatusF}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {STATUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={catF} onValueChange={setCatF}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as categorias</SelectItem>
              {categoriasFiltro.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Grupos */}
      {filtrados.length === 0 && grupos.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">Nenhum equipamento encontrado.</Card>
      ) : (
        <div className="space-y-4">
          {gruposComEquipamentos.porGrupo.map(g => renderGrupoSection(g.nome, g.equipamentos, { grupo: true }))}
          {gruposComEquipamentos.semGrupo.length > 0 &&
            renderGrupoSection("Sem grupo", gruposComEquipamentos.semGrupo)}
        </div>
      )}

      {/* Diálogo Novo grupo */}
      <Dialog open={openGrupo} onOpenChange={setOpenGrupo}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novo grupo</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Nome do grupo</Label>
            <Input
              value={novoGrupoNome}
              onChange={e => setNovoGrupoNome(e.target.value)}
              placeholder="Ex.: Parafusadeiras, Andaimes, Veículos"
              onKeyDown={e => { if (e.key === "Enter") salvarGrupo(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenGrupo(false)}>Cancelar</Button>
            <Button onClick={salvarGrupo} disabled={savingGrupo} className="bg-[#213368] text-white hover:bg-[#2a4185]">
              {savingGrupo ? "Salvando…" : "Criar grupo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo Novo equipamento */}
      <Dialog open={openEq} onOpenChange={(v) => { setOpenEq(v); if (!v) setEditId(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editId ? "Editar equipamento" : "Novo equipamento"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Foto do equipamento</Label>
              <div className="mt-1 flex items-center gap-4">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-[#F4F4F4]">
                  {form.fotoUrl ? (
                    <img src={form.fotoUrl} alt="Foto" className="h-full w-full object-cover" />
                  ) : (
                    <Package className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <Input
                    type="file" accept="image/*"
                    onChange={e => onSelecionarFoto(e.target.files?.[0] ?? null)}
                    disabled={uploadingFoto}
                  />
                  {form.fotoUrl && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setForm(f => ({ ...f, fotoUrl: "" }))}>
                      Remover foto
                    </Button>
                  )}
                  {uploadingFoto && <p className="text-xs text-muted-foreground">Enviando…</p>}
                </div>
              </div>
            </div>
            <div className="md:col-span-2"><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
            <div><Label>Código / patrimônio *</Label><Input value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} /></div>
            <div>
              <Label>Categoria *</Label>
              {grupos.length > 0 ? (
                <Select value={form.categoria} onValueChange={v => setForm({ ...form, categoria: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione um grupo" /></SelectTrigger>
                  <SelectContent>
                    {grupos.map(g => <SelectItem key={g.id} value={g.nome}>{g.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} placeholder="Ex.: Energia, Transporte" />
              )}
            </div>
            <div className="md:col-span-2"><Label>Descrição</Label><Textarea rows={2} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></div>
            <div><Label>Valor (R$)</Label><Input inputMode="numeric" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} /></div>
            <div><Label>Custo por período (R$)</Label><Input inputMode="numeric" value={form.custoPeriodo} onChange={e => setForm({ ...form, custoPeriodo: e.target.value })} /></div>
            <div>
              <Label>Unidade</Label>
              <Select value={form.unidade} onValueChange={v => setForm({ ...form, unidade: v as UnidadePeriodo })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{UNIDADES.map(u => <SelectItem key={u} value={u}>por {u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status inicial</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as EquipStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2"><Label>Local base</Label><Input value={form.localBase} onChange={e => setForm({ ...form, localBase: e.target.value })} placeholder="Ex.: Almoxarifado Central" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenEq(false)}>Cancelar</Button>
            <Button onClick={salvar} className="bg-[#213368] text-white hover:bg-[#2a4185]">{editId ? "Salvar" : "Cadastrar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({ label, value, color, icon: Icon }: { label: string; value: string; color: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        {Icon && <Icon className="h-4 w-4 opacity-60" />}
      </div>
      <div className="mt-1 text-lg font-extrabold" style={{ color }}>{value}</div>
    </Card>
  );
}
