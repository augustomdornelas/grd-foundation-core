// v4 — Modal completo de empréstimo + prévia de PDF (react-pdf via lazy)
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PackageOpen, FileText } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import {
  useEquipStore, equipActions, periodos,
  type UnidadePeriodo,
} from "@/lib/equipamentos-store";
import type { TermoEmprestimoData } from "@/lib/termo-emprestimo-pdf";

const TermoPreview = lazy(() => import("./TermoPreview"));

const UNIDADES: UnidadePeriodo[] = ["dia", "semana", "mês"];

type ClienteRow = {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  tipo: string | null;
};

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

  const [clientes, setClientes] = useState<ClienteRow[]>([]);
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
  const [preview, setPreview] = useState<TermoEmprestimoData | null>(null);

  // Carrega clientes ao abrir
  useEffect(() => {
    if (!open) return;
    void supabase
      .from("clientes")
      .select("id,nome,cpf_cnpj,tipo")
      .order("nome", { ascending: true })
      .then(({ data, error }) => {
        if (error) toast.error(`Falha ao carregar clientes: ${error.message}`);
        else setClientes((data ?? []) as ClienteRow[]);
      });
  }, [open]);

  // Reset ao abrir
  useEffect(() => {
    if (!open) return;
    setClienteId("");
    setDestino("");
    setResponsavel("");
    setCpf("");
    setRg("");
    setCargo("");
    setInicio(new Date().toISOString().slice(0, 10));
    setFim("");
    setObs("");
    setSaving(false);
    setPreview(null);
    if (eq) {
      setCusto(String(eq.custoPeriodo || ""));
      setUnidade(eq.unidade ?? "dia");
    } else {
      setCusto("");
      setUnidade("dia");
    }
  }, [open, eq?.id]);

  const cliente = useMemo(
    () => clientes.find(c => c.id === clienteId),
    [clientes, clienteId],
  );

  // Auto-preenche a partir do cliente selecionado
  useEffect(() => {
    if (!cliente) return;
    if (!responsavel) setResponsavel(cliente.nome ?? "");
    if (!cpf && cliente.cpf_cnpj) {
      const digits = cliente.cpf_cnpj.replace(/\D/g, "");
      if (digits.length === 11) setCpf(mascaraCpf(digits));
    }
    // "cargo" não existe na tabela clientes → deixa como está
  }, [cliente]); // eslint-disable-line react-hooks/exhaustive-deps

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
      clienteId: clienteId || undefined,
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
    setSaving(false);
    if (!idSalvo) return;

    toast.success("Empréstimo registrado.");
    const termo: TermoEmprestimoData = {
      numero: idSalvo,
      emissao: new Date().toISOString(),
      equipamento: {
        nome: eq.nome,
        codigo: eq.codigo,
        categoria: eq.categoria,
        valor: eq.valor,
      },
      cliente: cliente?.nome,
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
      observacoes: obs.trim() || undefined,
    };
    onOpenChange(false);
    setTimeout(() => setPreview(termo), 60);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[92vh] max-w-3xl overflow-y-auto"
          style={{ fontFamily: "Montserrat, ui-sans-serif, system-ui" }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#213368]">
              <PackageOpen className="h-5 w-5 text-[#F37032]" />
              Registrar empréstimo {eq ? `— ${eq.nome}` : ""}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Cliente</Label>
              <Select value={clienteId || "__none"} onValueChange={v => setClienteId(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione um cliente…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Sem cliente vinculado —</SelectItem>
                  {clientes.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}{c.cpf_cnpj ? ` · ${c.cpf_cnpj}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Label>Destino / Obra *</Label>
              <Input value={destino} onChange={e => setDestino(e.target.value)} placeholder="Ex.: Obra Centro" />
            </div>

            <div>
              <Label>Responsável *</Label>
              <Input value={responsavel} onChange={e => setResponsavel(e.target.value)} placeholder="Nome completo" />
            </div>
            <div>
              <Label>CPF</Label>
              <Input value={cpf} onChange={e => setCpf(mascaraCpf(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" />
            </div>
            <div>
              <Label>RG</Label>
              <Input value={rg} onChange={e => setRg(e.target.value)} placeholder="opcional" />
            </div>
            <div>
              <Label>Cargo / Função</Label>
              <Input value={cargo} onChange={e => setCargo(e.target.value)} placeholder="Ex.: Encarregado" />
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

            <div className="md:col-span-2 rounded-lg border border-[#213368]/10 bg-[#F4F4F4] p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Períodos ({unidade})</span>
                <b className="text-[#213368]">{p}</b>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">Custo total previsto</span>
                <b className="text-[#F37032]">{brl(total)}</b>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              onClick={salvar}
              disabled={saving}
              className="bg-[#213368] text-white hover:bg-[#2a4185]"
            >
              {saving ? "Salvando…" : "Salvar empréstimo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prévia do PDF */}
      <Dialog open={!!preview} onOpenChange={v => !v && setPreview(null)}>
        <DialogContent
          className="max-h-[95vh] max-w-5xl overflow-hidden p-0"
          style={{ fontFamily: "Montserrat, ui-sans-serif, system-ui" }}
        >
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="flex items-center gap-2 text-[#213368]">
              <FileText className="h-5 w-5 text-[#F37032]" />
              Prévia — Termo de Responsabilidade
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <ClientOnly
              fallback={
                <div className="flex h-[80vh] items-center justify-center text-sm text-muted-foreground">
                  Gerando PDF…
                </div>
              }
            >
              <Suspense
                fallback={
                  <div className="flex h-[80vh] items-center justify-center text-sm text-muted-foreground">
                    Gerando PDF…
                  </div>
                }
              >
                <TermoPreview t={preview} onClose={() => setPreview(null)} />
              </Suspense>
            </ClientOnly>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
