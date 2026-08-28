// ============================================================
// /app/rh/integracoes/secullum — endereço aposentado
// ------------------------------------------------------------
// A tela mudou de módulo: o Ponto deixou de ser um item do submenu do
// RH e virou grupo próprio, e a integração foi junto para
// /app/ponto/integracao. O conteúdo não mudou nada, só o endereço.
//
// Este arquivo continua existindo porque o endereço antigo está em
// favorito de navegador e em link colado em conversa. Apagá-lo daria
// 404 para quem já usava a tela; redirecionar entrega a mesma tela e
// ainda corrige a barra de endereços para o novo lugar.
//
// O redirecionamento é `replace` para que o botão Voltar saia daqui em
// vez de repetir o salto.
// ============================================================
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/rh/integracoes/secullum")({
  beforeLoad: () => {
    throw redirect({ to: "/app/ponto/integracao", replace: true });
  },
});
