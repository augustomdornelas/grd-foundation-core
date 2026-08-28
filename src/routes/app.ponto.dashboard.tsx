// ============================================================
// /app/ponto/dashboard — o painel de ponto
// ------------------------------------------------------------
// A REGRA QUE NÃO MUDA: esta tela NUNCA chama a API da Secullum no
// carregamento. Lê `ponto_batidas`, `ponto_totais`,
// `secullum_funcionarios` e `secullum_sync` — as tabelas locais que os
// jobs alimentam de madrugada. A API tem teto de requisições por hora;
// um dashboard que a consultasse a cada F5 gastaria a cota do dia em
// meia manhã e derrubaria o sync junto.
//
// O preço disso é o dado ser de ontem, e o preço tem que aparecer: a
// tela mostra a idade do dado no topo, em cor de alerta depois de 36h.
// Dado velho sem aviso é pior que tela vazia.
//
// A interface entra na próxima etapa. A rota já existe agora para que
// o menu não tenha item morto enquanto isso.
// ============================================================
import { createFileRoute } from "@tanstack/react-router";
import { PontoTela } from "@/components/ponto/PontoTela";
import { PERFIS_PONTO } from "@/lib/current-user";

export const Route = createFileRoute("/app/ponto/dashboard")({
  ssr: false,
  component: DashboardPonto,
});

function DashboardPonto() {
  return (
    <PontoTela
      titulo="Dashboard de Ponto"
      resumo="Quem trabalhou, quem faltou e quanto se gastou em hora extra — lido das tabelas locais que os jobs alimentam, nunca da API da Secullum ao vivo."
      perfis={PERFIS_PONTO.dashboard}
      etapa="Etapa 2"
      entrega={[
        "Faixa de hoje: colaboradores do dia, trabalhando agora, faltantes, folga, férias, afastados e solicitações pendentes",
        "Colaboradores do dia por obra, quem faltou hoje e as batidas do dia",
        "Equipe: efetivo por obra e função, tempo de casa, faixa etária e ocupação da licença",
        "Rotatividade: admissões × demissões, turnover, sobrevivência em 30/90/180 dias",
        "Horas e extras, absenteísmo, qualidade das batidas e divergências",
      ]}
    />
  );
}
