// ============================================================
// /app/integracoes/contaazul — o OAuth, desligado
// ------------------------------------------------------------
// A conexão com a Conta Azul é OAuth2: o Portal manda o usuário ao
// autorizador da Conta Azul, recebe um code de volta na redirect_uri e
// troca esse code por um par de tokens. Nada disso existe ainda — o
// app não foi criado no portal do desenvolvedor, então não há
// client_id nem client_secret para pôr em lugar nenhum.
//
// Esta tela sobe assim mesmo, desligada, porque é ela que mostra a
// redirect_uri exata que precisa ser cadastrada lá. Cadastrar o
// endereço errado é o erro mais comum desse fluxo, e ele só aparece
// no fim, como um `redirect_uri_mismatch` sem explicação.
//
// O client_secret não aparece aqui e não vai aparecer: ele mora no
// servidor, e uma tela que o exibisse o entregaria a qualquer um com
// acesso ao Admin.
// ============================================================
import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Info, Link2 } from "lucide-react";
import { LinhaEmBreve, TelaModulo } from "@/components/portal/TelaModulo";

export const Route = createFileRoute("/app/integracoes/contaazul")({
  ssr: false,
  component: IntegracaoContaAzul,
});

/** O endereço para onde a Conta Azul devolve o usuário com o code. Sai
 *  da origem em que o Portal está rodando para que homologação e
 *  produção mostrem cada uma a sua — cadastrar a do outro ambiente é
 *  exatamente o erro que esta tela existe para evitar. */
function redirectUri() {
  if (typeof window === "undefined") return "/app/integracoes/contaazul/callback";
  return `${window.location.origin}/app/integracoes/contaazul/callback`;
}

function IntegracaoContaAzul() {
  return (
    <TelaModulo
      titulo="Conta Azul"
      resumo="A conexão que vai alimentar o módulo Financeiro com os títulos a receber e a pagar. Ainda não está ligada."
      perm="admin"
    >
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-bold text-[#213368]">Conexão OAuth</h3>
          <Badge variant="secondary">Não conectado</Badge>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          A autorização é feita uma vez, por uma conta da Conta Azul com acesso ao financeiro. O
          Portal guarda os tokens no servidor e os renova sozinho — ninguém precisa repetir este
          passo todo dia.
        </p>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="client_id">client_id</Label>
            <Input
              id="client_id"
              readOnly
              value=""
              placeholder="Ainda não gerado"
              className="bg-muted/50 font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Sai do cadastro do app no portal do desenvolvedor da Conta Azul.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="redirect_uri">redirect_uri</Label>
            <Input
              id="redirect_uri"
              readOnly
              value={redirectUri()}
              className="bg-muted/50 font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Tem que ser cadastrada na Conta Azul exatamente assim, caractere por caractere.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button disabled className="bg-[#F37032] text-white hover:bg-[#ff8850]">
            <Link2 className="mr-1.5 h-4 w-4" /> Conectar com a Conta Azul
          </Button>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0" />
            Aguardando credenciais do app no portal do desenvolvedor
          </span>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-bold text-[#213368]">Últimas sincronizações</h3>
          <p className="text-xs text-muted-foreground">
            Uma linha por execução, com o que entrou e o que falhou.
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>O que</TableHead>
                <TableHead className="text-right">Registros</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <LinhaEmBreve colunas={4} />
            </TableBody>
          </Table>
        </div>
      </Card>
    </TelaModulo>
  );
}
