// ============================================================
// /app/financeiro — visão geral do financeiro
// ------------------------------------------------------------
// Casca visual, sem consulta nenhuma: os números do Financeiro moram
// na Conta Azul, e enquanto a integração não existe esta tela não tem
// de onde tirá-los. Ela sobe agora para que o item do menu leve a
// alguma coisa — item de menu que abre página em branco é pior do que
// item de menu que não existe.
//
// Os rótulos dos cards são os que a tela vai ter de verdade. Quando o
// dado chegar, é só trocar o traço pelo número; nada aqui muda de
// lugar.
// ============================================================
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowRight } from "lucide-react";
import { CardVazio, LinhaEmBreve, TelaModulo } from "@/components/portal/TelaModulo";

export const Route = createFileRoute("/app/financeiro/")({ component: VisaoGeralFinanceiro });

function VisaoGeralFinanceiro() {
  return (
    <TelaModulo
      titulo="Visão geral do financeiro"
      resumo="Contas a receber, contas a pagar e o saldo previsto do período. Os lançamentos são os da Conta Azul — o Portal lê, não digita."
      perm="financeiro"
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CardVazio rotulo="A receber no mês" />
        <CardVazio rotulo="A pagar no mês" />
        <CardVazio rotulo="Vencidos" />
        <CardVazio rotulo="Saldo previsto" />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-[#213368]">Próximos vencimentos</h3>
            <p className="text-xs text-muted-foreground">
              As duas pontas na mesma lista, na ordem em que vencem.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/app/financeiro/receber">
                Contas a receber <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/app/financeiro/pagar">
                Contas a pagar <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vencimento</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Cliente / Fornecedor</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <LinhaEmBreve colunas={5} />
            </TableBody>
          </Table>
        </div>
      </Card>
    </TelaModulo>
  );
}
