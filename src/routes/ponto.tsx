// ============================================================
// /ponto — bater ponto sem sair do domínio da GRD
// ------------------------------------------------------------
// Rota pública, de propósito: quem bate ponto é o pessoal de campo, e
// eles não têm conta no Portal. O login que aparece aqui é o da
// Secullum — a GRD não vê nem guarda essa senha.
//
// Isto é a integração "A" do levantamento: script pronto, sem API,
// sem token e sem plano PRO. A integração de verdade (cadastro e
// batidas via API) é outra coisa e depende de credenciais.
// ============================================================
import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, ShieldCheck, Smartphone } from "lucide-react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { CookieBanner } from "@/components/site/CookieBanner";
import { Card } from "@/components/ui/card";
import { SecullumLogin } from "@/components/site/SecullumLogin";

export const Route = createFileRoute("/ponto")({ ssr: false, component: PontoPublico });

function PontoPublico() {
  return (
    <div className="flex min-h-screen flex-col bg-[#F4F4F4]">
      <Header />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#213368]/10">
            <Clock className="h-6 w-6 text-[#213368]" />
          </span>
          <h1 className="text-3xl font-bold text-[#213368]">Bater ponto</h1>
          <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
            Entre com o mesmo usuário e senha do Ponto Web. Se você ainda não tem acesso, fale com o
            RH.
          </p>
        </div>

        <Card className="p-5 sm:p-7">
          <SecullumLogin />
        </Card>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Aviso
            icone={Smartphone}
            texto="Funciona no celular, na tela da obra ou no computador do escritório."
          />
          <Aviso
            icone={ShieldCheck}
            texto="O login é da Secullum. A GRD não vê nem guarda a sua senha."
          />
          <Aviso
            icone={Clock}
            texto="Espelho de ponto, saldo de horas e justificativas ficam dentro do Ponto Web."
          />
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Procurando vagas?{" "}
          <Link to="/trabalhe-conosco" className="font-semibold text-[#F37032] underline">
            Trabalhe conosco
          </Link>
          .
        </p>
      </main>

      <Footer />
      <CookieBanner />
    </div>
  );
}

function Aviso({ icone: Icone, texto }: { icone: typeof Clock; texto: string }) {
  return (
    <div className="flex gap-2.5 rounded-lg bg-white p-3">
      <Icone className="mt-0.5 h-4 w-4 shrink-0 text-[#F37032]" />
      <p className="text-xs text-muted-foreground">{texto}</p>
    </div>
  );
}
