// ============================================================
// Custos do orçamento — tabela editável inline
// ------------------------------------------------------------
// Uma linha por lançamento, salva individualmente. O subtotal
// exibido enquanto a pessoa digita é PRÉVIA; quem manda é o valor
// que volta do banco (coluna gerada), reconciliado depois de salvar.
//
// Erro de gravação nunca descarta o que foi digitado: a linha fica
// em estado de erro com os valores na tela, para a pessoa tentar de
// novo sem redigitar.
// ============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InputMoeda, InputNumero } from "@/components/ui/input-moeda";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Loader2, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { brl, pct } from "@/lib/formato";
import { useCurrentUser } from "@/lib/current-user";
import {
  listarCustos, criarCusto, atualizarCusto, excluirCusto,
  subtotalPrevisto, totalDosCustos, totaisPorCategoria, calcularMargem,
  rotulosDaCategoria, CATEGORIAS_CUSTO, CATEGORIA_LABEL, UNIDADE_PADRAO,
  type CategoriaCusto, type OrcamentoCusto, type LinhaSomavel,
} from "@/lib/orcamento-custos";

type Estado = "novo" | "limpo" | "sujo" | "salvando" | "salvo" | "erro";

type Linha = {
  /** Chave estável de render — não muda quando a linha ganha id do banco. */
  key: string;
  id: string | null;
  categoria: CategoriaCusto;
  descricao: string;
  unidade: string;
  quantidade: number | null;
  valorUnitario: number | null;
  ordem: number;
  estado: Estado;
  erro: string | null;
};

let seq = 0;
const novaKey = () => `linha-${++seq}`;

function linhaDe(c: OrcamentoCusto): Linha {
  return {
    key: novaKey(), id: c.id, categoria: c.categoria, descricao: c.descricao,
    unidade: c.unidade, quantidade: c.quantidade, valorUnitario: c.valorUnitario,
    ordem: c.ordem, estado: "limpo", erro: null,
  };
}

function linhaVazia(ordem: number): Linha {
  return {
    key: novaKey(), id: null, categoria: "MAO_DE_OBRA", descricao: "",
    unidade: UNIDADE_PADRAO.MAO_DE_OBRA, quantidade: null, valorUnitario: null,
    ordem, estado: "novo", erro: null,
  };
}

