// ============================================================
// /app/epis — Módulo de EPIs (Segurança do Trabalho)
// Abas: Entregas · Catálogo de EPIs · Funcionários
// Integrado ao Supabase via epis-store.
// ============================================================
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  HardHat, Plus, Pencil, Trash2, FileText, Users, ShieldCheck,
  AlertTriangle, CheckCircle2, PackageCheck, Upload, Image as ImageIcon, ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useEpiStore, epiActions, diasParaVencer,
  type Funcionario, type Epi,
} from "@/lib/epis-store";
import { EntregaEpiDialog } from "@/components/epis/EntregaEpiDialog";
import { brl, inteiro } from "@/lib/formato";
import { InputNumero } from "@/components/ui/input-moeda";
import { CompraEpiDialog } from "@/components/epis/CompraEpiDialog";
import { gerarTermoEpiPDF, type TermoEpiData } from "@/lib/termo-epi-pdf";

export const Route = createFileRoute("/app/epis")({
  component: EpisPage,
  errorComponent: ({ reset }: { error: Error; reset: () => void }) => (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-extrabold text-[#213368]">EPIs</h1>
      <p className="text-sm text-muted-foreground">Não foi possível carregar os dados agora. Tente novamente.</p>
      <button onClick={() => reset()} className="rounded-md bg-[#213368] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2a4185]">
        Tentar novamente
      </button>
    </div>
  ),
});

function fmtBr(iso?: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
function maskCpf(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

// ============================================================
function EpisPage() {
  const funcionarios = useEpiStore(s => s.funcionarios);
  const epis = useEpiStore(s => s.epis);
  const entregas = useEpiStore(s => s.entregas);
  const itens = useEpiStore(s => s.itens);
  const compras = useEpiStore(s => s.compras);
  const compraItens = useEpiStore(s => s.compraItens);

  const [entregaOpen, setEntregaOpen] = useState(false);
  const [entregaFuncInicial, setEntregaFuncInicial] = useState<string | undefined>(undefined);
  const [compraOpen, setCompraOpen] = useState(false);

  const [epiForm, setEpiForm] = useState<Epi | "novo" | null>(null);
  const [funcForm, setFuncForm] = useState<Funcionario | "novo" | null>(null);
  const [confirmar, setConfirmar] = useState<{ kind: "epi" | "func" | "entrega" | "compra"; id: string; label: string } | null>(null);

  // Métricas
  const itensVencendo = useMemo(
    () => itens.filter(i => {
      const d = diasParaVencer(i.dataValidade);
      return d !== null && d <= 30;
    }),
    [itens],
  );
  const pendentesAssinatura = entregas.filter(e => !e.assinado).length;

  const abrirEntregaPara = (funcId?: string) => {
    setEntregaFuncInicial(funcId);
    setEntregaOpen(true);
  };

  const regenerarTermo = async (entregaId: string) => {
    const ent = entregas.find(e => e.id === entregaId);
    if (!ent) return;
    const func = funcionarios.find(f => f.id === ent.funcionarioId);
    const its = itens.filter(i => i.entregaId === entregaId);
    const termo: TermoEpiData = {
      numero: ent.numeroTermo,
      emissao: ent.dataEntrega,
      funcionario: {
        nome: func?.nome ?? "",
        cpf: func?.cpf, rg: func?.rg, cargo: func?.cargo, setor: func?.setor,
        matricula: func?.matricula, dataAdmissao: func?.dataAdmissao,
      },
      // Tudo vem do snapshot do item, não do catálogo: o termo antigo mostra
      // o que foi entregue mesmo que o EPI tenha mudado ou sido excluído.
      itens: its.map(i => ({
        epiNome: i.epiNome, ca: i.ca, fabricante: i.fabricante, unidade: i.unidade,
        fotoUrl: i.epiFotoUrl, quantidade: i.quantidade, motivo: i.motivo,
        dataEntrega: i.dataEntrega, dataValidade: i.dataValidade,
      })),
      responsavelEntrega: ent.responsavelEntrega,
      responsavelCargo: ent.responsavelCargo,
      observacoes: ent.observacoes,
    };
    try { await gerarTermoEpiPDF(termo); }
    catch (err) { toast.error(`Falha ao gerar PDF: ${err instanceof Error ? err.message : "desconhecido"}`); }
  };

  const confirmarExclusao = async () => {
    if (!confirmar) return;
    if (confirmar.kind === "epi") await epiActions.excluirEpi(confirmar.id);
    if (confirmar.kind === "func") await epiActions.excluirFuncionario(confirmar.id);
    if (confirmar.kind === "entrega") await epiActions.excluirEntrega(confirmar.id);
    if (confirmar.kind === "compra") await epiActions.excluirCompra(confirmar.id);
    toast.success("Registro excluído.");
    setConfirmar(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-extrabold text-[#213368]">
            <HardHat className="h-6 w-6 text-[#F37032]" /> EPIs — Segurança do Trabalho
          </h2>
          <p className="text-xs text-muted-foreground">Cadastro de EPIs e funcionários, entregas com validade e termo de responsabilidade (NR-6).</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCompraOpen(true)} className="border-[#213368] text-[#213368]">
            <ShoppingCart className="mr-1 h-4 w-4" /> Lançar compra
          </Button>
          <Button onClick={() => abrirEntregaPara(undefined)} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
            <PackageCheck className="mr-1 h-4 w-4" /> Nova entrega
          </Button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ResumoCard icon={<Users className="h-5 w-5" />} label="Funcionários" valor={funcionarios.length} />
        <ResumoCard icon={<ShieldCheck className="h-5 w-5" />} label="EPIs no catálogo" valor={epis.length} />
        <ResumoCard icon={<FileText className="h-5 w-5" />} label="Entregas / termos" valor={entregas.length} sub={pendentesAssinatura ? `${pendentesAssinatura} a assinar` : "todos assinados"} />
        <ResumoCard icon={<AlertTriangle className="h-5 w-5" />} label="EPIs vencendo (30d)" valor={itensVencendo.length} destaque={itensVencendo.length > 0} />
      </div>

      <Tabs defaultValue="entregas" className="w-full">
        <TabsList>
          <TabsTrigger value="entregas">Entregas</TabsTrigger>
          <TabsTrigger value="compras">Compras</TabsTrigger>
          <TabsTrigger value="epis">Catálogo de EPIs</TabsTrigger>
          <TabsTrigger value="funcionarios">Funcionários</TabsTrigger>
        </TabsList>

        {/* ---------------- ENTREGAS ---------------- */}
        <TabsContent value="entregas">
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#213368]">Entregas de EPI</h3>
              <Button size="sm" onClick={() => abrirEntregaPara(undefined)} className="bg-[#213368] text-white hover:bg-[#2a4185]">
                <Plus className="mr-1 h-4 w-4" /> Nova entrega
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Termo</TableHead>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-center">Itens</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entregas.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Nenhuma entrega registrada.</TableCell></TableRow>
                ) : entregas.map(e => {
                  const func = funcionarios.find(f => f.id === e.funcionarioId);
                  const qtd = itens.filter(i => i.entregaId === e.id).reduce((a, i) => a + i.quantidade, 0);
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-semibold text-[#213368]">{e.numeroTermo || "—"}</TableCell>
                      <TableCell>{func?.nome ?? "—"}</TableCell>
                      <TableCell>{fmtBr(e.dataEntrega)}</TableCell>
                      <TableCell className="text-center">{inteiro(qtd)}</TableCell>
                      <TableCell>
                        {e.assinado
                          ? <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="mr-1 h-3 w-3" /> Assinado</Badge>
                          : <Badge className="bg-amber-100 text-amber-700">Pendente</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" title="Gerar/baixar termo (PDF)" onClick={() => regenerarTermo(e.id)}>
                            <FileText className="h-4 w-4 text-[#213368]" />
                          </Button>
                          <Button size="icon" variant="ghost" title={e.assinado ? "Marcar como pendente" : "Marcar como assinado"} onClick={() => epiActions.marcarAssinado(e.id, !e.assinado)}>
                            <CheckCircle2 className={`h-4 w-4 ${e.assinado ? "text-green-600" : "text-muted-foreground"}`} />
                          </Button>
                          <Button size="icon" variant="ghost" title="Excluir" onClick={() => setConfirmar({ kind: "entrega", id: e.id, label: `termo ${e.numeroTermo}` })}>
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {itensVencendo.length > 0 && (
            <Card className="mt-4 p-6">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-[#213368]">
                <AlertTriangle className="h-5 w-5 text-[#F37032]" /> EPIs vencendo ou vencidos
              </h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funcionário</TableHead>
                    <TableHead>EPI</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itensVencendo
                    .slice()
                    .sort((a, b) => (a.dataValidade ?? "").localeCompare(b.dataValidade ?? ""))
                    .map(i => {
                      const ent = entregas.find(e => e.id === i.entregaId);
                      const func = funcionarios.find(f => f.id === ent?.funcionarioId);
                      const d = diasParaVencer(i.dataValidade);
                      return (
                        <TableRow key={i.id}>
                          <TableCell>{func?.nome ?? "—"}</TableCell>
                          <TableCell>{i.epiNome}{i.ca ? ` (CA ${i.ca})` : ""}</TableCell>
                          <TableCell>{fmtBr(i.dataValidade)}</TableCell>
                          <TableCell>
                            {d !== null && d < 0
                              ? <Badge className="bg-red-100 text-red-700">Vencido há {Math.abs(d)}d</Badge>
                              : <Badge className="bg-amber-100 text-amber-700">Vence em {d}d</Badge>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* ---------------- COMPRAS (entrada de estoque) ---------------- */}
        <TabsContent value="compras">
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-[#213368]">Compras de EPI</h3>
                <p className="text-xs text-muted-foreground">Entrada de estoque. Cada compra soma as quantidades ao catálogo.</p>
              </div>
              <Button size="sm" onClick={() => setCompraOpen(true)} className="bg-[#213368] text-white hover:bg-[#2a4185]">
                <Plus className="mr-1 h-4 w-4" /> Nova compra
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Nº da nota</TableHead>
                  <TableHead className="text-center">Itens</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {compras.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Nenhuma compra lançada.</TableCell></TableRow>
                ) : compras.map(c => {
                  const its = compraItens.filter(i => i.compraId === c.id);
                  const qtd = its.reduce((a, i) => a + i.quantidade, 0);
                  const total = its.reduce((a, i) => a + i.quantidade * i.valorUnitario, 0);
                  return (
                    <TableRow key={c.id}>
                      <TableCell>{fmtBr(c.dataCompra)}</TableCell>
                      <TableCell className="font-semibold">{c.fornecedorNome || "—"}</TableCell>
                      <TableCell>{c.numeroNota || "—"}</TableCell>
                      <TableCell className="text-center">{inteiro(qtd)}</TableCell>
                      <TableCell className="text-right">{brl(total)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" title="Excluir compra (devolve o estoque)" onClick={() => setConfirmar({ kind: "compra", id: c.id, label: `compra de ${fmtBr(c.dataCompra)}` })}>
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ---------------- CATÁLOGO DE EPIS ---------------- */}
        <TabsContent value="epis">
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#213368]">Catálogo de EPIs</h3>
              <Button size="sm" onClick={() => setEpiForm("novo")} className="bg-[#213368] text-white hover:bg-[#2a4185]">
                <Plus className="mr-1 h-4 w-4" /> Novo EPI
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Foto</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>C.A.</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-center">Validade</TableHead>
                  <TableHead className="text-center">Estoque</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {epis.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Nenhum EPI cadastrado.</TableCell></TableRow>
                ) : epis.map(e => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-[#e6e6ea] bg-[#F4F4F4]">
                        {e.fotoUrl
                          ? <img src={e.fotoUrl} alt={e.nome} className="h-full w-full object-contain" />
                          : <ImageIcon className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold">{e.nome}</TableCell>
                    <TableCell>{e.ca || "—"}</TableCell>
                    <TableCell>{e.categoria || "—"}</TableCell>
                    <TableCell className="text-center">{e.validadeDias > 0 ? `${e.validadeDias} dias` : "—"}</TableCell>
                    <TableCell className="text-center">{inteiro(e.estoque)} {e.unidade}</TableCell>
                    <TableCell>{e.ativo ? <Badge className="bg-green-100 text-green-700">Ativo</Badge> : <Badge className="bg-gray-100 text-gray-500">Inativo</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setEpiForm(e)}><Pencil className="h-4 w-4 text-[#213368]" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setConfirmar({ kind: "epi", id: e.id, label: e.nome })}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ---------------- FUNCIONÁRIOS ---------------- */}
        <TabsContent value="funcionarios">
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#213368]">Funcionários</h3>
              <Button size="sm" onClick={() => setFuncForm("novo")} className="bg-[#213368] text-white hover:bg-[#2a4185]">
                <Plus className="mr-1 h-4 w-4" /> Novo funcionário
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {funcionarios.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Nenhum funcionário cadastrado.</TableCell></TableRow>
                ) : funcionarios.map(f => (
                  <TableRow key={f.id}>
                    <TableCell className="font-semibold">{f.nome}</TableCell>
                    <TableCell>{f.cpf || "—"}</TableCell>
                    <TableCell>{f.cargo || "—"}</TableCell>
                    <TableCell>{f.setor || "—"}</TableCell>
                    <TableCell>{f.matricula || "—"}</TableCell>
                    <TableCell>{f.ativo ? <Badge className="bg-green-100 text-green-700">Ativo</Badge> : <Badge className="bg-gray-100 text-gray-500">Inativo</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" title="Entregar EPI" onClick={() => abrirEntregaPara(f.id)}><PackageCheck className="h-4 w-4 text-[#F37032]" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setFuncForm(f)}><Pencil className="h-4 w-4 text-[#213368]" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setConfirmar({ kind: "func", id: f.id, label: f.nome })}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Diálogos */}
      <EntregaEpiDialog open={entregaOpen} onOpenChange={setEntregaOpen} funcionarioIdInicial={entregaFuncInicial} />
      <CompraEpiDialog open={compraOpen} onOpenChange={setCompraOpen} />
      {epiForm && <EpiFormDialog epi={epiForm === "novo" ? null : epiForm} onClose={() => setEpiForm(null)} />}
      {funcForm && <FuncionarioFormDialog funcionario={funcForm === "novo" ? null : funcForm} onClose={() => setFuncForm(null)} />}

      <AlertDialog open={!!confirmar} onOpenChange={o => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {confirmar?.label}?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExclusao} className="bg-red-600 hover:bg-red-700">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
function ResumoCard({ icon, label, valor, sub, destaque }: { icon: React.ReactNode; label: string; valor: number; sub?: string; destaque?: boolean }) {
  return (
    <Card className={`flex items-center gap-3 p-4 ${destaque ? "border-[#F37032]" : ""}`}>
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${destaque ? "bg-[#F37032]/15 text-[#F37032]" : "bg-[#213368]/10 text-[#213368]"}`}>{icon}</div>
      <div>
        <div className="text-2xl font-extrabold text-[#213368]">{valor}</div>
        <div className="text-xs text-muted-foreground">{label}{sub ? ` · ${sub}` : ""}</div>
      </div>
    </Card>
  );
}

// ============================================================
// Formulário de EPI
// ============================================================
function EpiFormDialog({ epi, onClose }: { epi: Epi | null; onClose: () => void }) {
  const [form, setForm] = useState({
    nome: epi?.nome ?? "",
    ca: epi?.ca ?? "",
    categoria: epi?.categoria ?? "",
    descricao: epi?.descricao ?? "",
    fabricante: epi?.fabricante ?? "",
    validadeDias: epi ? epi.validadeDias : null as number | null,
    caValidade: epi?.caValidade ?? "",
    estoque: epi ? epi.estoque : 0 as number | null,
    unidade: epi?.unidade ?? "un",
    fotoUrl: epi?.fotoUrl ?? "",
    ativo: epi?.ativo ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);

  // Mesmo padrão de upload do PortfolioAdmin: sobe para o Storage e guarda a
  // URL pública. Precisa ser pública porque o termo em PDF busca a imagem.
  const enviarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione um arquivo de imagem."); return; }
    setEnviandoFoto(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("epis").upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("epis").getPublicUrl(path);
      setForm(f => ({ ...f, fotoUrl: data.publicUrl }));
      toast.success("Foto enviada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no upload.");
    } finally {
      setEnviandoFoto(false);
      if (fotoRef.current) fotoRef.current.value = "";
    }
  };

  const salvar = async () => {
    if (!form.nome.trim()) return toast.error("Informe o nome do EPI");
    setSaving(true);
    const payload = {
      nome: form.nome.trim(),
      ca: form.ca.trim(),
      categoria: form.categoria.trim(),
      descricao: form.descricao.trim(),
      fabricante: form.fabricante.trim(),
      validadeDias: Math.max(0, form.validadeDias ?? 0),
      // String vazia (e não undefined) para que limpar a data realmente
      // grave null no banco — atualizarEpi ignora campos undefined.
      caValidade: form.caValidade,
      estoque: Math.max(0, form.estoque ?? 0),
      unidade: form.unidade.trim() || "un",
      fotoUrl: form.fotoUrl,
      ativo: form.ativo,
    };
    if (epi) await epiActions.atualizarEpi(epi.id, payload);
    else await epiActions.criarEpi(payload);
    toast.success(epi ? "EPI atualizado." : "EPI cadastrado.");
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#213368]">
            <ShieldCheck className="h-5 w-5 text-[#F37032]" /> {epi ? "Editar EPI" : "Novo EPI"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2"><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Capacete de segurança" /></div>
          <div><Label>Nº do C.A.</Label><Input value={form.ca} onChange={e => setForm({ ...form, ca: e.target.value })} placeholder="Certificado de Aprovação" /></div>
          <div><Label>Categoria</Label><Input value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} placeholder="Ex.: Proteção da cabeça" /></div>
          <div><Label>Fabricante</Label><Input value={form.fabricante} onChange={e => setForm({ ...form, fabricante: e.target.value })} /></div>
          <div><Label>Validade do C.A.</Label><Input type="date" value={form.caValidade} onChange={e => setForm({ ...form, caValidade: e.target.value })} /></div>
          <div><Label>Validade de uso (dias)</Label><InputNumero valor={form.validadeDias} onChange={v => setForm({ ...form, validadeDias: v })} casas={0} placeholder="Ex.: 180" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Estoque</Label><InputNumero valor={form.estoque} onChange={v => setForm({ ...form, estoque: v })} casas={0} /></div>
            <div><Label>Unidade</Label><Input value={form.unidade} onChange={e => setForm({ ...form, unidade: e.target.value })} placeholder="un / par / cx" /></div>
          </div>
          <div className="md:col-span-2"><Label>Descrição</Label><Textarea rows={2} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></div>

          <div className="md:col-span-2">
            <Label>Foto do EPI</Label>
            <div className="mt-1 flex items-center gap-3">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#e6e6ea] bg-[#F4F4F4]">
                {form.fotoUrl
                  ? <img src={form.fotoUrl} alt="Foto do EPI" className="h-full w-full object-contain" />
                  : <ImageIcon className="h-6 w-6 text-muted-foreground" />}
              </div>
              <div className="flex flex-col gap-2">
                <input ref={fotoRef} type="file" accept="image/*" className="hidden" onChange={enviarFoto} />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => fotoRef.current?.click()} disabled={enviandoFoto}>
                    <Upload className="mr-1 h-4 w-4" /> {enviandoFoto ? "Enviando…" : form.fotoUrl ? "Trocar foto" : "Enviar foto"}
                  </Button>
                  {form.fotoUrl && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, fotoUrl: "" })}>
                      <Trash2 className="mr-1 h-4 w-4 text-red-600" /> Remover
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">A foto aparece na tabela do termo de entrega.</p>
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            <Label>Situação</Label>
            <Select value={form.ativo ? "ativo" : "inativo"} onValueChange={v => setForm({ ...form, ativo: v === "ativo" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="ativo">Ativo</SelectItem><SelectItem value="inativo">Inativo</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving} className="bg-[#213368] text-white hover:bg-[#2a4185]">{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Formulário de Funcionário
// ============================================================
function FuncionarioFormDialog({ funcionario, onClose }: { funcionario: Funcionario | null; onClose: () => void }) {
  const [form, setForm] = useState({
    nome: funcionario?.nome ?? "",
    cpf: funcionario?.cpf ?? "",
    rg: funcionario?.rg ?? "",
    cargo: funcionario?.cargo ?? "",
    setor: funcionario?.setor ?? "",
    matricula: funcionario?.matricula ?? "",
    dataAdmissao: funcionario?.dataAdmissao ?? "",
    ativo: funcionario?.ativo ?? true,
    observacoes: funcionario?.observacoes ?? "",
  });
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (!form.nome.trim()) return toast.error("Informe o nome do funcionário");
    setSaving(true);
    const payload = {
      nome: form.nome.trim(),
      cpf: form.cpf.trim(),
      rg: form.rg.trim(),
      cargo: form.cargo.trim(),
      setor: form.setor.trim(),
      matricula: form.matricula.trim(),
      dataAdmissao: form.dataAdmissao || undefined,
      ativo: form.ativo,
      observacoes: form.observacoes.trim(),
    };
    if (funcionario) await epiActions.atualizarFuncionario(funcionario.id, payload);
    else await epiActions.criarFuncionario(payload);
    toast.success(funcionario ? "Funcionário atualizado." : "Funcionário cadastrado.");
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#213368]">
            <Users className="h-5 w-5 text-[#F37032]" /> {funcionario ? "Editar funcionário" : "Novo funcionário"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2"><Label>Nome completo *</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
          <div><Label>CPF</Label><Input value={form.cpf} onChange={e => setForm({ ...form, cpf: maskCpf(e.target.value) })} placeholder="000.000.000-00" /></div>
          <div><Label>RG</Label><Input value={form.rg} onChange={e => setForm({ ...form, rg: e.target.value })} /></div>
          <div><Label>Cargo / Função</Label><Input value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })} /></div>
          <div><Label>Setor</Label><Input value={form.setor} onChange={e => setForm({ ...form, setor: e.target.value })} /></div>
          <div><Label>Matrícula</Label><Input value={form.matricula} onChange={e => setForm({ ...form, matricula: e.target.value })} /></div>
          <div><Label>Data de admissão</Label><Input type="date" value={form.dataAdmissao} onChange={e => setForm({ ...form, dataAdmissao: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Observações</Label><Textarea rows={2} value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></div>
          <div className="md:col-span-2">
            <Label>Situação</Label>
            <Select value={form.ativo ? "ativo" : "inativo"} onValueChange={v => setForm({ ...form, ativo: v === "ativo" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="ativo">Ativo</SelectItem><SelectItem value="inativo">Inativo</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving} className="bg-[#213368] text-white hover:bg-[#2a4185]">{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
