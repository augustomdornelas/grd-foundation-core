// ============================================================
// /app/financeiro/pagar — contas a pagar
// ------------------------------------------------------------
// Irmã de /receber, com as colunas viradas para o fornecedor. Casca
// visual: nenhuma consulta até a integração com a Conta Azul entrar.
// ============================================================
import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CardVazio, LinhaEmBreve, TelaModulo } from "@/components/portal/TelaModulo";

export const Route = createFileRoute("/app/financeiro/pagar")({ component: ContasAPagar });

function ContasAPagar() {
  return (
    <TelaModulo
      titulo="Contas a pagar"
      resumo="O que o Grupo tem a pagar, por fornecedor e por vencimento. O pagamento continua sendo feito na Conta Azul; aqui só se acompanha."
      perm="financeiro"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <CardVazio rotulo="A vencer" />
        <CardVazio rotulo="Vencido" />
        <CardVazio rotulo="Pago no mês" />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-bold text-[#213368]">Títulos em aberto</h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <LinhaEmBreve colunas={6} />
            </TableBody>
          </Table>
        </div>
      </Card>
    </TelaModulo>
  );
}
