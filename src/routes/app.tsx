import { createFileRoute, useRouterState, redirect } from "@tanstack/react-router";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/login" });
    }
  },
  component: AppLayout,
});

const titles: Record<string, string> = {
  "/app": "Painel",
  "/app/comercial": "Dashboard Comercial",
  "/app/previsao": "Previsão de Entrada",
  "/app/projetos": "Controle de Projetos",
  "/app/equipamentos": "Equipamentos",
  "/app/clientes": "Clientes",
  "/app/webmail": "Webmail",
  "/app/admin": "Administração",
};

function AppLayout() {
  const pathname = useRouterState({ select: s => s.location.pathname });
  let title = titles[pathname] ?? "Portal";
  if (pathname.startsWith("/app/projetos/") && pathname !== "/app/projetos") title = "Detalhe do Projeto";
  if (pathname.startsWith("/app/equipamentos/") && pathname !== "/app/equipamentos") title = "Detalhe do Equipamento";
  return <PortalLayout title={title} />;
}
