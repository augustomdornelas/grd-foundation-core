import { Link, useRouterState, Outlet, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, BriefcaseBusiness, TrendingUp, FolderKanban, Wrench, Mail, Clock, Users2, Search, LogOut, User as UserIcon, Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useState, type ReactNode } from "react";
import { useCurrentUser, sessionActions, iniciaisDe, type ModuloKey } from "@/lib/current-user";

const items: { to: string; label: string; icon: typeof LayoutDashboard; exact: boolean; perm?: ModuloKey }[] = [
  { to: "/app", label: "Painel", icon: LayoutDashboard, exact: true },
  { to: "/app/comercial", label: "Comercial", icon: BriefcaseBusiness, exact: false, perm: "comercial" },
  { to: "/app/projetos", label: "Projetos", icon: FolderKanban, exact: false, perm: "projetos" },
  { to: "/app/equipamentos", label: "Equipamentos", icon: Wrench, exact: false, perm: "equipamentos" },
  { to: "/app/webmail", label: "Webmail", icon: Mail, exact: false, perm: "webmail" },
  { to: "/app/ponto", label: "Ponto", icon: Clock, exact: false },
  { to: "/app/admin", label: "Admin", icon: Users2, exact: false, perm: "admin" },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const user = useCurrentUser();
  const visiveis = items.filter(it => !it.perm || user.permissoes.includes(it.perm));
  return (
    <nav className="flex flex-col gap-1 p-3">
      {visiveis.map(it => {
        const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
        return (
          <Link
            key={it.to}
            to={it.to}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              active ? "bg-[#F37032] text-white shadow" : "text-white/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            <it.icon className="h-4 w-4" />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function PortalLayout({ title, children }: { title: string; children?: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const user = useCurrentUser();
  const iniciais = iniciaisDe(user.nome);
  const handleLogout = () => {
    sessionActions.logout();
    navigate({ to: "/login" });
  };
  return (
    <div className="flex min-h-screen w-full bg-[#F4F4F4]">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-[#213368] md:flex">
        <div className="flex h-16 items-center border-b border-white/10 px-5">
          <Logo variant="light" />
        </div>
        <div className="flex-1 overflow-y-auto"><SidebarNav /></div>
        <div className="border-t border-white/10 p-4 text-xs text-white/60">
          © {new Date().getFullYear()} Grupo GRD
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex h-full w-64 flex-col bg-[#213368]">
            <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
              <Logo variant="light" />
              <button onClick={() => setMobileOpen(false)} className="text-white"><X /></button>
            </div>
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-white px-4 md:px-6">
          <button className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Menu"><Menu /></button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-[#213368]">{title}</h1>
          <div className="hidden md:block md:w-72">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar..." className="pl-9" />
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2">
                <Avatar className="h-9 w-9"><AvatarFallback className="bg-[#213368] text-white">{iniciais}</AvatarFallback></Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="font-semibold">{user.nome}</div>
                <div className="text-xs font-normal text-muted-foreground">{user.email}</div>
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[#F37032]">{user.perfil}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem><UserIcon className="mr-2 h-4 w-4" /> Perfil</DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout}><LogOut className="mr-2 h-4 w-4" /> Sair</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-8">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
