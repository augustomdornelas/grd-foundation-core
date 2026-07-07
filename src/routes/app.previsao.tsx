import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PrevisaoEntrada } from "@/components/comercial/PrevisaoEntrada";

export const Route = createFileRoute("/app/previsao")({ component: PrevisaoPage });

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

  return <PrevisaoEntrada />;
}
