import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { PortalLayout } from "@/components/portal/PortalLayout";

export const Route = createFileRoute("/app")({ component: AppLayout });

const titles: Record<string, string> = {
  "/app": "Painel",
  "/app/comercial": "Dashboard Comercial",
  "/app/projetos": "Controle de Projetos",
  "/app/equipamentos": "Equipamentos",
  "/app/webmail": "Webmail",
  "/app/admin": "Administração",
};

function AppLayout() {
  const pathname = useRouterState({ select: s => s.location.pathname });
  let title = titles[pathname] ?? "Portal";
  if (pathname.startsWith("/app/projetos/") && pathname !== "/app/projetos") title = "Detalhe do Projeto";
  return <PortalLayout title={title} />;
}
