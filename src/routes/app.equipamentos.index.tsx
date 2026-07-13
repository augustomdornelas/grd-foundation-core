import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
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
  Drill, Cog, HardHat, Fuel, Boxes, TrendingUp, TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import {
  useEquipStore, equipActions,
  type Equipamento, type EquipStatus, type UnidadePeriodo,
} from "@/lib/equipamentos-store";

export const Route = createFileRoute("/app/equipamentos/")({ component: EquipamentosList });

const STATUS: EquipStatus[] = ["Disponível", "Emprestado", "Manutenção"];
const UNIDADES: UnidadePeriodo[] = ["dia", "semana", "mês"];

export function iconeCategoria(cat: string) {
  const c = (cat || "").toLowerCase();
  if (c.includes("energia") || c.includes("gerador") || c.includes("elétri")) return Zap;
  if (c.includes("transp") || c.includes("caminh") || c.includes("veíc")) return Truck;
  if (c.includes("concreto") || c.includes("betoneira")) return Cog;
  if (c.includes("furad") || c.includes("perfur")) return Drill;
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
const novoForm = (): FormEq => ({
  nome: "", codigo: "", categoria: "", descricao: "",
  valor: "", custoPeriodo: "", unidade: "dia",
  status: "Disponível", localBase: "", fotoUrl: "",
});

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

  const categorias = useMemo(() => Array.from(new Set(equipamentos.map(e => e.categoria))).filter(Boolean), [equipamentos]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return equipamentos.filter(e => {
      const okQ = !q || e.nome.toLowerCase().includes(q) || e.codigo.toLowerCase().includes(q);
      const okS = statusF === "todos" || e.status === statusF;
      const okC = catF === "todas" || e.categoria === catF;
      return okQ && okS && okC;
    });
  }, [equipamentos, busca, statusF, catF]);

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

  const abrirNovo = () => { setEditId(null); setForm(novoForm()); setOpenEq(true); };
  const abrirEditar = (e: Equipamento) => {
    setEditId(e.id);
    setForm({
      nome: e.nome, codigo: e.codigo, categoria: e.categoria, descricao: e.descricao,
      valor: String(e.valor || ""), custoPeriodo: String(e.custoPeriodo || ""),
      unidade: e.unidade, status: e.status, localBase: e.localBase, fotoUrl: e.fotoUrl ?? "",
    });
    setOpenEq(true);
  };

  const onSelecionarFoto = async (file: File | null) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Foto deve ter até 5MB");
    setUploadingFoto(true);
    try {
      // upload direto para bucket público — mesma pasta se estiver editando
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

  return (
    <div className="space-y-6 font-[Montserrat] animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-[#213368]">Equipamentos</h2>
          <p className="text-xs text-muted-foreground">Frota, empréstimos, manutenções e rentabilidade.</p>
        </div>
        <Button onClick={abrirNovo} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
          <Plus className="mr-1 h-4 w-4" /> Novo equipamento
        </Button>
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
              {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Cards de equipamentos */}
      {filtrados.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">Nenhum equipamento encontrado.</Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtrados.map(e => {
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
          })}
        </div>
      )}

      {/* Diálogo Novo */}
      <Dialog open={openEq} onOpenChange={(v) => { setOpenEq(v); if (!v) setEditId(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editId ? "Editar equipamento" : "Novo equipamento"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2"><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
            <div><Label>Código / patrimônio *</Label><Input value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} /></div>
            <div><Label>Categoria *</Label><Input value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} placeholder="Ex.: Energia, Transporte" /></div>
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
