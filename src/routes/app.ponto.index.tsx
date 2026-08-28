// ============================================================
// /app/ponto — o índice, que só decide para onde mandar
// ------------------------------------------------------------
// Este endereço era a tela de bater ponto e virou grupo. Todo link
// antigo para /app/ponto continua chegando aqui, e daqui sai para a
// tela certa — nada quebra.
//
// PARA ONDE, E POR QUÊ
// Quem acompanha o ponto dos outros cai no dashboard; quem bate o
// próprio cai em /bater. Mandar o pessoal de campo para um dashboard
// que ele não pode abrir seria trocar uma tela útil por uma tela de
// cadeado, e mandar a Diretoria para /bater esconderia o painel atrás
// de mais um clique.
//
// O redirecionamento é `replace` para que o botão Voltar do navegador
// saia do módulo em vez de cair de novo neste índice, em laço.
//
// A decisão espera o perfil chegar: `user.id` vazio é sessão ainda
// carregando, e escolher nessa hora mandaria todo mundo para /bater.
// ============================================================
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCurrentUser, PERFIS_PONTO } from "@/lib/current-user";

export const Route = createFileRoute("/app/ponto/")({ component: IndicePonto });

function IndicePonto() {
  const user = useCurrentUser();

  if (!user.id) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-64 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  const vePainel = PERFIS_PONTO.dashboard.includes(
    user.perfil.toLowerCase() as (typeof PERFIS_PONTO.dashboard)[number],
  );

  return <Navigate to={vePainel ? "/app/ponto/dashboard" : "/app/ponto/bater"} replace />;
}
