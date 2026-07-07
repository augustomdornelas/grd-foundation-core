import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { PrevisaoEntrada } from "@/components/comercial/PrevisaoEntrada";

export const Route = createFileRoute("/app/previsao")({ component: PrevisaoPage });

function PrevisaoPage() {
  return (
    <div className="space-y-6">
      <ClientOnly fallback={<PrevisaoFallback />}>
        <PrevisaoEntrada />
      </ClientOnly>
    </div>
  );
}

function PrevisaoFallback() {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-[#213368]">Previsão de Entrada</h2>
        <p className="text-xs text-muted-foreground">Carregando...</p>
      </div>
    </section>
  );
}
