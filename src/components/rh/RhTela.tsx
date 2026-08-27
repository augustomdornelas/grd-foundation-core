// ============================================================
// Casca das telas do módulo de RH
// ------------------------------------------------------------
// Nesta etapa o banco já existe e as telas ainda não. Em vez de rota
// em branco, cada tela nasce com o cabeçalho definitivo, o controle de
// acesso já ligado e um estado vazio que diz o que vem e quando —
// assim nenhuma rota do menu leva a uma página morta.
// ============================================================
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Lock } from "lucide-react";
import { useCurrentUser, useHasPermission } from "@/lib/current-user";

export function RhTela({
  titulo,
  resumo,
  perfis,
  etapa,
  entrega,
  children,
}: {
  titulo: string;
  resumo: string;
  /** Perfis (em minúsculas) que enxergam esta tela — a matriz do briefing. */
  perfis: readonly string[];
  /** Em qual etapa da construção esta tela é entregue. Só usado no estado vazio. */
  etapa?: string;
  /** O que a tela vai fazer quando existir. Só usado no estado vazio. */
  entrega?: string[];
  children?: ReactNode;
}) {
  const user = useCurrentUser();
  const temModulo = useHasPermission("rh");

  // Sessão ainda carregando: nem libera nem acusa falta de permissão.
  if (!user.id) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-64 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!temModulo || !perfis.includes(user.perfil.toLowerCase())) {
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

      {children ?? (
        <Card className="p-8">
          <div className="mx-auto max-w-xl text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#213368]/10 text-sm font-bold text-[#213368]">
              {etapa ?? "RH"}
            </div>
            <h3 className="text-base font-bold text-[#213368]">Tela em construção</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              A base de dados desta tela já está no ar. A interface entra na{" "}
              {etapa ?? "próxima etapa"}.
            </p>
            <ul className="mt-5 space-y-2 text-left text-sm text-muted-foreground">
              {(entrega ?? []).map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#F37032]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
    </div>
  );
}
