import { useRouterState, Outlet, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  BriefcaseBusiness,
  TrendingUp,
  Wallet,
  FolderKanban,
  HardHat,
  Users,
  Mail,
  Users2,
  UserPlus,
  Clock,
  Plug,
  Search,
  LogOut,
  User as UserIcon,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavGroup } from "@/components/portal/NavGroup";
import { rotaAtiva } from "@/components/portal/nav-rotas";
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  useCurrentUser,
  sessionActions,
  iniciaisDe,
  PERFIS_RH,
  PERFIS_PONTO,
  type ModuloKey,
} from "@/lib/current-user";
import { supabase } from "@/integrations/supabase/client";
type NavFilho = {
  to: string;
  label: string;
  exact?: boolean;
  /** Perfis (minúsculas) que enxergam. Ausente = todo mundo logado. */
  perfis?: readonly string[];
  /** Módulo exigido. Ausente = não exige módulo. */
  perm?: ModuloKey;
};
type NavItem = {
  /** Identidade estável do item — chave do estado aberto/fechado. */
  key: string;
  /** Rota própria. Opcional em grupo, obrigatória em item simples. */
  to?: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  perm?: ModuloKey;
  filhos?: NavFilho[];
};

// O RH entra como grupo, e não como nove entradas soltas: são nove
// telas e a barra lateral já tem oito itens. Cada filho carrega os
// perfis que o enxergam, direto da matriz do briefing — o
// almoxarifado, por exemplo, abre o grupo e vê só colaboradores e
// cargos.
//
// O grupo RH não tem rota própria de propósito: /app/rh é uma tela com
// dono (PERFIS_RH.painel), e clicar no rótulo levaria o almoxarifado a
// uma página trancada. Quem pode abrir o painel chega nele pelo filho.
//
// O Ponto é grupo à parte, e não mais dois filhos do RH, porque as
// suas telas têm públicos que não cabem sob a permissão do RH: bater
// ponto é de quem está logado, inclusive de quem não tem o módulo. Sob
// o RH, o grupo inteiro tinha que aparecer para todo mundo só para
// carregar essa linha.
const items: NavItem[] = [
  { key: "painel", to: "/app", label: "Painel", icon: LayoutDashboard, exact: true },
  {
    key: "comercial",
    to: "/app/comercial",
    label: "Comercial",
    icon: BriefcaseBusiness,
    perm: "comercial",
  },
  {
    key: "previsao",
    to: "/app/previsao",
    label: "Previsão de Entrada",
    icon: TrendingUp,
    perm: "comercial",
  },
  // Grupo com rota própria: /app/financeiro é a visão geral, e quem
  // tem o módulo pode abri-la — diferente do RH, onde o rótulo não
  // leva a lugar nenhum porque o índice tem dono.
  //
  // O `perm` do grupo repete o dos filhos de propósito. Quem decide se
  // o grupo aparece é a lista de filhos visíveis; o perm daqui só
  // passa a valer se um dia o grupo perder os filhos.
  {
    key: "financeiro",
    to: "/app/financeiro",
    label: "Financeiro",
    icon: Wallet,
    perm: "financeiro",
    filhos: [
      { to: "/app/financeiro", label: "Visão geral", exact: true, perm: "financeiro" },
      { to: "/app/financeiro/receber", label: "Contas a receber", perm: "financeiro" },
      { to: "/app/financeiro/pagar", label: "Contas a pagar", perm: "financeiro" },
    ],
  },
  { key: "projetos", to: "/app/projetos", label: "Projetos", icon: FolderKanban, perm: "projetos" },
  {
    key: "epis",
    label: "EPIs",
    icon: HardHat,
    // Os rótulos são os mesmos da barra de abas, de ABAS_EPIS — quem
    // mudar um rótulo lá tem que mudar aqui, e vice-versa.
    filhos: [
      { to: "/app/epis/entregas", label: "Entregas", perm: "epis" },
      { to: "/app/epis/compras", label: "Compras", perm: "epis" },
      { to: "/app/epis/catalogo", label: "Catálogo de EPIs", perm: "epis" },
      { to: "/app/epis/funcionarios", label: "Funcionários", perm: "epis" },
    ],
  },
  {
    key: "rh",
    label: "RH",
    icon: UserPlus,
    filhos: [
      { to: "/app/rh", label: "Painel de RH", exact: true, perm: "rh", perfis: PERFIS_RH.painel },
      { to: "/app/rh/vagas", label: "Vagas", perm: "rh", perfis: PERFIS_RH.vagas },
      { to: "/app/rh/selecao", label: "Seleção", perm: "rh", perfis: PERFIS_RH.selecao },
      { to: "/app/rh/candidatos", label: "Candidatos", perm: "rh", perfis: PERFIS_RH.selecao },
      { to: "/app/rh/admissoes", label: "Admissões", perm: "rh", perfis: PERFIS_RH.admissoes },
      {
        to: "/app/rh/colaboradores",
        label: "Colaboradores",
        perm: "rh",
        perfis: PERFIS_RH.colaboradores,
      },
      {
        to: "/app/rh/documentos",
        label: "Documentos",
        perm: "rh",
        perfis: PERFIS_RH.colaboradores,
      },
      { to: "/app/rh/cargos", label: "Cargos", perm: "rh", perfis: PERFIS_RH.cargos },
      {
        to: "/app/rh/configuracoes",
        label: "Configurações",
        perm: "rh",
        perfis: PERFIS_RH.configuracoes,
      },
    ],
  },
  {
    key: "ponto",
    label: "Ponto",
    icon: Clock,
    filhos: [
      {
        to: "/app/ponto/dashboard",
        label: "Dashboard",
        perfis: PERFIS_PONTO.dashboard,
      },
      {
        to: "/app/ponto/integracao",
        label: "Integração",
        perfis: PERFIS_PONTO.integracao,
      },
      // Sem perm e sem perfis: é a tela onde o colaborador bate o
      // ponto, e quem mais precisa dela é o pessoal de campo — que não
      // tem módulo nenhum. É ela que faz o grupo Ponto aparecer para
      // todo mundo, ainda que para alguns só com esta linha dentro.
      { to: "/app/ponto/bater", label: "Bater ponto" },
    ],
  },
  { key: "clientes", to: "/app/clientes", label: "Clientes", icon: Users },
  { key: "webmail", to: "/app/webmail", label: "Webmail", icon: Mail, perm: "webmail" },
  // Integrações fica colada no Admin porque é vizinha dele: as duas
  // são de quem administra o Portal, não de quem o usa.
  //
  // "Ponto (Secullum)" aponta para uma tela que também é filha do
  // grupo Ponto. É repetição de propósito — quem procura uma
  // integração procura em Integrações, e quem vive no Ponto a acha
  // onde sempre esteve. O preço é os dois grupos acenderem juntos
  // nessa rota, que é o que NavGroup já faz com filho fora do prefixo.
  {
    key: "integracoes",
    to: "/app/integracoes",
    label: "Integrações",
    icon: Plug,
    perm: "admin",
    filhos: [
      { to: "/app/integracoes/contaazul", label: "Conta Azul", perm: "admin" },
      { to: "/app/ponto/integracao", label: "Ponto (Secullum)", perm: "admin" },
    ],
  },
  { key: "admin", to: "/app/admin", label: "Admin", icon: Users2, perm: "admin" },
];

