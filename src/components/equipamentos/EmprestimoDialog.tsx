import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/mock-data";
import {
  useEquipStore, equipActions, periodos,
  type UnidadePeriodo,
} from "@/lib/equipamentos-store";
import { gerarTermoPDF, type TermoData } from "@/lib/termo-pdf";

const UNIDADES: UnidadePeriodo[] = ["dia", "semana", "mês"];

function mascaraCpf(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function EmprestimoDialog({
  open,
  onOpenChange,
  equipamentoId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  equipamentoId: string;
}) {
  const eq = useEquipStore(s => s.equipamentos.find(e => e.id === equipamentoId));

  const [destino, setDestino] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [cpf, setCpf] = useState("");
  const [rg, setRg] = useState("");
  const [cargo, setCargo] = useState("");
  const [inicio, setInicio] = useState(new Date().toISOString().slice(0, 10));
  const [fim, setFim] = useState("");
  const [custo, setCusto] = useState<string>("");
  const [unidade, setUnidade] = useState<UnidadePeriodo>("dia");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [savedTermo, setSavedTermo] = useState<TermoData | null>(null);

  // Preencher custo/unidade do cadastro quando o equipamento carrega
  useEffect(() => {
    if (eq && open) {
      setCusto(prev => (prev === "" ? String(eq.custoPeriodo || "") : prev));
      setUnidade(prev => prev ?? eq.unidade);
    }
  }, [eq, open]);

  if (!eq) return null;

  const custoNum = Number(String(custo).replace(",", ".")) || 0;
  const p = periodos(inicio, fim, unidade);
  const total = p * custoNum;

  const reset = () => {
    setDestino(""); setResponsavel(""); setCpf(""); setRg(""); setCargo("");
    setFim(""); setObs("");
    setInicio(new Date().toISOString().slice(0, 10));
    setCusto(eq ? String(eq.custoPeriodo || "") : "");
    setUnidade(eq?.unidade ?? "dia");
    setPreview(false); setSavedTermo(null); setSaving(false);
  };

  const salvar = async () => {
    if (saving) return;
    if (!destino.trim()) return toast.error("Informe o destino/obra");
    if (!responsavel.trim()) return toast.error("Informe o nome completo do responsável");
    if (cpf.replace(/\D/g, "").length !== 11) return toast.error("CPF inválido");
    if (!inicio || !fim) return toast.error("Informe as datas de saída e devolução");

    setSaving(true);
    const idSalvo = await equipActions.registrarEmprestimo({
      equipamentoId,
      destino: destino.trim(),
      responsavel: responsavel.trim(),
      responsavelCpf: cpf.trim(),
      responsavelRg: rg.trim() || undefined,
      responsavelCargo: cargo.trim() || undefined,
      dataInicio: inicio,
      dataDevolucaoPrevista: fim,
      custoPeriodo: custoNum,
      unidade,
      observacoes: obs.trim() || undefined,
    });
    setSaving(false);
    if (!idSalvo) return;

    toast.success("Empréstimo registrado.");
    const termo: TermoData = {
      tipo: "emprestimo",
      numero: `EMP-${eq.codigo}-${Date.now().toString().slice(-6)}`,
      emissao: new Date().toISOString().slice(0, 10),
      equipamento: { nome: eq.nome, codigo: eq.codigo, categoria: eq.categoria, descricao: eq.descricao },
      destino: destino.trim(),
      responsavel: responsavel.trim(),
      responsavelCpf: cpf.trim(),
      responsavelRg: rg.trim() || undefined,
      responsavelCargo: cargo.trim() || undefined,
      dataInicio: inicio,
      dataDevolucaoPrevista: fim,
      custoPeriodo: custoNum,
      unidade,
      custoTotalPrevisto: total,
      valorEquipamento: eq.valor,
      observacoes: obs.trim() || undefined,
    };
    setSavedTermo(termo);
    setPreview(true);
  };

  const baixarPdf = async () => {
    if (!savedTermo) return;
    try {
      await gerarTermoPDF(savedTermo);
    } catch {
      toast.error("Falha ao gerar PDF do termo");
    }
  };

  return (
    <>
      <Dialog open={open && !preview} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#213368]">Registrar empréstimo — {eq.nome}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2"><Label>Destino / Obra *</Label><Input value={destino} onChange={e => setDestino(e.target.value)} /></div>
            <div><Label>Data de início *</Label><Input type="date" value={inicio} onChange={e => setInicio(e.target.value)} /></div>
            <div><Label>Devolução prevista *</Label><Input type="date" value={fim} onChange={e => setFim(e.target.value)} /></div>
            <div><Label>Custo por período (R$) *</Label><Input inputMode="decimal" value={custo} onChange={e => setCusto(e.target.value)} /></div>
            <div>
              <Label>Unidade</Label>
              <Select value={unidade} onValueChange={v => setUnidade(v as UnidadePeriodo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{UNIDADES.map(u => <SelectItem key={u} value={u}>por {u}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2 mt-2 text-xs font-bold uppercase tracking-wider text-[#F37032]">
              Dados para o termo de responsabilidade
            </div>
            <div className="md:col-span-2"><Label>Nome completo do responsável *</Label><Input value={responsavel} onChange={e => setResponsavel(e.target.value)} placeholder="Nome completo" /></div>
            <div><Label>CPF *</Label><Input value={cpf} onChange={e => setCpf(mascaraCpf(e.target.value))} placeholder="000.000.000-00" /></div>
            <div><Label>RG</Label><Input value={rg} onChange={e => setRg(e.target.value)} placeholder="Opcional" /></div>
            <div className="md:col-span-2"><Label>Cargo / função *</Label><Input value={cargo} onChange={e => setCargo(e.target.value)} placeholder="Ex.: Encarregado de obra" /></div>

            <div className="md:col-span-2"><Label>Observações</Label><Textarea rows={2} value={obs} onChange={e => setObs(e.target.value)} /></div>

            <div className="md:col-span-2 rounded-lg bg-[#F4F4F4] p-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Períodos ({unidade})</span><b>{p}</b></div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">Custo total previsto</span>
                <b className="text-[#F37032]">{brl(total)}</b>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving} className="bg-[#213368] text-white hover:bg-[#2a4185]">
              {saving ? "Salvando…" : "Salvar empréstimo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prévia com botão Baixar PDF */}
      <Dialog open={preview} onOpenChange={(v) => { if (!v) { setPreview(false); onOpenChange(false); reset(); } }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#213368]">Termo de Responsabilidade — Prévia</DialogTitle>
          </DialogHeader>
          {savedTermo && (
            <div className="grid gap-3 text-sm">
              <div className="grid gap-2 rounded-lg bg-[#F4F4F4] p-4 md:grid-cols-2">
                <div><b className="text-[#213368]">Equipamento:</b> {eq.nome} ({eq.codigo})</div>
                <div><b className="text-[#213368]">Categoria:</b> {eq.categoria}</div>
                <div><b className="text-[#213368]">Valor:</b> {brl(eq.valor)}</div>
                <div><b className="text-[#213368]">Destino:</b> {savedTermo.destino}</div>
                <div><b className="text-[#213368]">Saída:</b> {inicio.split("-").reverse().join("/")}</div>
                <div><b className="text-[#213368]">Devolução prev.:</b> {fim.split("-").reverse().join("/")}</div>
                <div><b className="text-[#213368]">Custo/{unidade}:</b> {brl(custoNum)}</div>
                <div><b className="text-[#213368]">Total previsto:</b> <span className="font-semibold text-[#F37032]">{brl(total)}</span></div>
              </div>
              <div className="rounded-lg border-2 border-[#213368]/20 p-4">
                <div className="text-xs font-bold uppercase tracking-wider text-[#F37032]">Responsável</div>
                <div className="mt-1 font-semibold">{savedTermo.responsavel}</div>
                <div className="text-xs text-muted-foreground">
                  CPF: {savedTermo.responsavelCpf}
                  {savedTermo.responsavelRg ? ` · RG: ${savedTermo.responsavelRg}` : ""}
                  {savedTermo.responsavelCargo ? ` · ${savedTermo.responsavelCargo}` : ""}
                </div>
              </div>
              {obs && (
                <div className="rounded-lg border p-3 text-xs">
                  <div className="font-bold uppercase text-muted-foreground">Observações</div>
                  <div>{obs}</div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setPreview(false); onOpenChange(false); reset(); }}>Fechar</Button>
            <Button onClick={baixarPdf} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
              <Download className="mr-1 h-4 w-4" /> Baixar Termo PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
