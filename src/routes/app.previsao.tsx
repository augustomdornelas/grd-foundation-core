import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PrevisaoEntrada } from "@/components/comercial/PrevisaoEntrada";

export const Route = createFileRoute("/app/previsao")({ component: PrevisaoPage });

function PrevisaoPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="space-y-6">
      {mounted ? (
        <PrevisaoEntrada />
      ) : (
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-extrabold text-[#213368]">Previsão de Entrada</h2>
            <p className="text-xs text-muted-foreground">Carregando...</p>
          </div>
        </section>
      )}
    </div>
  );
}
