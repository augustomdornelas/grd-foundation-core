// ============================================================
// NavGroup — item da barra lateral, com ou sem submenu
// ------------------------------------------------------------
// Um componente só para os dois casos, porque são o mesmo item:
//   - COM subitens  -> botão de disclosure, com a seta e a lista
//   - SEM subitens  -> link simples, sem seta nenhuma
//
// O grupo pode ter rota própria. Quando tem, o rótulo é um link que
// navega E abre, e a seta ao lado só abre/fecha — é a única forma de
// alcançar as duas ações sem aninhar botão dentro de link.
// ============================================================
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useId, type ComponentType, type KeyboardEvent, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { rotaAtiva } from "@/components/portal/nav-rotas";

export type NavSubItem = {
  to: string;
  label: string;
  /** Casa só com a rota exata. Necessário no índice de um grupo
   *  (/app/rh), que senão fica aceso em todos os filhos. */
  exact?: boolean;
};

const FOCO =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-[#213368]";

const LINHA = `flex items-center rounded-lg py-2.5 text-sm font-medium transition-all duration-200 ${FOCO}`;

const cores = (ativo: boolean) =>
  ativo ? "bg-[#F37032] text-white shadow" : "text-white/80 hover:bg-white/10 hover:text-white";

function ComTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export type NavGroupProps = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Rota própria do item. Obrigatória em item simples; opcional em grupo. */
  to?: string;
  exact?: boolean;
  /** Vazio ou ausente = item simples, sem seta. */
  subitens?: NavSubItem[];
  pathname: string;
  collapsed: boolean;
  aberto: boolean;
  /** Alterna abrir/fechar. */
  onToggle: () => void;
  /** Só abre — usado quando o rótulo com rota própria é clicado. */
  onAbrir: () => void;
  onNavigate?: () => void;
};

export function NavGroup({
  label,
  icon: Icone,
  to,
  exact,
  subitens,
  pathname,
  collapsed,
  aberto,
  onToggle,
  onAbrir,
  onNavigate,
}: NavGroupProps) {
  const listaId = useId();
  const temFilhos = (subitens?.length ?? 0) > 0;
  const filhos = subitens ?? [];

  // O grupo acende quando qualquer filho está ativo — e não por prefixo
  // de rota, porque um filho pode morar fora do prefixo do grupo
  // (Bater ponto é /app/ponto dentro do grupo RH).
  const ativo =
    (to !== undefined && rotaAtiva(pathname, to, exact)) ||
    filhos.some((f) => rotaAtiva(pathname, f.to, f.exact));

  // ---------- barra recolhida ----------
  // Não cabe submenu: o ícone leva à rota própria ou à primeira tela
  // que este usuário pode abrir, e a tooltip diz qual grupo é.
  if (collapsed) {
    const destino = to ?? filhos[0]?.to;
    if (!destino) return null;
    return (
      <ComTooltip label={label}>
        <Link
          to={destino}
          onClick={onNavigate}
          data-nav-item
          className={`${LINHA} justify-center px-2 ${cores(ativo)}`}
        >
          <Icone className="h-4 w-4 shrink-0" />
        </Link>
      </ComTooltip>
    );
  }

  // ---------- item simples: link, sem seta ----------
  if (!temFilhos) {
    if (to === undefined) return null;
    return (
      <Link
        to={to}
        onClick={onNavigate}
        data-nav-item
        className={`${LINHA} gap-3 px-3 ${cores(ativo)}`}
      >
        <Icone className="h-4 w-4 shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
      </Link>
    );
  }

  // ---------- grupo ----------
  const seta = (
    <ChevronDown
      aria-hidden="true"
      className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${
        aberto ? "rotate-180" : "rotate-0"
      }`}
    />
  );

  // Esc fecha o grupo de onde o foco está.
  const aoTeclar = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape" || !aberto) return;
    e.stopPropagation();
    onToggle();
    e.currentTarget.querySelector<HTMLElement>("[data-nav-gatilho]")?.focus();
  };

  return (
    <div onKeyDown={aoTeclar}>
      {to !== undefined ? (
        // Com rota própria: o rótulo navega e abre; a seta só alterna.
        <div className={`flex items-stretch gap-1 rounded-lg ${cores(ativo)}`}>
          <Link
            to={to}
            onClick={() => {
              onAbrir();
              onNavigate?.();
            }}
            data-nav-item
            className={`${LINHA} min-w-0 flex-1 gap-3 rounded-lg pl-3 pr-1 ${FOCO}`}
          >
            <Icone className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          </Link>
          <button
            type="button"
            aria-expanded={aberto}
            aria-controls={listaId}
            aria-label={`${aberto ? "Recolher" : "Expandir"} ${label}`}
            onClick={onToggle}
            data-nav-item
            data-nav-gatilho
            className={`flex shrink-0 items-center rounded-lg px-2 ${FOCO}`}
          >
            {seta}
          </button>
        </div>
      ) : (
        <button
          type="button"
          aria-expanded={aberto}
          aria-controls={listaId}
          onClick={onToggle}
          data-nav-item
          data-nav-gatilho
          className={`${LINHA} w-full gap-3 px-3 ${cores(ativo)}`}
        >
          <Icone className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          {seta}
        </button>
      )}

      {/* A lista existe sempre, para que aria-controls aponte para algo
          real; fechada, sai do fluxo com display:none. */}
      <ul
        id={listaId}
        className={
          aberto ? "ml-5 mt-1 flex flex-col gap-0.5 border-l border-white/15 pl-3" : "hidden"
        }
      >
        {filhos.map((f) => {
          const filhoAtivo = rotaAtiva(pathname, f.to, f.exact);
          return (
            <li key={f.to} className="min-w-0">
              <Link
                to={f.to}
                onClick={onNavigate}
                data-nav-item
                aria-current={filhoAtivo ? "page" : undefined}
                className={`block min-w-0 truncate rounded-md px-3 py-1.5 text-[13px] transition-colors ${FOCO} ${
                  filhoAtivo
                    ? "bg-white/15 font-semibold text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                {f.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
