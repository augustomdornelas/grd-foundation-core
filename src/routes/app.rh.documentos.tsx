// ============================================================
// /app/rh/documentos — endereço aposentado
// ------------------------------------------------------------
// Os vencimentos de documentos foram junto com a lista para o menu
// Colaboradores, em /app/colaboradores/documentos. A tela é a mesma.
//
// O arquivo continua existindo para favorito antigo não dar 404. O
// redirecionamento é `replace` para o Voltar não repetir o salto.
// ============================================================
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/rh/documentos")({
  beforeLoad: () => {
    throw redirect({ to: "/app/colaboradores/documentos", replace: true });
  },
});
