// ============================================================
// Diálogo de compra de EPIs (entrada de estoque).
// Lança vários EPIs de uma vez com quantidade e valor unitário.
// Cada linha pode escolher um EPI do catálogo ou cadastrar um
// novo na hora — é comum a nota trazer item que ainda não existe.
// Ao salvar, soma tudo ao estoque.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Plus, Trash2, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/lib/current-user";
import { useEpiStore, epiActions, type NovoCompraItemInput } from "@/lib/epis-store";

// Valor sentinela do Select para "cadastrar um EPI novo nesta linha".
const NOVO = "__novo__";

type Linha = {
  epiId: string;
  quantidade: string;
  valorUnitario: string;
  // Preenchidos só quando epiId === NOVO.
  novoNome: string;
  novoCa: string;
  novoFabricante: string;
  novoUnidade: string;
  novoValidadeDias: string;
};

function novaLinha(): Linha {
  return {
    epiId: "", quantidade: "1", valorUnitario: "",
    novoNome: "", novoCa: "", novoFabricante: "", novoUnidade: "un", novoValidadeDias: "",
  };
}

/**
 * Lê um valor digitado aceitando vírgula ou ponto como decimal — mesma
 * regra do `parseNumero` de app.projetos.$id.tsx: só trata o ponto como
 * separador de milhar quando existe vírgula, senão "12.50" viraria 1250.
 */
