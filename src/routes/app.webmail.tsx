import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { ExternalLink } from "lucide-react";

export const Route = createFileRoute("/app/webmail")({ component: Webmail });

function Webmail() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
      <Logo size={80} />
      <p className="max-w-md text-lg text-muted-foreground">
        Acesse o e-mail corporativo do Grupo GRD
      </p>
      <Button
        size="lg"
        className="bg-[#F37032] text-white hover:bg-[#ff8850]"
        onClick={() => window.open("https://grupogrdbrasil.com.br:2096/", "_blank", "noopener,noreferrer")}
      >
        <ExternalLink className="mr-2 h-5 w-5" />
        Abrir meu e-mail
      </Button>
    </div>
  );
}
