import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Component, useEffect, useState, type ReactNode } from "react";
import { PrevisaoEntrada } from "@/components/comercial/PrevisaoEntrada";

export const Route = createFileRoute("/app/previsao")({
  component: PrevisaoPage,
  errorComponent: PrevisaoErro,
});

function PrevisaoErro({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { console.error("[previsao] route error:", error); }, [error]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-extrabold text-[#213368]">Previsão de Entrada</h1>
      <p className="text-sm text-muted-foreground">
        Não foi possível carregar os dados agora. Tente novamente.
      </p>
      <button
        onClick={() => { router.invalidate(); reset(); }}
        className="inline-flex items-center justify-center rounded-md bg-[#213368] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2a4185]"
      >
        Tentar novamente
      </button>
    </div>
  );
}

class PrevisaoBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { console.error("[previsao] boundary:", err); }
  render() {
    if (this.state.err) {
      return (
        <div className="space-y-4 p-6">
          <h1 className="text-2xl font-extrabold text-[#213368]">Previsão de Entrada</h1>
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar os dados agora. Recarregue a página para tentar novamente.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

function PrevisaoPage() {
  // Evita mismatch de hidratação: os dados dependem de `new Date()`
  // e de localStorage, que só existem no cliente.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-[#213368]">Previsão de Entrada</h1>
          <p className="text-xs text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <PrevisaoBoundary>
      <PrevisaoEntrada />
    </PrevisaoBoundary>
  );
}
