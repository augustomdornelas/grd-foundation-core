// ============================================================
// /app/epis/funcionarios — endereço aposentado
// ------------------------------------------------------------
// A aba era um segundo cadastro em cima da mesma tabela `funcionarios`
// (e excluía de verdade). O cadastro agora é um só, no menu
// Colaboradores; o EPIs só lê a tabela para a entrega.
//
// O arquivo continua existindo para favorito antigo não dar 404. O
// redirecionamento é `replace` para o Voltar não repetir o salto.
// ============================================================
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/epis/funcionarios")({
  beforeLoad: () => {
    throw redirect({ to: "/app/colaboradores", replace: true });
  },
});
