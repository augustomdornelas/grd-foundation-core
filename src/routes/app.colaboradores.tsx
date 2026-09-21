// ============================================================
// /app/colaboradores — o ÚNICO lugar do Portal com cadastro de gente
// ------------------------------------------------------------
// Antes o mesmo assunto estava espalhado: ficha no RH, vencimentos no
// RH, um segundo cadastro no EPIs (que excluía de verdade) e a
// importação/conciliação da Secullum dentro do Ponto. Tudo isso agora
// mora aqui, e os outros módulos só LEEM a tabela `funcionarios`.
//
// Esta rota é LAYOUT: barra de abas em Link (mesmo padrão do EPIs) e o
// <Outlet /> com a aba da vez. O controle de acesso fica em cada aba,
// pelo RhTela, porque os públicos são diferentes.
// ============================================================
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AbasColaboradores } from "@/components/colaboradores/AbasColaboradores";

export const Route = createFileRoute("/app/colaboradores")({
  component: ColaboradoresLayout,
});

function ColaboradoresLayout() {
  return (
    <div className="space-y-4">
      <AbasColaboradores />
      <Outlet />
    </div>
  );
}
