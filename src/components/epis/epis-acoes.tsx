// ============================================================
// Ações compartilhadas pelas abas de EPIs
// ------------------------------------------------------------
// Quando as quatro abas viraram rotas, três coisas ficaram sem dono:
// os diálogos de entrega e compra (abertos tanto pelo cabeçalho quanto
// de dentro das abas), e a confirmação de exclusão, que era um
// AlertDialog só atendendo os tipos de registro (EPI, compra). Entrega
// não se exclui: cancela, na própria aba Entregas.
//
// Nada disso pertence a uma aba: o layout provê, e cada rota pede.
// A aba Funcionários saiu (o cadastro agora é do menu Colaboradores);
// o funcionário pré-escolhido de abrirEntrega ficou para quem precisar
// abrir a entrega já apontando para alguém.
// ============================================================
import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EntregaEpiDialog } from "@/components/epis/EntregaEpiDialog";
import { CompraEpiDialog } from "@/components/epis/CompraEpiDialog";
import { epiActions } from "@/lib/epis-store";
import {
  EpisAcoesCtx,
  type AlvoExclusao,
  type EpisAcoes,
} from "@/components/epis/epis-acoes-contexto";

export function EpisAcoesProvider({ children }: { children: ReactNode }) {
  const [entregaOpen, setEntregaOpen] = useState(false);
  const [entregaFuncInicial, setEntregaFuncInicial] = useState<string | undefined>(undefined);
  const [compraOpen, setCompraOpen] = useState(false);
  const [confirmar, setConfirmar] = useState<AlvoExclusao | null>(null);

  const acoes = useMemo<EpisAcoes>(
    () => ({
      abrirEntrega: (funcionarioId?: string) => {
        setEntregaFuncInicial(funcionarioId);
        setEntregaOpen(true);
      },
      abrirCompra: () => setCompraOpen(true),
      pedirExclusao: (alvo: AlvoExclusao) => setConfirmar(alvo),
    }),
    [],
  );

  const [excluindo, setExcluindo] = useState(false);

  // Sucesso só com a confirmação do banco; senão, o erro real.
  const confirmarExclusao = async (ev: MouseEvent) => {
    ev.preventDefault(); // o AlertDialog fecharia antes do resultado
    if (!confirmar || excluindo) return;
    setExcluindo(true);
    const erro =
      confirmar.kind === "epi"
        ? await epiActions.excluirEpi(confirmar.id)
        : await epiActions.excluirCompra(confirmar.id);
    setExcluindo(false);
    if (erro) {
      toast.error(`Não foi possível excluir ${confirmar.label}: ${erro}`);
      return;
    }
    toast.success("Registro excluído.");
    setConfirmar(null);
  };

  return (
    <EpisAcoesCtx.Provider value={acoes}>
      {children}

      <EntregaEpiDialog
        open={entregaOpen}
        onOpenChange={setEntregaOpen}
        funcionarioIdInicial={entregaFuncInicial}
      />
      <CompraEpiDialog open={compraOpen} onOpenChange={setCompraOpen} />

      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {confirmar?.label}?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarExclusao}
              disabled={excluindo}
              className="bg-red-600 hover:bg-red-700"
            >
              {excluindo ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </EpisAcoesCtx.Provider>
  );
}
