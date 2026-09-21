// ============================================================
// Diálogo de entrega de EPIs.
// Permite escolher um ou vários funcionários, adicionar EPIs (com
// quantidade e motivo) e calcula a validade automaticamente. Ao
// salvar, registra uma entrega por funcionário — cada um com seu
// número de termo — e passa ao passo FOTO DE RECEBIMENTO: um
// colaborador por vez, e a foto de cada um assina o seu termo (NR-6).
// O PDF é baixado já com a foto, depois de salvo no Storage.
// ============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputNumero } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HardHat, Plus, Trash2, ShieldCheck, Search, Users, Camera, QrCode, ScanLine } from "lucide-react";
import { LeitorEpiQrDialog } from "@/components/epis/LeitorQrDialog";
import { toast } from "sonner";
import { useCurrentUser } from "@/lib/current-user";
import {
  useEpiStore, epiActions, somaDias,
  MOTIVOS_ENTREGA, type MotivoEntrega, type Epi,
} from "@/lib/epis-store";
import { dadosDoTermo } from "@/lib/termo-epi-assinatura";
import { FotoRecebimento, type TermoParaFoto } from "@/components/epis/FotoRecebimento";

// Quantidade inteira: EPI é entregue por peça (un/par/cx), então aqui
// casa decimal seria ruído — ao contrário de metragem e valor.
type Linha = { epiId: string; quantidade: number | null; motivo: MotivoEntrega };

function novaLinha(): Linha {
  return { epiId: "", quantidade: 1, motivo: "PRIMEIRA ENTREGA" };
}

