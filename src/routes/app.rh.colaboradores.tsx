// ============================================================
// /app/rh/colaboradores — endereço aposentado
// ------------------------------------------------------------
// A lista de colaboradores saiu do submenu do RH e virou item próprio
// do menu, em /app/colaboradores. A tela é a mesma.
//
// O arquivo continua existindo para favorito antigo não dar 404. O
// redirecionamento é `replace` para o Voltar não repetir o salto.
// ============================================================
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/rh/colaboradores")({
  beforeLoad: () => {
    throw redirect({ to: "/app/colaboradores", replace: true });
  },
});