function paraNumero(texto: string): number {
  const limpo = texto.trim().replace(/\s/g, "");
  if (!limpo) return 0;
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  const n = Number(normalizado);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CompraEpiDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const user = useCurrentUser();
  const epis = useEpiStore(s => s.epis);
  const fornecedores = useEpiStore(s => s.fornecedores);

  const [fornecedorId, setFornecedorId] = useState("");
  const [fornecedorNovo, setFornecedorNovo] = useState("");
  const [numeroNota, setNumeroNota] = useState("");
  const [dataCompra, setDataCompra] = useState(new Date().toISOString().slice(0, 10));
  const [responsavel, setResponsavel] = useState("");
  const [obs, setObs] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([novaLinha()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFornecedorId("");
    setFornecedorNovo("");
    setNumeroNota("");
    setDataCompra(new Date().toISOString().slice(0, 10));
    setResponsavel(user.nome || "");
    setObs("");
    setLinhas([novaLinha()]);
    setSaving(false);
  }, [open, user.nome]);

  const episAtivos = useMemo(() => epis.filter(e => e.ativo), [epis]);
  const fornecedoresAtivos = useMemo(() => fornecedores.filter(f => f.ativo), [fornecedores]);

  const setLinha = (i: number, patch: Partial<Linha>) =>
    setLinhas(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const addLinha = () => setLinhas(prev => [...prev, novaLinha()]);
  const removeLinha = (i: number) =>
    setLinhas(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);

  const subtotal = (l: Linha) => Math.max(1, Number(l.quantidade) || 1) * paraNumero(l.valorUnitario);
  const total = linhas.reduce((a, l) => a + (l.epiId ? subtotal(l) : 0), 0);

  const salvar = async () => {
    if (saving) return;

    const itens: NovoCompraItemInput[] = [];
    for (const l of linhas) {
      if (!l.epiId) continue;
      const quantidade = Math.max(1, Number(l.quantidade) || 1);
      const valorUnitario = paraNumero(l.valorUnitario);
      if (l.epiId === NOVO) {
        if (!l.novoNome.trim()) { toast.error("Informe o nome do EPI novo"); return; }
        itens.push({
          novoEpi: {
            nome: l.novoNome.trim(),
            ca: l.novoCa.trim(),
            fabricante: l.novoFabricante.trim(),
            unidade: l.novoUnidade.trim() || "un",
            validadeDias: Math.max(0, Number(l.novoValidadeDias) || 0),
          },
          quantidade,
          valorUnitario,
        });
      } else {
        itens.push({ epiId: l.epiId, quantidade, valorUnitario });
      }
    }
    if (!itens.length) return toast.error("Adicione ao menos um EPI");
    if (!dataCompra) return toast.error("Informe a data da compra");

    setSaving(true);
    try {
      // Fornecedor digitado na hora vira cadastro antes de lançar a compra.
      let idFornecedor = fornecedorId === NOVO ? "" : fornecedorId;
      let nomeFornecedor =
        fornecedoresAtivos.find(f => f.id === idFornecedor)?.nome ?? "";
      if (fornecedorId === NOVO && fornecedorNovo.trim()) {
        const criado = await epiActions.criarFornecedor(fornecedorNovo);
        if (criado) { idFornecedor = criado; nomeFornecedor = fornecedorNovo.trim().toUpperCase(); }
        else { setSaving(false); return; }
      }

      const compra = await epiActions.registrarCompra({
        fornecedorId: idFornecedor || undefined,
        fornecedorNome: nomeFornecedor,
        numeroNota: numeroNota.trim(),
        dataCompra,
        responsavel: responsavel.trim(),
        observacoes: obs.trim(),
        itens,
      });
      if (!compra) { setSaving(false); return; }

      toast.success(
        itens.length === 1
          ? "Compra lançada — estoque atualizado."
          : `Compra lançada — ${itens.length} EPIs somados ao estoque.`,
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(`Erro ao lançar compra: ${err instanceof Error ? err.message : "desconhecido"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#213368]">
            <ShoppingCart className="h-5 w-5 text-[#F37032]" />
            Lançar compra de EPIs
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Fornecedor</Label>
            <Select value={fornecedorId} onValueChange={setFornecedorId}>
              <SelectTrigger><SelectValue placeholder="Selecionar fornecedor" /></SelectTrigger>
              <SelectContent>
                {fornecedoresAtivos.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                ))}
                <SelectItem value={NOVO}>+ Novo fornecedor…</SelectItem>
              </SelectContent>
            </Select>
            {fornecedorId === NOVO && (
              <Input
                className="mt-2"
                value={fornecedorNovo}
                onChange={e => setFornecedorNovo(e.target.value)}
                placeholder="Nome do fornecedor"
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nº da nota</Label>
              <Input value={numeroNota} onChange={e => setNumeroNota(e.target.value)} />
            </div>
            <div>
              <Label>Data da compra *</Label>
              <Input type="date" value={dataCompra} onChange={e => setDataCompra(e.target.value)} />
            </div>
          </div>
          <div className="md:col-span-2">
            <Label>Responsável</Label>
            <Input value={responsavel} onChange={e => setResponsavel(e.target.value)} />
          </div>
        </div>

        {/* Itens comprados */}
        <div className="mt-2 rounded-lg border border-[#e6e6ea] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-[#213368]">EPIs comprados</span>
            <Button type="button" size="sm" variant="outline" onClick={addLinha}>
              <Plus className="mr-1 h-4 w-4" /> Adicionar item
            </Button>
          </div>

          <div className="space-y-2">
            {linhas.map((l, i) => (
              <div key={i} className="rounded-md bg-[#F4F4F4] p-2">
                <div className="grid grid-cols-12 items-end gap-2">
                  <div className="col-span-12 md:col-span-5">
                    <Label className="text-xs">EPI</Label>
                    <Select value={l.epiId} onValueChange={v => setLinha(i, { epiId: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecionar EPI" /></SelectTrigger>
                      <SelectContent>
                        {episAtivos.map(e => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.nome}{e.ca ? ` (CA ${e.ca})` : ""}
                          </SelectItem>
                        ))}
                        <SelectItem value={NOVO}>+ Cadastrar EPI novo…</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3 md:col-span-2">
                    <Label className="text-xs">Qtd</Label>
                    <Input
                      inputMode="numeric"
                      value={l.quantidade}
                      onChange={e => setLinha(i, { quantidade: e.target.value.replace(/\D/g, "") })}
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <Label className="text-xs">Valor unit.</Label>
                    <Input
                      inputMode="decimal"
                      value={l.valorUnitario}
                      onChange={e => setLinha(i, { valorUnitario: e.target.value.replace(/[^\d.,]/g, "") })}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="col-span-3 md:col-span-2 text-xs text-muted-foreground">
                    <span className="block font-medium text-[#213368]">Subtotal</span>
                    {l.epiId ? brl(subtotal(l)) : "—"}
                  </div>
                  <div className="col-span-2 md:col-span-1 flex justify-end">
                    <Button type="button" size="icon" variant="ghost" onClick={() => removeLinha(i)} title="Remover">
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>

                {l.epiId === NOVO && (
                  <div className="mt-2 grid grid-cols-12 gap-2 rounded-md border border-dashed border-[#F37032]/50 bg-white p-2">
                    <div className="col-span-12 flex items-center gap-1 text-xs font-semibold text-[#F37032]">
                      <PackagePlus className="h-3.5 w-3.5" /> EPI novo — vai para o catálogo
                    </div>
                    <div className="col-span-12 md:col-span-5">
                      <Label className="text-xs">Nome *</Label>
                      <Input value={l.novoNome} onChange={e => setLinha(i, { novoNome: e.target.value })} placeholder="Ex.: Óculos de proteção" />
                    </div>
                    <div className="col-span-6 md:col-span-3">
                      <Label className="text-xs">Nº do C.A.</Label>
                      <Input value={l.novoCa} onChange={e => setLinha(i, { novoCa: e.target.value })} />
                    </div>
                    <div className="col-span-6 md:col-span-4">
                      <Label className="text-xs">Fabricante</Label>
                      <Input value={l.novoFabricante} onChange={e => setLinha(i, { novoFabricante: e.target.value })} />
                    </div>
                    <div className="col-span-6 md:col-span-3">
                      <Label className="text-xs">Unidade</Label>
                      <Input value={l.novoUnidade} onChange={e => setLinha(i, { novoUnidade: e.target.value })} placeholder="un / par / cx" />
                    </div>
                    <div className="col-span-6 md:col-span-4">
                      <Label className="text-xs">Validade de uso (dias)</Label>
                      <Input
                        inputMode="numeric"
                        value={l.novoValidadeDias}
                        onChange={e => setLinha(i, { novoValidadeDias: e.target.value.replace(/\D/g, "") })}
                        placeholder="Ex.: 180"
                      />
                    </div>
                    <p className="col-span-12 text-xs text-muted-foreground">
                      A foto pode ser adicionada depois, na aba “Catálogo de EPIs”.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex justify-end border-t border-[#e6e6ea] pt-2 text-sm">
            <span className="text-muted-foreground">Total da compra:&nbsp;</span>
            <span className="font-bold text-[#213368]">{brl(total)}</span>
          </div>
        </div>

        <div>
          <Label>Observações</Label>
          <Textarea rows={2} value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: reposição do almoxarifado." />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving} className="bg-[#213368] text-white hover:bg-[#2a4185]">
            {saving ? "Lançando…" : "Lançar e somar ao estoque"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
