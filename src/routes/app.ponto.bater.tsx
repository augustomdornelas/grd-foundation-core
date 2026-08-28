// ============================================================
// /app/ponto/bater — o mesmo ponto, dentro do Portal
// ------------------------------------------------------------
// Antes esta tela só tinha um botão que abria o Ponto Web em outra
// aba. Agora o formulário de login aparece aqui mesmo, pelo script da
// Secullum — quem está no Portal não precisa mais trocar de site para
// bater o ponto. O botão para abrir lá fora continua, como saída
// alternativa.
//
// A mesma tela existe em /ponto, pública, para o pessoal de campo que
// não tem conta no Portal.
//
// Morava em /app/ponto até o Ponto virar módulo próprio. Aquele
// endereço continua funcionando: /app/ponto agora é o layout do grupo
// e o índice redireciona para cá.
// ============================================================
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import { SecullumLogin } from "@/components/site/SecullumLogin";

export const Route = createFileRoute("/app/ponto/bater")({ component: Ponto });

function Ponto() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-xl font-bold text-[#213368]">Controle de ponto</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Entre com o seu usuário do Ponto Web. O login é da Secullum — a GRD não vê a sua senha.
        </p>
      </div>

      <Card className="p-5 sm:p-6">
        <SecullumLogin />
      </Card>

      <div className="text-center">
        <Button
          variant="outline"
          onClick={() =>
            window.open("https://pontoweb.secullum.com.br/#/home", "_blank", "noopener,noreferrer")
          }
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Abrir o Ponto Web em outra aba
        </Button>
      </div>
    </div>
  );
}
