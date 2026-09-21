// ============================================================
// /app/rh/documentos — endereço aposentado
// ------------------------------------------------------------
// A tela de vencimentos de documentos não existe mais. Os documentos
// continuam no banco (rh_funcionario_documentos); só não há tela.
//
// O arquivo continua existindo para favorito antigo não dar 404. O
// redirecionamento é `replace` para o Voltar não repetir o salto.
// ============================================================
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/rh/documentos")({
  beforeLoad: () => {
    throw redirect({ to: "/app/colaboradores", replace: true });
  },
});