function fmtBr(iso?: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function EntregaEpiDialog({
  open,
  onOpenChange,
  funcionarioIdInicial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  funcionarioIdInicial?: string;
}) {
  const user = useCurrentUser();
  const funcionarios = useEpiStore(s => s.funcionarios);
  const epis = useEpiStore(s => s.epis);

  const [funcionarioIds, setFuncionarioIds] = useState<string[]>([]);
  const [buscaFunc, setBuscaFunc] = useState("");
  const [dataEntrega, setDataEntrega] = useState(new Date().toISOString().slice(0, 10));
  const [responsavel, setResponsavel] = useState("");
  const [cargo, setCargo] = useState("");
  const [obs, setObs] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([novaLinha()]);
  const [saving, setSaving] = useState(false);
  // Depois de salvar: a fila de termos esperando foto. null = formulário.
  const [fila, setFila] = useState<TermoParaFoto[] | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFila(null);
    setEnviandoFoto(false);
    setFuncionarioIds(funcionarioIdInicial ? [funcionarioIdInicial] : []);
    setBuscaFunc("");
    setDataEntrega(new Date().toISOString().slice(0, 10));
    setResponsavel(user.nome || "");
    setCargo(user.perfil || "");
    setObs("");
    setLinhas([novaLinha()]);
    setSaving(false);
  }, [open, funcionarioIdInicial, user.nome, user.perfil]);

  const episAtivos = useMemo(() => epis.filter(e => e.ativo), [epis]);
  const funcionariosAtivos = useMemo(() => funcionarios.filter(f => f.ativo), [funcionarios]);
  const funcionariosFiltrados = useMemo(() => {
    const termo = buscaFunc.trim().toLowerCase();
    if (!termo) return funcionariosAtivos;
    return funcionariosAtivos.filter(f =>
      [f.nome, f.cargo, f.setor, f.matricula].some(v => (v || "").toLowerCase().includes(termo)),
    );
  }, [funcionariosAtivos, buscaFunc]);

  const toggleFuncionario = (id: string) =>
    setFuncionarioIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // Marca/desmarca apenas o que está visível no filtro atual.
  const todosVisiveisMarcados =
    funcionariosFiltrados.length > 0 && funcionariosFiltrados.every(f => funcionarioIds.includes(f.id));
  const alternarVisiveis = () =>
    setFuncionarioIds(prev => {
      const visiveis = funcionariosFiltrados.map(f => f.id);
      return todosVisiveisMarcados
        ? prev.filter(id => !visiveis.includes(id))
        : [...new Set([...prev, ...visiveis])];
    });

  const setLinha = (i: number, patch: Partial<Linha>) =>
    setLinhas(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const addLinha = () => setLinhas(prev => [...prev, novaLinha()]);

  // ---------- QR code das etiquetas ----------
  // null = fechado; número = "LER QR" daquela linha; "seq" = LER ETIQUETAS.
  const [leitorQr, setLeitorQr] = useState<number | "seq" | null>(null);
  const linhasRef = useRef(linhas);
  linhasRef.current = linhas;

  /** EPI lido com estoque zerado: avisa, mas deixa entregar (a contagem pode estar atrasada). */
  const avisarEstoque = (epi: Epi) => {
    if (epi.estoque <= 0) toast.warning(`${epi.nome}: estoque zerado no sistema. Confira antes de entregar.`);
  };
  const lerNaLinha = (i: number, epi: Epi) => {
    avisarEstoque(epi);
    setLinha(i, { epiId: epi.id });
  };
  /** Modo sequência: mesmo EPI soma 1; EPI novo ocupa a primeira linha vazia ou cria uma. */
  const lerEmSequencia = (epi: Epi) => {
    const jaTem = linhasRef.current.some(l => l.epiId === epi.id);
    if (!jaTem) avisarEstoque(epi);
    setLinhas(prev => {
      const i = prev.findIndex(l => l.epiId === epi.id);
      if (i >= 0) return prev.map((l, idx) => idx === i ? { ...l, quantidade: (l.quantidade ?? 0) + 1 } : l);
      const vazia = prev.findIndex(l => !l.epiId);
      if (vazia >= 0) return prev.map((l, idx) => idx === vazia ? { ...l, epiId: epi.id, quantidade: 1 } : l);
      return [...prev, { ...novaLinha(), epiId: epi.id, quantidade: 1 }];
    });
  };
  const removeLinha = (i: number) => setLinhas(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);

  const validadeDaLinha = (l: Linha): string => {
    const epi = epis.find(e => e.id === l.epiId);
    if (!epi || epi.validadeDias <= 0) return "";
    return somaDias(dataEntrega, epi.validadeDias);
  };

  const salvar = async () => {
    if (saving) return;
    if (!funcionarioIds.length) return toast.error("Selecione ao menos um funcionário");
    const itens = linhas
      .filter(l => l.epiId)
      .map(l => ({ epiId: l.epiId, quantidade: Math.max(1, l.quantidade ?? 1), motivo: l.motivo }));
    if (!itens.length) return toast.error("Adicione ao menos um EPI");
    if (!dataEntrega) return toast.error("Informe a data de entrega");

    setSaving(true);
    try {
      const salvas = await epiActions.registrarEntregaEmLote({
        funcionarioIds,
        dataEntrega,
        responsavelEntrega: responsavel.trim(),
        responsavelCargo: cargo.trim(),
        observacoes: obs.trim(),
        itens,
      });
      if (!salvas.length) { setSaving(false); return; }

      if (salvas.length < funcionarioIds.length) {
        toast.warning(`${salvas.length} de ${funcionarioIds.length} entregas registradas — veja os erros acima.`);
      }

      // Em vez de baixar o PDF direto, vai para a foto: o termo só é
      // assinado (e baixado) com a foto salva.
      setFila(salvas.map(s => ({
        entrega: s.entrega,
        termo: dadosDoTermo(s.entrega, s.funcionario, s.itens),
      })));
    } catch (err) {
      toast.error(`Erro ao registrar entrega: ${err instanceof Error ? err.message : "desconhecido"}`);
    } finally {
      setSaving(false);
    }
  };

  // Passo 2: foto de recebimento. Fechar o diálogo aqui deixa os termos
  // que faltam como PENDENTES — dá para fotografar depois pela lista.
  if (fila) {
    return (
      <Dialog open={open} onOpenChange={v => { if (!v && enviandoFoto) return; onOpenChange(v); }}>
        <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 uppercase text-[#213368]">
              <Camera className="h-5 w-5 text-[#F37032]" />
              Foto de recebimento
            </DialogTitle>
          </DialogHeader>
          <FotoRecebimento
            fila={fila}
            onFim={() => onOpenChange(false)}
            onOcupado={setEnviandoFoto}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#213368]">
            <HardHat className="h-5 w-5 text-[#F37032]" />
            Nova entrega de EPIs
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <div className="mb-1 flex items-center justify-between">
              <Label>
                Funcionários *
                {funcionarioIds.length > 0 && (
                  <span className="ml-2 font-normal text-[#F37032]">
                    {funcionarioIds.length} selecionado{funcionarioIds.length > 1 ? "s" : ""}
                  </span>
                )}
              </Label>
              {funcionariosFiltrados.length > 0 && (
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={alternarVisiveis}>
                  <Users className="mr-1 h-3.5 w-3.5" />
                  {todosVisiveisMarcados ? "Limpar seleção" : "Selecionar todos"}
                </Button>
              )}
            </div>

            <div className="rounded-lg border border-[#e6e6ea]">
              <div className="relative border-b border-[#e6e6ea]">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={buscaFunc}
                  onChange={e => setBuscaFunc(e.target.value)}
                  placeholder="Buscar por nome, cargo, setor ou matrícula…"
                  className="border-0 pl-9 focus-visible:ring-0"
                />
              </div>
              <div className="max-h-48 overflow-y-auto p-1">
                {funcionariosAtivos.length === 0 ? (
                  <p className="p-3 text-xs text-[#F37032]">
                    Nenhum colaborador ativo. O cadastro fica no menu Colaboradores.
                  </p>
                ) : funcionariosFiltrados.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">Nenhum funcionário encontrado.</p>
                ) : funcionariosFiltrados.map(f => (
                  <label
                    key={f.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[#F4F4F4]"
                  >
                    <Checkbox
                      checked={funcionarioIds.includes(f.id)}
                      onCheckedChange={() => toggleFuncionario(f.id)}
                    />
                    <span className="text-sm">
                      {f.nome}
                      {(f.cargo || f.setor) && (
                        <span className="text-muted-foreground">
                          {" — "}{[f.cargo, f.setor].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div>
            <Label>Data de entrega *</Label>
            <Input type="date" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Responsável (GRD)</Label>
              <Input value={responsavel} onChange={e => setResponsavel(e.target.value)} />
            </div>
            <div>
              <Label>Cargo</Label>
              <Input value={cargo} onChange={e => setCargo(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Lista de EPIs */}
        <div className="mt-2 rounded-lg border border-[#e6e6ea] p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-[#213368]">EPIs a entregar</span>
            <div className="flex flex-wrap gap-2">
              {/* Opcional: continua dando para escolher pela lista. */}
              <Button
                type="button"
                size="sm"
                onClick={() => setLeitorQr("seq")}
                className="bg-[#F37032] text-white hover:bg-[#ff8850]"
              >
                <ScanLine className="mr-1 h-4 w-4" /> Ler etiquetas
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={addLinha}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar EPI
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {linhas.map((l, i) => {
              const epi = epis.find(e => e.id === l.epiId);
              const validade = validadeDaLinha(l);
              return (
                <div key={i} className="grid grid-cols-12 items-end gap-2 rounded-md bg-[#F4F4F4] p-2">
                  <div className="col-span-12 md:col-span-5">
                    <Label className="text-xs">EPI</Label>
                    <div className="flex gap-1">
                      <Select value={l.epiId} onValueChange={v => setLinha(i, { epiId: v })}>
                        <SelectTrigger className="min-w-0 flex-1"><SelectValue placeholder="Selecionar EPI" /></SelectTrigger>
                        <SelectContent>
                          {episAtivos.map(e => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.nome}{e.ca ? ` (CA ${e.ca})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button" size="icon" variant="outline"
                        onClick={() => setLeitorQr(i)}
                        title="Ler QR da etiqueta" aria-label="Ler QR da etiqueta"
                        className="shrink-0"
                      >
                        <QrCode className="h-4 w-4 text-[#213368]" />
                      </Button>
                    </div>
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <Label className="text-xs">Qtd</Label>
                    <InputNumero
                      valor={l.quantidade}
                      onChange={v => setLinha(i, { quantidade: v })}
                      casas={0}
                    />
                  </div>
                  <div className="col-span-8 md:col-span-3">
                    <Label className="text-xs">Motivo</Label>
                    <Select value={l.motivo} onValueChange={v => setLinha(i, { motivo: v as MotivoEntrega })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MOTIVOS_ENTREGA.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-10 md:col-span-1 text-xs text-muted-foreground">
                    <span className="block font-medium text-[#213368]">Validade</span>
                    {validade ? fmtBr(validade) : (epi ? "sem validade" : "—")}
                  </div>
                  <div className="col-span-2 md:col-span-1 flex justify-end">
                    <Button type="button" size="icon" variant="ghost" onClick={() => removeLinha(i)} title="Remover">
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <Label>Observações</Label>
          <Textarea rows={2} value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: substituição por desgaste natural." />
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-[#eef3ff] p-3 text-xs text-[#213368]">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#213368]" />
          <span>
            {funcionarioIds.length > 1
              ? `Ao salvar, cada um dos ${funcionarioIds.length} funcionários recebe seu próprio Termo de Entrega de EPI (NR-6), com número individual. Em seguida, tire a foto de cada um recebendo os EPIs: a foto assina o termo, que fica salvo com o PDF.`
              : "Ao salvar, tire a foto do funcionário recebendo os EPIs: a foto assina o Termo de Entrega de EPI (NR-6), que fica salvo com o PDF."}
          </span>
        </div>

        <LeitorEpiQrDialog
          open={leitorQr !== null}
          onClose={() => setLeitorQr(null)}
          modo={leitorQr === "seq" ? "sequencia" : "unico"}
          onEpi={epi => {
            if (leitorQr === "seq") lerEmSequencia(epi);
            else if (typeof leitorQr === "number") lerNaLinha(leitorQr, epi);
          }}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving} className="bg-[#213368] text-white hover:bg-[#2a4185]">
            {saving
              ? "Salvando…"
              : funcionarioIds.length > 1 ? `Salvar e gerar ${funcionarioIds.length} termos` : "Salvar e gerar termo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
