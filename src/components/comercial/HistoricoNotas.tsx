// ============================================================
// Histórico de notas do orçamento
// ------------------------------------------------------------
// Ordem cronológica decrescente, com data/hora, autor, texto e —
// quando houve — a transição de status.
//
// Nota gravada é registro: só o próprio autor edita, e só na
// primeira hora. A RLS é quem garante isso; a interface apenas
// esconde o botão quando já não adianta.
// ============================================================
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, X } from "lucide-react";
import { toast } from "sonner";
import {
  listarNotas, inserirNotaAvulsa, editarNota, podeEditar, notaValida, NOTA_MIN_CARACTERES,
  type OrcamentoNota,
} from "@/lib/orcamento-notas";
import { useCurrentUser } from "@/lib/current-user";

export function HistoricoNotas({ orcamentoId, recarregarEm }: {
  orcamentoId: string;
  /** Muda quando algo externo grava nota (ex.: mudança de status). */
  recarregarEm?: number;
}) {
  const usuario = useCurrentUser();
  const [notas, setNotas] = useState<OrcamentoNota[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [nova, setNova] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [textoEdicao, setTextoEdicao] = useState("");

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    void (async () => {
      const { notas: lista, error } = await listarNotas(orcamentoId);
      if (!ativo) return;
      if (error) toast.error(`Erro ao carregar notas: ${error.message ?? ""}`);
      setNotas(lista);
      setCarregando(false);
    })();
    return () => { ativo = false; };
  }, [orcamentoId, recarregarEm]);

  async function salvarAvulsa() {
    if (!notaValida(nova) || salvando) return;
    setSalvando(true);
    const { nota, error } = await inserirNotaAvulsa(orcamentoId, nova, { id: usuario.id, nome: usuario.nome });
    setSalvando(false);
    if (error || !nota) { toast.error(`Erro ao salvar nota: ${error?.message ?? ""}`); return; }
    setNotas(prev => [nota, ...prev]);
    setNova("");
    toast.success("Nota adicionada.");
  }

  async function salvarEdicao(id: string) {
    if (!notaValida(textoEdicao)) return;
    const { nota, error } = await editarNota(id, textoEdicao);
    if (error || !nota) { toast.error(error?.message ?? "Não foi possível editar a nota."); return; }
    setNotas(prev => prev.map(n => n.id === id ? nota : n));
    setEditandoId(null);
    toast.success("Nota corrigida.");
  }

  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Histórico de notas
      </div>

      {/* Nota avulsa: registro de contato, follow-up — sem mudar status. */}
      <div className="mb-4 grid gap-2">
        <Textarea
          rows={2}
          value={nova}
          onChange={e => setNova(e.target.value)}
          placeholder="Registrar um contato ou follow-up, sem mudar o status..."
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            {nova.length === 0 ? `Mínimo de ${NOTA_MIN_CARACTERES} caracteres.` : notaValida(nova) ? "Pronto para salvar." : "Texto muito curto."}
          </span>
          <Button
            size="sm"
            disabled={!notaValida(nova) || salvando}
            onClick={() => void salvarAvulsa()}
            className="bg-[#213368] text-white hover:bg-[#213368]/90"
          >
            {salvando ? "Salvando..." : "Adicionar nota"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {carregando && <div className="text-xs text-muted-foreground">Carregando...</div>}
        {!carregando && notas.length === 0 && (
          <div className="text-xs text-muted-foreground">Nenhuma nota ainda.</div>
        )}
        {notas.map(n => {
          const editavel = podeEditar(n, usuario.id);
          const emEdicao = editandoId === n.id;
          return (
            <div key={n.id} className="rounded-md border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {new Date(n.criadaEm).toLocaleString("pt-BR")} · {n.autorNome || "—"}
                </span>
                {n.statusNovo && (
                  <span className="rounded-full bg-[#F37032] px-2 py-0.5 text-[10px] font-bold text-white">
                    STATUS
                  </span>
                )}
                {editavel && !emEdicao && (
                  <button
                    type="button"
                    onClick={() => { setEditandoId(n.id); setTextoEdicao(n.texto); }}
                    className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-[#213368] hover:text-[#F37032]"
                  >
                    <Pencil className="h-3 w-3" /> editar
                  </button>
                )}
              </div>

              {n.statusNovo && (
                <div className="mt-1 text-[11px] font-medium text-[#213368]">
                  De: {n.statusAnterior || "—"} → Para: {n.statusNovo}
                </div>
              )}

              {emEdicao ? (
                <div className="mt-2 grid gap-2">
                  <Textarea rows={3} value={textoEdicao} onChange={e => setTextoEdicao(e.target.value)} />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={!notaValida(textoEdicao)} onClick={() => void salvarEdicao(n.id)} className="bg-[#213368] text-white hover:bg-[#213368]/90">
                      Salvar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditandoId(null)}>
                      <X className="mr-1 h-3 w-3" /> Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-1 whitespace-pre-wrap text-sm">{n.texto}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
