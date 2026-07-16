import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/mock-data";
import {
  useEquipStore, equipActions, periodos,
  type UnidadePeriodo,
} from "@/lib/equipamentos-store";

const UNIDADES: UnidadePeriodo[] = ["dia", "semana", "mês"];

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
  const [inicio, setInicio] = useState(new Date().toISOString().slice(0, 10));
  const [fim, setFim] = useState("");
  const [custo, setCusto] = useState<string>("");
  const [unidade, setUnidade] = useState<UnidadePeriodo>("dia");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  // Ao abrir, pré-preenche custo/unidade do cadastro do equipamento
  useEffect(() => {
    if (!open) return;
    setDestino("");
    setResponsavel("");
    setInicio(new Date().toISOString().slice(0, 10));
    setFim("");
    setObs("");
    setSaving(false);
    if (eq) {
      setCusto(String(eq.custoPeriodo || ""));
      setUnidade(eq.unidade ?? "dia");
    } else {
      setCusto("");
      setUnidade("dia");
    }
  }, [open, eq?.id]);

  const custoNum = Number(String(custo).replace(",", ".")) || 0;
  const p = periodos(inicio, fim, unidade);
  const total = p * custoNum;

  const salvar = async () => {
    if (saving) return;
    if (!eq) return toast.error("Equipamento não encontrado");
    if (!destino.trim()) return toast.error("Informe o destino/obra");
    if (!responsavel.trim()) return toast.error("Informe o responsável");
    if (!inicio || !fim) return toast.error("Informe as datas de saída e devolução");
    if (custoNum <= 0) return toast.error("Informe o custo por período");

    setSaving(true);
    const idSalvo = await equipActions.registrarEmprestimo({
      equipamentoId,
      destino: destino.trim(),
      responsavel: responsavel.trim(),
      dataInicio: inicio,
      dataDevolucaoPrevista: fim,
      custoPeriodo: custoNum,
      unidade,
      observacoes: obs.trim() || undefined,
    });
    setSaving(false);
    if (!idSalvo) return;

    toast.success("Empréstimo registrado");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#213368]">
            <PackageOpen className="h-5 w-5 text-[#F37032]" />
            Registrar empréstimo {eq ? `— ${eq.nome}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Destino / Obra *</Label>
            <Input value={destino} onChange={e => setDestino(e.target.value)} placeholder="Ex.: Obra Centro" />
          </div>
          <div className="md:col-span-2">
            <Label>Responsável *</Label>
            <Input value={responsavel} onChange={e => setResponsavel(e.target.value)} placeholder="Nome do responsável" />
          </div>
          <div>
            <Label>Data de início *</Label>
            <Input type="date" value={inicio} onChange={e => setInicio(e.target.value)} />
          </div>
          <div>
            <Label>Devolução prevista *</Label>
            <Input type="date" value={fim} onChange={e => setFim(e.target.value)} />
          </div>
          <div>
            <Label>Custo por período (R$) *</Label>
            <Input inputMode="decimal" value={custo} onChange={e => setCusto(e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <Label>Unidade</Label>
            <Select value={unidade} onValueChange={v => setUnidade(v as UnidadePeriodo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {UNIDADES.map(u => <SelectItem key={u} value={u}>por {u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Observações</Label>
            <Textarea rows={2} value={obs} onChange={e => setObs(e.target.value)} />
          </div>

          <div className="md:col-span-2 rounded-lg bg-[#F4F4F4] p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Períodos ({unidade})</span>
              <b>{p}</b>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Custo total previsto</span>
              <b className="text-[#F37032]">{brl(total)}</b>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving} className="bg-[#213368] text-white hover:bg-[#2a4185]">
            {saving ? "Salvando…" : "Salvar empréstimo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
