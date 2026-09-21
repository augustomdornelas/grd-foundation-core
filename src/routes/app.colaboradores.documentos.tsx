// ============================================================
// /app/colaboradores/documentos — endereço aposentado
// ------------------------------------------------------------
// A tela de vencimentos de documentos saiu do menu Colaboradores, que
// ficou só com o cadastro e a importação da Secullum. Os documentos
// continuam no banco (rh_funcionario_documentos); só não há tela.
//
// O arquivo continua existindo para favorito antigo não dar 404. O
// redirecionamento é `replace` para o Voltar não repetir o salto.
// ============================================================
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/colaboradores/documentos")({
  beforeLoad: () => {
    throw redirect({ to: "/app/colaboradores", replace: true });
  },
});
