import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { DollarSign, TrendingUp, Wallet, PieChart } from "lucide-react";

export const Route = createFileRoute("/app/previsao")({ component: PrevisaoPage });

function PrevisaoPage() {
  const kpis = [
    { label: "Receita Prevista", value: "R$ 1.200.000", icon: DollarSign, tone: "azul" as const },
    { label: "Já Faturado", value: "R$ 480.000", icon: TrendingUp, tone: "azul" as const },
    { label: "Saldo", value: "R$ 720.000", icon: Wallet, tone: "laranja" as const },
    { label: "Executado", value: "40%", icon: PieChart, tone: "azul" as const },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[#213368]">Previsão de Entrada</h1>
        <p className="text-xs text-muted-foreground">Acompanhamento de receita por orçamento aprovado</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(k => {
          const Icon = k.icon;
          const cor = k.tone === "laranja" ? "text-[#F37032]" : "text-[#213368]";
          return (
            <Card key={k.label} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#213368] text-white">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div className={`mt-3 text-xl font-extrabold ${cor}`}>{k.value}</div>
              <div className="mt-1 text-[11px] font-medium text-muted-foreground">{k.label}</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
