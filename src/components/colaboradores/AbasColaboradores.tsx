// ============================================================
// Barra de abas do menu Colaboradores
// ------------------------------------------------------------
// Mesmo padrão de AbasEpis: cada aba é um Link, quem manda no que está
// aberto é a URL, e a barra fica em sincronia com o submenu lateral
// porque os dois leem o mesmo pathname.
//
// Diferente do EPIs, aqui as abas têm públicos diferentes (importar da
// Secullum é só de quem mexe na integração), então cada uma carrega os
// perfis que a enxergam — os mesmos do submenu em PortalLayout.
// ============================================================
import { Link } from "@tanstack/react-router";
import { PERFIS_RH, useCurrentUser, useHasPermission } from "@/lib/current-user";

export const ABAS_COLABORADORES = [
  {
    to: "/app/colaboradores",
    label: "Lista de colaboradores",
    exact: true,
    perfis: PERFIS_RH.colaboradores,
  },
  {
    to: "/app/colaboradores/secullum",
    label: "Importar da Secullum",
    exact: false,
    perfis: PERFIS_RH.integracoes,
  },
] as const;

export function AbasColaboradores() {
  const user = useCurrentUser();
  const temModulo = useHasPermission("rh");
  const perfil = user.perfil.toLowerCase();
  const abas = ABAS_COLABORADORES.filter(
    (a) => temModulo && (a.perfis as readonly string[]).includes(perfil),
  );
  // Com uma aba só (ou nenhuma, enquanto a sessão carrega) a barra não
  // ajuda ninguém a navegar.
  if (abas.length < 2) return null;

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <nav
        aria-label="Seções de colaboradores"
        className="inline-flex h-9 w-max items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground"
      >
        {abas.map((aba) => (
          <Link
            key={aba.to}
            to={aba.to}
            activeOptions={{ exact: aba.exact }}
            className="inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            activeProps={{
              className: "bg-background text-foreground shadow",
              "aria-current": "page",
            }}
          >
            {aba.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
