// ============================================================
// /app/epis — Módulo de EPIs (Segurança do Trabalho)
// ------------------------------------------------------------
// Esta rota virou LAYOUT. Ela guarda o que é da tela inteira — o
// cabeçalho, os quatro cards de resumo, a barra de abas e os diálogos
// compartilhados — e o <Outlet /> recebe a aba da vez.
//
// As abas viraram rotas de verdade (entregas · compras · catalogo ·
// funcionarios), então quem manda no que está aberto é a URL: link
// direto funciona, o botão voltar funciona, e o submenu do menu
// lateral fica em sincronia com a barra de abas de graça, porque os
// dois leem o mesmo pathname.
//
// Integrado ao Supabase via epis-store.
// ============================================================
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  HardHat,
  FileText,
  Users,
  ShieldCheck,
  AlertTriangle,
  PackageCheck,
  ShoppingCart,
} from "lucide-react";
import { useEpiStore, diasParaVencer } from "@/lib/epis-store";
import { ResumoCard } from "@/components/epis/ResumoCard";
import { AbasEpis } from "@/components/epis/AbasEpis";
import { EpisAcoesProvider } from "@/components/epis/epis-acoes";
import { useEpisAcoes } from "@/components/epis/epis-acoes-contexto";

export const Route = createFileRoute("/app/epis")({
  component: EpisLayout,
  errorComponent: ({ reset }: { error: Error; reset: () => void }) => (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-extrabold text-[#213368]">EPIs</h1>
      <p className="text-sm text-muted-foreground">
        Não foi possível carregar os dados agora. Tente novamente.
      </p>
      <button
        onClick={() => reset()}
        className="rounded-md bg-[#213368] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2a4185]"
      >
        Tentar novamente
      </button>
    </div>
  ),
});

function EpisLayout() {
  return (
    <EpisAcoesProvider>
      <Moldura />
    </EpisAcoesProvider>
  );
}

// Separado do layout porque os botões do cabeçalho usam o contexto, e
// um componente não consegue consumir o provider que ele mesmo monta.
function Moldura() {
  const funcionarios = useEpiStore((s) => s.funcionarios);
  const epis = useEpiStore((s) => s.epis);
  const entregas = useEpiStore((s) => s.entregas);
  const itens = useEpiStore((s) => s.itens);
  const { abrirEntrega, abrirCompra } = useEpisAcoes();

  const itensVencendo = useMemo(
    () =>
      itens.filter((i) => {
        const d = diasParaVencer(i.dataValidade);
        return d !== null && d <= 30;
      }),
    [itens],
  );
  const pendentesAssinatura = entregas.filter((e) => !e.assinado).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-extrabold text-[#213368]">
            <HardHat className="h-6 w-6 text-[#F37032]" /> EPIs — Segurança do Trabalho
          </h2>
          <p className="text-xs text-muted-foreground">
            Cadastro de EPIs e funcionários, entregas com validade e termo de responsabilidade
            (NR-6).
          </p>
        </div>
        {/* flex-wrap porque a 390px os dois botões somam 375px numa
            faixa de 343 e empurravam a página inteira para o lado. */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={abrirCompra}
            className="border-[#213368] text-[#213368]"
          >
            <ShoppingCart className="mr-1 h-4 w-4" /> Lançar compra
          </Button>
          <Button
            onClick={() => abrirEntrega(undefined)}
            className="bg-[#F37032] text-white hover:bg-[#ff8850]"
          >
            <PackageCheck className="mr-1 h-4 w-4" /> Nova entrega
          </Button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ResumoCard
          icon={<Users className="h-5 w-5" />}
          label="Funcionários"
          valor={funcionarios.length}
        />
        <ResumoCard
          icon={<ShieldCheck className="h-5 w-5" />}
          label="EPIs no catálogo"
          valor={epis.length}
        />
        <ResumoCard
          icon={<FileText className="h-5 w-5" />}
          label="Entregas / termos"
          valor={entregas.length}
          sub={pendentesAssinatura ? `${pendentesAssinatura} a assinar` : "todos assinados"}
        />
        <ResumoCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="EPIs vencendo (30d)"
          valor={itensVencendo.length}
          destaque={itensVencendo.length > 0}
        />
      </div>

      <div className="space-y-2">
        <AbasEpis />
        <Outlet />
      </div>
    </div>
  );
}
