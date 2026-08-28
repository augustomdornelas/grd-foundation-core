// ============================================================
// Casca genérica de tela de módulo
// ------------------------------------------------------------
// RhTela e PontoTela já fazem isto — esperar a sessão, mostrar o
// cadeado e desenhar o cabeçalho — cada uma amarrada ao seu módulo.
// Financeiro e Integrações seriam a terceira e a quarta cópia do mesmo
// bloco, então esta casca não conhece módulo nenhum: recebe o que
// exigir e não presume nada.
//
// As duas existentes ficam como estão de propósito. Trocá-las por esta
// é refatoração de tela que já está no ar, e não faz parte de subir o
// menu novo — mas quando alguém for mexer nelas, é para cá que devem
// vir.
// ============================================================
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import { Lock } from "lucide-react";
import { useCurrentUser, useHasPermission, type ModuloKey } from "@/lib/current-user";

/** O recado que todas as telas novas repetem enquanto não há dado real.
 *  Uma constante só para que trocá-lo, no dia em que a integração
 *  entrar, seja um lugar só e não sete. */
export const EM_BREVE = "Em breve — aguardando integração com a Conta Azul";

export function TelaModulo({
  titulo,
  resumo,
  perm,
  perfis,
  children,
}: {
  titulo: string;
  resumo: string;
  /** Módulo exigido. Ausente = não exige módulo nenhum. */
  perm?: ModuloKey;
  /** Perfis (em minúsculas) que enxergam. Ausente ou vazio = todo mundo logado. */
  perfis?: readonly string[];
  children?: ReactNode;
}) {
  const user = useCurrentUser();
  // O hook roda sempre — chamá-lo dentro de um if quebraria a ordem dos
  // hooks. Quando `perm` não vem, o resultado simplesmente não é usado.
  const temModulo = useHasPermission(perm ?? "webmail");

  // Sessão ainda carregando: nem libera nem acusa falta de permissão.
  if (!user.id) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-64 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  const perfilOk = !perfis || perfis.length === 0 || perfis.includes(user.perfil.toLowerCase());
  const moduloOk = !perm || temModulo;

  if (!perfilOk || !moduloOk) {
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <Lock className="h-8 w-8 text-muted-foreground" />
        <h2 className="text-lg font-bold text-[#213368]">Você não tem acesso a esta tela</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          O perfil <strong>{user.perfil || "sem perfil"}</strong> não abre <strong>{titulo}</strong>
          . Se precisa deste acesso, peça à Diretoria ou ao RH pela tela de Administração.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#213368]">{titulo}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{resumo}</p>
      </div>
      {children}
    </div>
  );
}

/** Card de número que ainda não tem número. O traço ocupa o lugar do
 *  valor para que a caixa já nasça do tamanho definitivo e a tela não
 *  pule quando o dado chegar. */
export function CardVazio({ rotulo, detalhe }: { rotulo: string; detalhe?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-2xl font-bold leading-tight text-muted-foreground/50">—</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detalhe ?? EM_BREVE}</p>
    </Card>
  );
}

/** A linha única de uma tabela sem linhas. `colunas` tem que bater com
 *  o número de <TableHead> da tabela, senão o texto não centraliza. */
export function LinhaEmBreve({ colunas }: { colunas: number }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colunas} className="py-14 text-center">
        <p className="text-sm font-semibold text-[#213368]">Nada para mostrar ainda</p>
        <p className="mt-1 text-sm text-muted-foreground">{EM_BREVE}</p>
      </TableCell>
    </TableRow>
  );
}
