// ============================================================
// /trabalhe-conosco — a porta de entrada pública
// ------------------------------------------------------------
// Lista as vagas publicadas. Sem nenhuma publicada, o formulário de
// banco de talentos ocupa o lugar: página de carreiras vazia é pior
// que não ter página — dá a impressão de empresa parada.
//
// A leitura vem de vw_rh_vagas_publicas, que só mostra vaga aprovada
// pela Diretoria e publicada, e zera a faixa salarial quando ela é
// confidencial. Não há caminho daqui para tabela nenhuma.
// ============================================================
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, MapPin, Briefcase, Clock, HardHat, ShieldCheck, Users } from "lucide-react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { WhatsAppFab } from "@/components/site/WhatsAppFab";
import { CookieBanner } from "@/components/site/CookieBanner";
import { GridMotif } from "@/components/brand/GridMotif";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { brl } from "@/lib/formato";
import { TIPO_CONTRATACAO_LABEL, dataBr } from "@/lib/rh-regras";
import { InscricaoForm } from "@/components/site/InscricaoForm";
import { listarVagasPublicas, type VagaPublica } from "@/lib/rh-publico";

export const Route = createFileRoute("/trabalhe-conosco")({
  ssr: false,
  component: TrabalheConosco,
});

const heroImg =
  "https://fpuwyndpmcgwkuaqbcvm.supabase.co/storage/v1/object/public/portfolio/01_hero.jpg";

const motivos = [
  {
    icon: HardHat,
    titulo: "Obra industrial de verdade",
    desc: "Bracell, Dexco, Duratex, Portinari, Frigol. Planta grande, prazo apertado e trabalho que se vê pronto.",
  },
  {
    icon: ShieldCheck,
    titulo: "Segurança não é discurso",
    desc: "ASO em dia, NR válida e EPI entregue antes de pisar na obra. Quem não está regular não entra — nem por um dia.",
  },
  {
    icon: Users,
    titulo: "Time que se conhece",
    desc: "Somos de 11 a 50 diretos. Aqui o encarregado sabe seu nome e o engenheiro atende o telefone.",
  },
];

function TrabalheConosco() {
  const [vagas, setVagas] = useState<VagaPublica[] | null>(null);

  useEffect(() => {
    let vivo = true;
    void listarVagasPublicas().then((v) => {
      if (vivo) setVagas(v);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const carregando = vagas === null;
  const temVaga = (vagas?.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-white">
      <Header />

      {/* ---------------- Hero ---------------- */}
      <section className="relative overflow-hidden bg-[#213368]">
        <img
          src={heroImg}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-25"
        />
        <GridMotif className="absolute inset-0 opacity-20" />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-[#F37032]">
            Trabalhe conosco
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight text-white sm:text-5xl">
            Construir indústria é trabalho de gente que sabe o que está fazendo.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/85">
            A GRD constrói e mantém plantas industriais em Agudos e região desde 2011. Se você é da
            obra — ou quer ser — deixe seu currículo com a gente.
          </p>
          {temVaga && (
            <Button
              asChild
              size="lg"
              className="mt-8 bg-[#F37032] font-semibold text-white hover:bg-[#ff8850]"
            >
              <a href="#vagas">
                Ver {vagas?.length} {vagas?.length === 1 ? "vaga aberta" : "vagas abertas"}
                <ArrowRight className="ml-2 h-5 w-5" />
              </a>
            </Button>
          )}
        </div>
      </section>

      {/* ---------------- Por que a GRD ---------------- */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-6 md:grid-cols-3">
          {motivos.map((m) => (
            <Card key={m.titulo} className="p-6">
              <m.icon className="mb-3 h-8 w-8 text-[#F37032]" />
              <h3 className="text-lg font-bold text-[#213368]">{m.titulo}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{m.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------------- Vagas ---------------- */}
      <section id="vagas" className="bg-[#F4F4F4] py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-3xl font-bold text-[#213368]">
            {carregando
              ? "Vagas abertas"
              : temVaga
                ? "Vagas abertas"
                : "Não temos vaga aberta agora"}
          </h2>

          {carregando ? (
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-40 animate-pulse rounded-2xl bg-white" />
              ))}
            </div>
          ) : temVaga ? (
            <>
              <p className="mt-2 text-muted-foreground">
                Clique na vaga para ver os detalhes e se candidatar. Leva menos de cinco minutos.
              </p>
              <div className="mt-8 grid gap-4 md:grid-cols-2">
                {vagas!.map((v) => (
                  <Link
                    key={v.id}
                    to="/vagas/$slug"
                    params={{ slug: v.slug }}
                    className="group rounded-2xl border bg-white p-6 shadow-sm transition hover:border-[#F37032] hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-xl font-bold text-[#213368] group-hover:text-[#F37032]">
                        {v.titulo}
                      </h3>
                      <span className="shrink-0 rounded-full bg-[#213368]/10 px-2.5 py-1 text-[11px] font-semibold text-[#213368]">
                        {TIPO_CONTRATACAO_LABEL[v.tipoContratacao] ?? v.tipoContratacao}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                      {(v.cidade || v.localTrabalho) && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-4 w-4" />
                          {v.localTrabalho || `${v.cidade}${v.uf ? `/${v.uf}` : ""}`}
                        </span>
                      )}
                      {v.quantidadePosicoes > 1 && (
                        <span className="inline-flex items-center gap-1.5">
                          <Briefcase className="h-4 w-4" />
                          {v.quantidadePosicoes} vagas
                        </span>
                      )}
                      {v.jornada && (
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-4 w-4" />
                          {v.jornada}
                        </span>
                      )}
                    </div>

                    {!v.salarioConfidencial && (v.faixaSalarialMin || v.faixaSalarialMax) && (
                      <p className="mt-3 text-sm font-semibold text-[#213368]">
                        {brl(v.faixaSalarialMin)}
                        {v.faixaSalarialMax ? ` a ${brl(v.faixaSalarialMax)}` : ""}
                      </p>
                    )}

                    {v.descricao && (
                      <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                        {v.descricao}
                      </p>
                    )}

                    <p className="mt-4 inline-flex items-center text-sm font-semibold text-[#F37032]">
                      Ver a vaga <ArrowRight className="ml-1.5 h-4 w-4" />
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Publicada em {dataBr(v.dataAbertura)}
                    </p>
                  </Link>
                ))}
              </div>

              <div className="mt-12 border-t pt-10">
                <h3 className="text-2xl font-bold text-[#213368]">Nenhuma serve para você?</h3>
                <p className="mt-1.5 max-w-2xl text-muted-foreground">
                  Deixe seu currículo no banco de talentos. Quando abrir uma vaga do seu perfil, a
                  gente chama.
                </p>
                <div className="mt-6 max-w-3xl">
                  <InscricaoForm vagaSlug={null} />
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Mas a obra muda toda hora por aqui. Deixe seu currículo: assim que abrir uma vaga do
                seu perfil, você é um dos primeiros a saber.
              </p>
              <div className="mt-8 max-w-3xl">
                <InscricaoForm vagaSlug={null} />
              </div>
            </>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 text-center sm:px-6">
        <p className="text-sm text-muted-foreground">
          Já se candidatou?{" "}
          <Link to="/candidato" className="font-semibold text-[#F37032] underline">
            Acompanhe seu processo aqui
          </Link>
          .
        </p>
      </section>

      <Footer />
      <WhatsAppFab />
      <CookieBanner />
    </div>
  );
}