const STORAGE_KEY = "grd:sidebar:collapsed";
// v2 porque o formato mudou de significado, e não de forma: a versão
// anterior gravava TAMBÉM a abertura automática do grupo da rota
// ativa, então bastava visitar /app/rh uma vez para o RH ficar
// marcado como aberto para sempre — inclusive em /app/ponto. O valor
// antigo é indistinguível de uma preferência de verdade, então não dá
// para migrar: é descartado, e o menu volta ao padrão fechado.
const GRUPOS_KEY = "grd:sidebar:grupos:v2";

/**
 * Fica só com as chaves que valem: objeto simples, valores booleanos.
 *
 * Qualquer outra coisa é descartada em silêncio em vez de migrada —
 * um valor gravado por uma versão anterior não tem como ser
 * interpretado com confiança, e adivinhar produziria justamente o
 * menu abrindo sozinho que isto veio consertar.
 */
function apenasBooleanos(bruto: unknown): Record<string, boolean> {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
  const limpo: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(bruto as Record<string, unknown>)) {
    if (typeof v === "boolean") limpo[k] = v;
  }
  return limpo;
}

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const user = useCurrentUser();
  const perfil = user.perfil.toLowerCase();
  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>({});

  // Cada pessoa lembra os seus grupos: a chave carrega o id do usuário
  // para que duas contas no mesmo navegador não herdem o menu uma da
  // outra.
  const chaveGrupos = user.id ? `${GRUPOS_KEY}:${user.id}` : null;

  const filhoVisivel = (f: NavFilho) =>
    (!f.perm || user.permissoes.includes(f.perm)) && (!f.perfis || f.perfis.includes(perfil));
  const filhosVisiveis = (it: NavItem) => (it.filhos ?? []).filter(filhoVisivel);

  const visiveis = items.filter((it) => {
    // Grupo: quem manda é a lista de filhos. Sem nenhum liberado o
    // grupo some — é a diferença entre "não tem o que ver aqui" e
    // "tem, mas está vazio".
    if (it.filhos) return filhosVisiveis(it).length > 0;
    if (it.perm && !user.permissoes.includes(it.perm)) return false;
    return true;
  });

  const contemAtiva = (it: NavItem) =>
    (it.to !== undefined && rotaAtiva(pathname, it.to, it.exact)) ||
    filhosVisiveis(it).some((f) => rotaAtiva(pathname, f.to, f.exact));

  useEffect(() => {
    if (!chaveGrupos) return;
    try {
      const bruto = localStorage.getItem(chaveGrupos);
      setGruposAbertos(bruto ? apenasBooleanos(JSON.parse(bruto)) : {});
    } catch {
      // JSON corrompido é o mesmo caso do formato antigo: sem
      // preferência. Menu fechado é um padrão seguro.
      setGruposAbertos({});
    }
  }, [chaveGrupos]);

  const definirGrupo = (key: string, aberto: boolean) => {
    setGruposAbertos((prev) => {
      if (prev[key] === aberto) return prev;
      const proximo = { ...prev, [key]: aberto };
      if (chaveGrupos) {
        try {
          localStorage.setItem(chaveGrupos, JSON.stringify(proximo));
        } catch {
          /* noop */
        }
      }
      return proximo;
    });
  };

  // NÃO existe efeito abrindo o grupo da rota ativa, e a ausência é
  // o conserto. Antes havia um, e ele CHAMAVA definirGrupo — ou seja,
  // gravava no localStorage. Visitar /app/rh uma vez deixava o RH
  // marcado como aberto para sempre, e o grupo aparecia expandido em
  // /app/ponto/dashboard.
  //
  // A abertura automática não é estado: é derivada da rota, e vive em
  // `abertoDoGrupo()` abaixo. O que se guarda é só o que a pessoa
  // decidiu na mão.

  /**
   * Um grupo está aberto quando a pessoa mandou abrir; na falta de
   * decisão dela, quando contém a rota atual.
   *
   * A ordem importa e é o resto do conserto: a preferência vem PRIMEIRO.
   * Quem fechou o RH continua com o RH fechado ao navegar para dentro
   * dele — trocar de rota não desfaz o que a pessoa decidiu.
   */
  const abertoDoGrupo = (it: NavItem) => gruposAbertos[it.key] ?? contemAtiva(it);

  // Setas cima/baixo andam entre os itens à vista. O que está dentro de
  // grupo fechado não tem caixa de layout, e offsetParent nulo o tira
  // da roda.
  const aoTeclar = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const foco = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>("[data-nav-item]"),
    ).filter((el) => el.offsetParent !== null);
    if (foco.length === 0) return;
    e.preventDefault();
    const atual = foco.indexOf(document.activeElement as HTMLElement);
    const passo = e.key === "ArrowDown" ? 1 : -1;
    const proximo = atual === -1 ? 0 : (atual + passo + foco.length) % foco.length;
    foco[proximo]?.focus();
  };

  return (
    <TooltipProvider delayDuration={100}>
      <nav
        onKeyDown={aoTeclar}
        className={`flex min-w-0 flex-col gap-1 ${collapsed ? "p-2" : "p-3"}`}
      >
        {visiveis.map((it) => (
          <NavGroup
            key={it.key}
            label={it.label}
            icon={it.icon}
            to={it.to}
            exact={it.exact}
            subitens={it.filhos ? filhosVisiveis(it) : undefined}
            pathname={pathname}
            collapsed={collapsed}
            aberto={abertoDoGrupo(it)}
            onToggle={() => definirGrupo(it.key, !abertoDoGrupo(it))}
            onAbrir={() => definirGrupo(it.key, true)}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    </TooltipProvider>
  );
}

export function PortalLayout({ title, children }: { title: string; children?: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const user = useCurrentUser();
  const iniciais = iniciaisDe(user.nome);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "1") setCollapsed(true);
    } catch {
      /* noop */
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* noop */
      }
      return next;
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    sessionActions.logout();
    navigate({ to: "/login" });
  };

  return (
    <div className="app-layout flex min-h-screen w-full bg-[#F4F4F4]">
      {/* Desktop sidebar */}
      <aside
        className={`relative hidden shrink-0 flex-col bg-[#213368] transition-[width] duration-300 ease-in-out md:flex ${collapsed ? "w-[64px]" : "w-64"}`}
      >
        <div
          className={`flex h-20 items-center border-b border-white/10 ${collapsed ? "justify-center px-2" : "px-5"}`}
        >
          {collapsed ? (
            <span className="text-xl font-black text-white">G</span>
          ) : (
            <Logo variant="light" />
          )}
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <SidebarNav collapsed={collapsed} />
        </div>
        <div
          className={`border-t border-white/10 p-3 text-xs text-white/60 ${collapsed ? "text-center" : ""}`}
        >
          {collapsed ? "©" : `© ${new Date().getFullYear()} Grupo GRD`}
        </div>

        {/* Toggle button */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir menu" : "Minimizar menu"}
          className="absolute -right-3 top-24 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-[#213368]/20 bg-white text-[#213368] shadow-md transition hover:bg-[#F37032] hover:text-white"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" />
          )}
        </button>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex h-full w-64 flex-col bg-[#213368]">
            <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
              <Logo variant="light" />
              <button onClick={() => setMobileOpen(false)} className="text-white">
                <X />
              </button>
            </div>
            {/* A gaveta rola, como a barra de desktop já rolava. Sem
                isto, com EPIs, RH e Ponto abertos o menu passa de mil
                pixels num celular de 844 e o fim da lista fica
                inalcançável. */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-white px-4 md:px-6">
          <button className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Menu">
            <Menu />
          </button>
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
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-[#213368] text-white">{iniciais}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="font-semibold">{user.nome}</div>
                <div className="text-xs font-normal text-muted-foreground">{user.email}</div>
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[#F37032]">
                  {user.perfil}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <UserIcon className="mr-2 h-4 w-4" /> Perfil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-8">{children ?? <Outlet />}</main>
      </div>
    </div>
  );
}
