// ============================================================
// /app/financeiro/receber — contas a receber
// ------------------------------------------------------------
// Casca visual. As colunas já são as definitivas para que a conversa
// sobre o que a integração precisa trazer aconteça olhando a tela, e
// não um documento.
// ============================================================
import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CardVazio, LinhaEmBreve, TelaModulo } from "@/components/portal/TelaModulo";

export const Route = createFileRoute("/app/financeiro/receber")({ component: ContasAReceber });

function ContasAReceber() {
  return (
    <TelaModulo
      titulo="Contas a receber"
      resumo="O que o Grupo tem a receber, por cliente e por vencimento. A baixa continua sendo dada na Conta Azul; aqui só se acompanha."
      perm="financeiro"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <CardVazio rotulo="A vencer" />
        <CardVazio rotulo="Vencido" />
        <CardVazio rotulo="Recebido no mês" />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-bold text-[#213368]">Títulos em aberto</h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
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
