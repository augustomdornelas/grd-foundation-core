// ============================================================
// /app/ponto — layout do módulo de Ponto
// ------------------------------------------------------------
// O Ponto era uma tela só, pendurada no submenu do RH. Virou módulo
// com três telas de públicos diferentes — dashboard, integração e
// bater ponto — e este arquivo passou a ser só a casca que as segura.
//
// Não há guarda de acesso aqui de propósito. Cada filha tranca o que é
// dela: /bater é de quem está logado, /dashboard e /integracao têm
// listas de perfil próprias. Uma guarda no layout teria que ser a
// união das três, o que na prática é nenhuma.
// ============================================================
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/ponto")({ component: PontoLayout });

function PontoLayout() {
  return <Outlet />;
}
