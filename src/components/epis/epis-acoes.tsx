// ============================================================
// Ações compartilhadas pelas abas de EPIs
// ------------------------------------------------------------
// Quando as quatro abas viraram rotas, três coisas ficaram sem dono:
// os diálogos de entrega e compra (abertos tanto pelo cabeçalho quanto
// de dentro das abas), e a confirmação de exclusão, que era um
// AlertDialog só atendendo os quatro tipos de registro.
//
// Nada disso pertence a uma aba: o layout provê, e cada rota pede.
// Em especial o "Entregar EPI" da aba Funcionários, que abre a entrega
// já com o funcionário escolhido — a única dependência cruzada real
// que existia entre as abas.
// ============================================================
import { useMemo, useState, type ReactNode } from "react";
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
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExclusao} className="bg-red-600 hover:bg-red-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </EpisAcoesCtx.Provider>
  );
}
