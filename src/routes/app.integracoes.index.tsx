// ============================================================
// /app/integracoes — o que o Portal conversa com o mundo de fora
// ------------------------------------------------------------
// Uma lista, e não um painel: cada card diz o nome do sistema, em que
// pé está a conexão e leva para a tela que cuida dela. Quem abre esta
// página quer saber se está ligado, não quantas requisições foram.
//
// O Secullum aponta para /app/ponto/integracao, e não para o endereço
// antigo /app/rh/integracoes/secullum: aquele virou um redirecionador
// quando o Ponto saiu de dentro do RH, e mandar um link novo para um
// redirecionador é fazer o usuário pular duas vezes para chegar no
// mesmo lugar.
// ============================================================
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, Wallet } from "lucide-react";
import { TelaModulo } from "@/components/portal/TelaModulo";

type Integracao = {
  nome: string;
  descricao: string;
  icone: typeof Wallet;
  to: "/app/integracoes/contaazul" | "/app/ponto/integracao";
  status: string;
  ativa: boolean;
};

const INTEGRACOES: Integracao[] = [
  {
    nome: "Conta Azul",
    descricao:
      "Contas a receber, contas a pagar e o plano de contas. É dela que o módulo Financeiro vai ler.",
    icone: Wallet,
    to: "/app/integracoes/contaazul",
    status: "Não conectado",
    ativa: false,
  },
  {
    nome: "Secullum Ponto Web",
    descricao:
      "Batidas, totais e o cadastro de funcionários do relógio de ponto, sincronizados de madrugada.",
    icone: Clock,
    to: "/app/ponto/integracao",
    status: "Ativo",
    ativa: true,
  },
];

export const Route = createFileRoute("/app/integracoes/")({ component: Integracoes });

function Integracoes() {
  return (
    <TelaModulo
      titulo="Integrações"
      resumo="Os sistemas de fora com que o Portal conversa. Cada um tem a sua tela, com as credenciais e o estado da última sincronização."
      perm="admin"
    >
      <div className="grid gap-3 md:grid-cols-2">
        {INTEGRACOES.map((it) => (
          <Card key={it.nome} className="flex flex-col gap-3 p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#213368]/10">
                <it.icone className="h-5 w-5 text-[#213368]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold text-[#213368]">{it.nome}</h3>
                  <Badge
                    variant={it.ativa ? "default" : "secondary"}
                    className={it.ativa ? "bg-emerald-600 hover:bg-emerald-600/80" : ""}
                  >
                    {it.status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{it.descricao}</p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm" className="self-start">
              <Link to={it.to}>
                {it.ativa ? "Ver integração" : "Configurar"}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </Card>
        ))}
      </div>
    </TelaModulo>
  );
}