export function CustosOrcamento({ orcamentoId, valorVenda }: {
  orcamentoId: string;
  valorVenda: number;
}) {
  const usuario = useCurrentUser();
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [excluindo, setExcluindo] = useState<Linha | null>(null);
  // Evita salvar duas vezes a mesma linha quando blur e Enter disparam juntos.
  const salvando = useRef<Set<string>>(new Set());

  // `salvar` precisa do estado mais novo, não do que o closure capturou:
  // sem isso, digitar e sair do campo no mesmo tick gravaria o valor
  // anterior. Atribuído no corpo do render para estar sempre em dia.
  const linhasRef = useRef<Linha[]>(linhas);
  linhasRef.current = linhas;

  // Salvamento disparado por controle que não tem blur confiável (o Select
  // do Radix dispara blur ao abrir a lista). Guardar a chave e salvar num
  // efeito garante que a leitura aconteça depois do estado já ter mudado.
  const [aSalvar, setASalvar] = useState<string | null>(null);
  useEffect(() => {
    if (!aSalvar) return;
    setASalvar(null);
    void salvar(aSalvar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aSalvar]);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    void (async () => {
      const { custos, error } = await listarCustos(orcamentoId);
      if (!ativo) return;
      if (error) toast.error(`Erro ao carregar custos: ${error.message ?? ""}`);
      setLinhas(custos.map(linhaDe));
      setCarregando(false);
    })();
    return () => { ativo = false; };
  }, [orcamentoId]);

  function patch(key: string, p: Partial<Linha>) {
    setLinhas(ls => ls.map(l => l.key === key
      ? { ...l, ...p, estado: l.estado === "novo" ? "novo" : "sujo" }
      : l));
  }

  function trocarCategoria(key: string, categoria: CategoriaCusto) {
    setLinhas(ls => ls.map(l => {
      if (l.key !== key) return l;
      // A unidade acompanha a categoria só enquanto a pessoa não mexeu
      // nela — trocar de categoria não pode apagar uma unidade digitada.
      const unidadeEraPadrao = !l.unidade || l.unidade === UNIDADE_PADRAO[l.categoria];
      return {
        ...l,
        categoria,
        unidade: unidadeEraPadrao ? UNIDADE_PADRAO[categoria] : l.unidade,
        estado: l.estado === "novo" ? "novo" : "sujo",
      };
    }));
  }

  async function salvar(key: string) {
    const linha = linhasRef.current.find(l => l.key === key);
    if (!linha) return;
    if (linha.estado === "limpo" || linha.estado === "salvando") return;
    // Linha nova ainda em branco não vira lançamento — evita gravar lixo
    // quando a pessoa clica fora sem preencher nada.
    if (!linha.descricao.trim()) return;
    if (salvando.current.has(key)) return;
    salvando.current.add(key);

    setLinhas(ls => ls.map(l => l.key === key ? { ...l, estado: "salvando", erro: null } : l));

    const payload = {
      categoria: linha.categoria,
      descricao: linha.descricao,
      unidade: linha.unidade,
      quantidade: linha.quantidade ?? 0,
      valorUnitario: linha.valorUnitario ?? 0,
      ordem: linha.ordem,
    };

    const { custo, error } = linha.id
      ? await atualizarCusto(linha.id, payload)
      : await criarCusto(orcamentoId, payload, { id: usuario.id, nome: usuario.nome });

    salvando.current.delete(key);

    if (error || !custo) {
      // Os valores digitados PERMANECEM: só o estado muda.
      setLinhas(ls => ls.map(l => l.key === key
        ? { ...l, estado: "erro", erro: error?.message ?? "Não foi possível salvar." }
        : l));
      return;
    }

    // Reconciliação com o banco — inclusive o subtotal da coluna gerada.
    setLinhas(ls => ls.map(l => l.key === key
      ? {
          ...l, id: custo.id, categoria: custo.categoria, descricao: custo.descricao,
          unidade: custo.unidade, quantidade: custo.quantidade, valorUnitario: custo.valorUnitario,
          ordem: custo.ordem, estado: "salvo", erro: null,
        }
      : l));
  }

  function adicionar() {
    setLinhas(ls => [...ls, linhaVazia(ls.length)]);
  }

  async function confirmarExclusao() {
    const alvo = excluindo;
    if (!alvo) return;
    setExcluindo(null);
    if (!alvo.id) { setLinhas(ls => ls.filter(l => l.key !== alvo.key)); return; }
    const { error } = await excluirCusto(alvo.id);
    if (error) { toast.error(`Erro ao excluir: ${error.message ?? ""}`); return; }
    setLinhas(ls => ls.filter(l => l.key !== alvo.key));
    toast.success("Lançamento excluído.");
  }

  // Totais saem dos valores da tela para responderem enquanto a pessoa
  // digita. Depois de salvar eles coincidem com o banco, porque a linha
  // foi reconciliada com o que voltou de lá.
  const somaveis: LinhaSomavel[] = useMemo(
    () => linhas.map(l => ({
      categoria: l.categoria,
      subtotal: subtotalPrevisto(l.quantidade ?? 0, l.valorUnitario ?? 0),
    })),
    [linhas],
  );
  const total = totalDosCustos(somaveis);
  const porCategoria = totaisPorCategoria(somaveis);
  const margem = calcularMargem(valorVenda, total);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Custos</div>
        <Button size="sm" variant="outline" onClick={adicionar}>
          <Plus className="mr-1 h-3 w-3" /> Adicionar lançamento
        </Button>
      </div>

      {carregando ? (
        <div className="text-xs text-muted-foreground">Carregando...</div>
      ) : linhas.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
          Nenhum custo lançado. Use "Adicionar lançamento" para começar.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr className="text-left text-[#213368]">
                <th className="p-2 font-semibold">Categoria</th>
                <th className="p-2 font-semibold">Descrição</th>
                <th className="p-2 font-semibold">Un.</th>
                <th className="p-2 font-semibold">Qtd. / Diárias</th>
                <th className="p-2 font-semibold">Valor unitário</th>
                <th className="p-2 text-right font-semibold">Subtotal</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                const rot = rotulosDaCategoria(l.categoria);
                const sub = subtotalPrevisto(l.quantidade ?? 0, l.valorUnitario ?? 0);
                const ultima = i === linhas.length - 1;
                return (
                  <tr key={l.key} className="border-t align-top">
                    <td className="p-1">
                      <Select
                        value={l.categoria}
                        onValueChange={v => { trocarCategoria(l.key, v as CategoriaCusto); setASalvar(l.key); }}
                      >
                        <SelectTrigger className="h-8 w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIAS_CUSTO.map(c => (
                            <SelectItem key={c} value={c}>{CATEGORIA_LABEL[c]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-1">
                      <Input
                        className="h-8 min-w-[160px]"
                        value={l.descricao}
                        placeholder={l.categoria === "MAO_DE_OBRA" ? "Ex.: Pedreiro" : "Descrição"}
                        onChange={e => patch(l.key, { descricao: e.target.value })}
                        onBlur={() => void salvar(l.key)}
                      />
                    </td>
                    <td className="p-1">
                      <Input
                        className="h-8 w-20"
                        value={l.unidade}
                        onChange={e => patch(l.key, { unidade: e.target.value })}
                        onBlur={() => void salvar(l.key)}
                      />
                    </td>
                    <td className="p-1">
                      <InputNumero
                        className="h-8 w-24"
                        aria-label={rot.quantidade}
                        casas={3} casasMin={0}
                        valor={l.quantidade}
                        onChange={v => patch(l.key, { quantidade: v })}
                        onBlur={() => void salvar(l.key)}
                      />
                    </td>
                    <td className="p-1">
                      <InputMoeda
                        className="h-8 w-32"
                        aria-label={rot.valorUnitario}
                        valor={l.valorUnitario}
                        onChange={v => patch(l.key, { valorUnitario: v })}
                        onBlur={() => void salvar(l.key)}
                        onKeyDown={e => {
                          // Enter no último campo fecha a linha e abre a próxima.
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          void salvar(l.key);
                          if (ultima) adicionar();
                        }}
                      />
                    </td>
                    <td className="p-2 text-right font-semibold tabular-nums text-[#213368]">
                      {brl(sub)}
                    </td>
                    <td className="p-1">
                      <div className="flex items-center gap-1">
                        <EstadoLinha estado={l.estado} />
                        <Button
                          type="button" size="icon" variant="ghost"
                          onClick={() => setExcluindo(l)}
                          aria-label="Excluir lançamento"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {linhas.some(l => l.erro) && (
                <tr className="border-t bg-red-50">
                  <td colSpan={7} className="p-2 text-[11px] text-red-700">
                    {linhas.filter(l => l.erro).map(l => (
                      <div key={l.key}>
                        <b>{l.descricao || "Linha sem descrição"}:</b> {l.erro} — o que você digitou continua aí, é só tentar de novo.
                      </div>
                    ))}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Rodapé de totais */}
      <div className="mt-3 rounded-md border bg-muted/30 p-3">
        {porCategoria.length > 0 && (
          <div className="mb-2 space-y-1">
            {porCategoria.map(c => (
              <div key={c.categoria} className="flex justify-between text-xs text-muted-foreground">
                <span>{CATEGORIA_LABEL[c.categoria]}</span>
                <span className="tabular-nums">{brl(c.total)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-between border-t pt-2 text-sm font-bold text-[#213368]">
          <span>TOTAL GERAL DE CUSTOS</span>
          <span className="tabular-nums">{brl(total)}</span>
        </div>
        <div className={`mt-2 flex justify-between border-t pt-2 text-xs font-semibold ${margem.negativa ? "text-red-600" : "text-green-700"}`}>
          <span>
            Margem {margem.negativa && "— custo acima do valor de venda"}
          </span>
          <span className="tabular-nums">
            {brl(margem.valor)}{margem.pct !== null && ` · ${pct(margem.pct)}`}
          </span>
        </div>
        <div className="mt-1 text-right text-[10px] text-muted-foreground">
          Valor de venda: {brl(valorVenda)}
        </div>
      </div>

      <AlertDialog open={!!excluindo} onOpenChange={o => !o && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              <b>{excluindo?.descricao || "Linha sem descrição"}</b> — subtotal{" "}
              <b>{brl(subtotalPrevisto(excluindo?.quantidade ?? 0, excluindo?.valorUnitario ?? 0))}</b>.
              O total do orçamento é recalculado na hora.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmarExclusao()} className="bg-red-600 hover:bg-red-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EstadoLinha({ estado }: { estado: Estado }) {
  if (estado === "salvando") return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-label="Salvando" />;
  if (estado === "salvo") return <Check className="h-3 w-3 text-green-600" aria-label="Salvo" />;
  if (estado === "erro") return <AlertCircle className="h-3 w-3 text-red-600" aria-label="Erro ao salvar" />;
  if (estado === "sujo" || estado === "novo") return <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="Não salvo" />;
  return <span className="h-3 w-3" />;
}
