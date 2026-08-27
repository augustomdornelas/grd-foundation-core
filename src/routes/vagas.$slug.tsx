// ============================================================
// /vagas/:slug — a vaga aberta e o formulário de inscrição
// ------------------------------------------------------------
// A faixa salarial só aparece quando a vaga não é confidencial — e
// não é a tela que decide isso: a view vw_rh_vagas_publicas devolve
// null nesse caso, então o valor nem chega ao navegador.
//
// Vaga despublicada ou encerrada some da view, e esta página passa a
// mostrar "não está mais aberta" com o caminho para o banco de
// talentos. Ninguém cai num 404 seco depois de clicar num link
// compartilhado no WhatsApp.
// ============================================================
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, MapPin, Briefcase, Clock, CalendarDays, Share2, Check } from "lucide-react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { WhatsAppFab } from "@/components/site/WhatsAppFab";
import { CookieBanner } from "@/components/site/CookieBanner";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/formato";
import { TIPO_CONTRATACAO_LABEL, dataBr } from "@/lib/rh-regras";
import { InscricaoForm } from "@/components/site/InscricaoForm";
import { vagaPorSlug, type VagaPublica } from "@/lib/rh-publico";

export const Route = createFileRoute("/vagas/$slug")({ ssr: false, component: VagaPublicaPage });

function Bloco({ titulo, texto }: { titulo: string; texto: string }) {
  if (!texto.trim()) return null;
  return (
    <section className="border-t pt-6">
      <h2 className="text-lg font-bold text-[#213368]">{titulo}</h2>
      <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/85">
        {texto}
      </p>
    </section>
  );
}

function VagaPublicaPage() {
  const { slug } = Route.useParams();
  const [vaga, setVaga] = useState<VagaPublica | null | undefined>(undefined);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vivo = true;
    setVaga(undefined);
    void vagaPorSlug(slug).then((v) => {
      if (vivo) setVaga(v);
    });
    return () => {
      vivo = false;
    };
  }, [slug]);

  async function compartilhar() {
    const url = window.location.href;
    // navigator.share é o caminho natural no celular, que é onde este
    // link circula; no desktop cai para copiar.
    if (navigator.share) {
      try {
        await navigator.share({ title: vaga?.titulo ?? "Vaga na GRD", url });
        return;
      } catch {
        /* usuário cancelou — segue para o copiar */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* sem permissão de área de transferência: nada a fazer */
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <Link
          to="/trabalhe-conosco"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-[#F37032]"
        >
          <ArrowLeft className="h-4 w-4" /> Todas as vagas
        </Link>

        {vaga === undefined ? (
          <div className="mt-8 space-y-4">
            <div className="h-10 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-5 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-48 animate-pulse rounded-2xl bg-muted" />
          </div>
        ) : vaga === null ? (
          <div className="mt-10 rounded-2xl border bg-muted/30 p-10 text-center">
            <h1 className="text-2xl font-bold text-[#213368]">Esta vaga não está mais aberta</h1>
            <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
              Ela pode ter sido preenchida ou encerrada. Mas a obra muda toda hora por aqui — deixe
              seu currículo no banco de talentos e a gente chama quando abrir uma do seu perfil.
            </p>
            <Button asChild className="mt-6 bg-[#F37032] text-white hover:bg-[#ff8850]">
              <Link to="/trabalhe-conosco">Ver vagas abertas e deixar currículo</Link>
            </Button>
          </div>
        ) : (
          <>
            <header className="mt-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-bold leading-tight text-[#213368] sm:text-4xl">
                    {vaga.titulo}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {vaga.codigo} · publicada em {dataBr(vaga.dataAbertura)}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={compartilhar}>
                  {copiado ? (
                    <Check className="mr-1.5 h-4 w-4" />
                  ) : (
                    <Share2 className="mr-1.5 h-4 w-4" />
                  )}
                  {copiado ? "Link copiado" : "Compartilhar"}
                </Button>
              </div>

              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Briefcase className="h-4 w-4" />
                  {TIPO_CONTRATACAO_LABEL[vaga.tipoContratacao] ?? vaga.tipoContratacao}
                  {vaga.quantidadePosicoes > 1 ? ` · ${vaga.quantidadePosicoes} vagas` : ""}
                </span>
                {(vaga.localTrabalho || vaga.cidade) && (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {vaga.localTrabalho || `${vaga.cidade}${vaga.uf ? `/${vaga.uf}` : ""}`}
                  </span>
                )}
                {vaga.jornada && (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {vaga.jornada}
                  </span>
                )}
                {vaga.dataPrevistaInicio && (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <CalendarDays className="h-4 w-4" />
                    Início previsto em {dataBr(vaga.dataPrevistaInicio)}
                  </span>
                )}
              </div>

              {!vaga.salarioConfidencial && (vaga.faixaSalarialMin || vaga.faixaSalarialMax) && (
                <p className="mt-4 inline-block rounded-lg bg-[#213368]/5 px-4 py-2 text-lg font-bold text-[#213368]">
                  {brl(vaga.faixaSalarialMin)}
                  {vaga.faixaSalarialMax ? ` a ${brl(vaga.faixaSalarialMax)}` : ""}
                </p>
              )}
            </header>

            <div className="mt-8 space-y-6">
              <Bloco titulo="Sobre a vaga" texto={vaga.descricao} />
              <Bloco titulo="Requisitos" texto={vaga.requisitos} />
              <Bloco titulo="Diferenciais" texto={vaga.diferenciais} />
              <Bloco titulo="Benefícios" texto={vaga.beneficios} />
            </div>

            <div id="candidatar" className="mt-12 border-t pt-10">
              <h2 className="text-2xl font-bold text-[#213368]">Candidate-se</h2>
              <p className="mt-1.5 text-muted-foreground">
                Leva menos de cinco minutos. Dá para fazer pelo celular.
              </p>
              <div className="mt-6">
                <InscricaoForm
                  vagaSlug={vaga.slug}
                  vagaTitulo={vaga.titulo}
                  cargoSugerido={vaga.titulo}
                />
              </div>
            </div>
          </>
        )}
      </div>

      <Footer />
      <WhatsAppFab />
      <CookieBanner />
    </div>
  );
}
