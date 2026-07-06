import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { Plus, ArrowRight } from "lucide-react";
import { projetos } from "@/lib/mock-data";

export const Route = createFileRoute("/app/projetos")({ component: ProjetosList });

function ProjetosList() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-[#213368]">Todos os projetos</h3>
          <p className="text-xs text-muted-foreground">Acompanhe o andamento das obras e o desempenho financeiro.</p>
        </div>
        <Button className="bg-[#F37032] text-white hover:bg-[#ff8850]"><Plus className="mr-1 h-4 w-4" /> Novo projeto</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projetos.map(p => (
          <Card key={p.id} className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#F37032]">{p.id}</div>
                <div className="mt-1 truncate text-base font-bold text-[#213368]">{p.nome}</div>
                <div className="text-xs text-muted-foreground">{p.cliente}</div>
              </div>
              <StatusBadge status={p.status} />
            </div>
            <div className="mt-5 space-y-3">
              <div>
                <div className="mb-1 flex justify-between text-xs font-medium"><span>Progresso</span><span>{p.progresso}%</span></div>
                <Progress value={p.progresso} />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs font-medium"><span>Financeiro realizado</span><span>{p.financeiro}%</span></div>
                <Progress value={p.financeiro} />
              </div>
            </div>
            <Link to="/app/projetos/$id" params={{ id: p.id }} className="mt-5 inline-flex items-center text-sm font-semibold text-[#213368] hover:text-[#F37032]">
              Ver detalhe <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
