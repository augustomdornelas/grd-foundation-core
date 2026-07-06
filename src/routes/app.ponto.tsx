import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { ExternalLink } from "lucide-react";

export const Route = createFileRoute("/app/ponto")({ component: Ponto });

function Ponto() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
      <Logo size={80} />
      <p className="max-w-md text-lg text-muted-foreground">
        Acesse o controle de ponto do Grupo GRD
      </p>
      <Button
        size="lg"
        className="bg-[#F37032] text-white hover:bg-[#ff8850]"
        onClick={() => window.open("https://pontoweb.secullum.com.br/#/home", "_blank", "noopener,noreferrer")}
      >
        <ExternalLink className="mr-2 h-5 w-5" />
        Abrir controle de ponto
      </Button>
    </div>
  );
}
