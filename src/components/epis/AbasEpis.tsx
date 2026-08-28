// ============================================================
// Barra de abas do módulo de EPIs
// ------------------------------------------------------------
// Mesma aparência do TabsList/TabsTrigger do shadcn, mas cada aba é um
// Link: quem manda no que está aberto é a URL, não estado local. É o
// que mantém a barra e o menu lateral em sincronia — os dois leem o
// mesmo pathname.
//
// Os rótulos aqui são a fonte da verdade: o submenu do menu lateral
// repete exatamente estes.
// ============================================================
import { Link } from "@tanstack/react-router";

export const ABAS_EPIS = [
  { to: "/app/epis/entregas", label: "Entregas" },
  { to: "/app/epis/compras", label: "Compras" },
  { to: "/app/epis/catalogo", label: "Catálogo de EPIs" },
  { to: "/app/epis/funcionarios", label: "Funcionários" },
] as const;

export function AbasEpis() {
  return (
    // A barra rola sozinha no celular em vez de espremer os rótulos ou
    // empurrar a página: quatro abas não cabem em 390px.
    <div className="-mx-1 overflow-x-auto px-1">
      <nav
        aria-label="Seções de EPIs"
        className="inline-flex h-9 w-max items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground"
      >
        {ABAS_EPIS.map((aba) => (
          <Link
            key={aba.to}
            to={aba.to}
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
