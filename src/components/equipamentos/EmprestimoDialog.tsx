// v3
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import {
  useEquipStore, equipActions, periodos,
  type UnidadePeriodo,
} from "@/lib/equipamentos-store";
import { gerarTermoPDF, type TermoData } from "@/lib/termo-pdf";

const UNIDADES: UnidadePeriodo[] = ["dia", "semana", "mês"];

type ClienteOpt = {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  telefone: string | null;
  endereco: string | null;
};

function maskCpfCnpj(v: string) {
  const d = v.replace(/\D/g, "");
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
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

  const [clientes, setClientes] = useState<ClienteOpt[]>([]);
  const [clienteId, setClienteId] = useState<string>("");
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

  useEffect(() => {
    if (!open) return;
    setClienteId("");
    setDestino("");
    setResponsavel("");
    setCpf(""); setRg(""); setCargo("");
    setInicio(new Date().toISOString().slice(0, 10));
    setFim(""); setObs(""); setSaving(false);
    if (eq) {
      setCusto(String(eq.custoPeriodo || ""));
      setUnidade(eq.unidade ?? "dia");
    } else { setCusto(""); setUnidade("dia"); }
    supabase.from("clientes").select("id,nome,cpf_cnpj,telefone,endereco").eq("ativo", true).order("nome")
      .then(({ data, error }) => {
        if (error) { toast.error(`Erro ao carregar clientes: ${error.message}`); return; }
        setClientes((data ?? []) as ClienteOpt[]);
      });
  }, [open, eq?.id]);

  const onSelectCliente = (id: string) => {
    setClienteId(id);
    const c = clientes.find(x => x.id === id);
    if (c) {
      setResponsavel(c.nome);
      if (c.cpf_cnpj) setCpf(maskCpfCnpj(c.cpf_cnpj));
      if (c.endereco && !destino) setDestino(c.endereco);
    }
  };

  const custoNum = Number(String(custo).replace(",", ".")) || 0;
  const p = useMemo(() => periodos(inicio, fim, unidade), [inicio, fim, unidade]);
  const total = p * custoNum;

  const salvar = async () => {
    if (saving) return;
    if (!eq) return toast.error("Equipamento não encontrado");
    if (!destino.trim()) return toast.error("Informe o destino/obra");
    if (!responsavel.trim()) return toast.error("Informe o responsável");
    if (!inicio || !fim) return toast.error("Informe as datas de saída e devolução");
    if (custoNum <= 0) return toast.error("Informe o custo por período");

    setSaving(true);
    try {
      const idSalvo = await equipActions.registrarEmprestimo({
        equipamentoId,
        destino: destino.trim(),
        responsavel: responsavel.trim(),
        responsavelCpf: cpf.trim() || undefined,
        responsavelRg: rg.trim() || undefined,
        responsavelCargo: cargo.trim() || undefined,
        dataInicio: inicio,
        dataDevolucaoPrevista: fim,
        custoPeriodo: custoNum,
        unidade,
        observacoes: obs.trim() || undefined,
      });
      if (!idSalvo) { setSaving(false); return; }

      toast.success("Empréstimo registrado.");
      onOpenChange(false);

      try {
        const termo: TermoData = {
          tipo: "emprestimo",
          numero: idSalvo.slice(0, 8).toUpperCase(),
          emissao: new Date().toISOString().slice(0, 10),
          equipamento: { nome: eq.nome, codigo: eq.codigo, categoria: eq.categoria, descricao: eq.descricao },
          destino: destino.trim(),
          responsavel: responsavel.trim(),
          responsavelCpf: cpf.trim() || undefined,
          responsavelRg: rg.trim() || undefined,
          responsavelCargo: cargo.trim() || undefined,
          dataInicio: inicio,
          dataDevolucaoPrevista: fim,
          custoPeriodo: custoNum,
          unidade,
          custoTotalPrevisto: total,
          valorEquipamento: eq.valor,
          observacoes: obs,
        };
        await gerarTermoPDF(termo);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "erro desconhecido";
        toast.error(`Falha ao gerar PDF: ${msg}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "erro desconhecido";
      toast.error(`Erro ao registrar empréstimo: ${msg}`);
    } finally {
      setSaving(false);
    }
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
            <Label>Cliente</Label>
            <Select value={clienteId} onValueChange={onSelectCliente}>
              <SelectTrigger><SelectValue placeholder="Selecionar cliente cadastrado (opcional)" /></SelectTrigger>
              <SelectContent>
                {clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Destino / Obra *</Label>
            <Input value={destino} onChange={e => setDestino(e.target.value)} placeholder="Ex.: Obra Centro" />
          </div>
          <div>
            <Label>Responsável *</Label>
            <Input value={responsavel} onChange={e => setResponsavel(e.target.value)} />
          </div>
          <div>
            <Label>CPF</Label>
            <Input value={cpf} onChange={e => setCpf(maskCpfCnpj(e.target.value))} placeholder="000.000.000-00" />
          </div>
          <div>
            <Label>RG</Label>
            <Input value={rg} onChange={e => setRg(e.target.value)} />
          </div>
          <div>
            <Label>Cargo</Label>
            <Input value={cargo} onChange={e => setCargo(e.target.value)} />
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
