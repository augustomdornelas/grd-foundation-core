import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Building2, HardHat, ClipboardList, Shield, Clock, Award, Mail, Phone, MapPin } from "lucide-react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { WhatsAppFab } from "@/components/site/WhatsAppFab";
import { CookieBanner } from "@/components/site/CookieBanner";
import { GridMotif } from "@/components/brand/GridMotif";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/")({ component: Home });

const servicos = [
  { icon: Building2, title: "Obras Civis", desc: "Execução completa de obras industriais, comerciais e residenciais." },
  { icon: HardHat, title: "Projetos de Engenharia", desc: "Projetos estruturais, hidráulicos e elétricos com precisão técnica." },
  { icon: ClipboardList, title: "Gestão de Obras", desc: "Planejamento, cronograma e controle de qualidade em todas as etapas." },
  { icon: Shield, title: "Consultoria Técnica", desc: "Laudos, perícias e assessoria em engenharia e segurança." },
];

const projetos = [
  { titulo: "Centro Logístico Vale Verde", tipo: "Industrial", img: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=800" },
  { titulo: "Edifício Corporativo Aurora", tipo: "Comercial", img: "https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=800" },
  { titulo: "Condomínio Parque das Águas", tipo: "Residencial", img: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800" },
  { titulo: "Rodovia BR-Sul Trecho 4", tipo: "Infraestrutura", img: "https://images.unsplash.com/photo-1516216628859-9bccecab13ca?w=800" },
  { titulo: "Hospital Regional Norte", tipo: "Saúde", img: "https://images.unsplash.com/photo-1580281657527-47f249e8f4df?w=800" },
  { titulo: "Fábrica AutoTech", tipo: "Industrial", img: "https://images.unsplash.com/photo-1565043666747-69f6646db940?w=800" },
];

const diferenciais = [
  { icon: Shield, title: "Segurança em primeiro lugar", desc: "Protocolos rigorosos de segurança do trabalho em todas as obras." },
  { icon: Clock, title: "Cumprimento de prazos", desc: "Planejamento detalhado e execução disciplinada para entregar no tempo." },
  { icon: Award, title: "Qualidade certificada", desc: "Padrões técnicos elevados e certificações reconhecidas no setor." },
];

function Home() {
  return (
    <div className="min-h-screen bg-white">
      <Header />

      {/* Hero */}
      <section id="inicio" className="relative overflow-hidden bg-[#213368] text-white">
        <div className="grid-motif absolute inset-0" />
        <GridMotif className="absolute -right-10 -top-10" opacity={0.18} />
        <GridMotif className="absolute -left-16 bottom-0" opacity={0.1} />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-20 sm:px-6 md:grid-cols-2 md:py-28">
          <div>
            <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wider uppercase">Grupo GRD Brasil</span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight text-white md:text-5xl lg:text-6xl">
              Engenharia e construção<br />que entregam <span className="text-[#F37032]">segurança</span>.
            </h1>
            <p className="mt-5 max-w-lg text-lg text-white/80">
              Mais de duas décadas construindo o futuro do Brasil com solidez técnica, prazo cumprido e qualidade certificada.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="bg-[#F37032] text-white hover:bg-[#ff8850]" asChild>
                <a href="#contato">Fale com a gente <ArrowRight className="ml-2 h-4 w-4" /></a>
              </Button>
              <Button size="lg" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white hover:text-[#213368]" asChild>
                <a href="#empresa">Conheça a empresa</a>
              </Button>
            </div>
          </div>
          <div className="relative">
            <div className="aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
              <img src="https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1200" alt="Obra em construção" className="h-full w-full object-cover" />
            </div>
            <div className="absolute -bottom-6 -left-6 hidden rounded-xl bg-[#F37032] p-5 text-white shadow-xl md:block">
              <div className="text-3xl font-extrabold">+20</div>
              <div className="text-xs font-semibold uppercase tracking-wider">anos de mercado</div>
            </div>
          </div>
        </div>
      </section>

      {/* Empresa */}
      <section id="empresa" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <span className="text-sm font-semibold uppercase tracking-wider text-[#F37032]">A Empresa</span>
              <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">Solidez, técnica e compromisso.</h2>
              <p className="mt-5 text-muted-foreground">
                O Grupo GRD Brasil atua em obras civis, projetos e gestão de engenharia, com portfólio nacional em setores industrial, comercial, residencial e de infraestrutura. Nossa equipe multidisciplinar entrega soluções completas, do estudo de viabilidade à entrega final da obra.
              </p>
              <p className="mt-4 text-muted-foreground">
                Investimos em pessoas, tecnologia e processos para garantir a excelência que nossos clientes esperam — sempre com segurança e responsabilidade.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                ["+20", "Anos de mercado"],
                ["350+", "Obras entregues"],
                ["120", "Colaboradores"],
                ["18", "Estados atendidos"],
              ].map(([n, l]) => (
                <Card key={l} className="flex flex-col items-start justify-center border p-6">
                  <div className="text-4xl font-extrabold text-[#213368]">{n}</div>
                  <div className="mt-1 text-sm font-medium text-muted-foreground">{l}</div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Serviços */}
      <section id="servicos" className="bg-[#F4F4F4] py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <span className="text-sm font-semibold uppercase tracking-wider text-[#F37032]">Serviços</span>
            <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">Soluções completas em engenharia</h2>
            <p className="mt-4 text-muted-foreground">Atuamos em todo o ciclo do empreendimento: do projeto à entrega.</p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {servicos.map(s => (
              <Card key={s.title} className="group border p-6 transition hover:-translate-y-1 hover:shadow-lg">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#213368] text-white transition group-hover:bg-[#F37032]">
                  <s.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-lg font-bold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Projetos */}
      <section id="projetos" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="text-sm font-semibold uppercase tracking-wider text-[#F37032]">Projetos</span>
              <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">Obras em destaque</h2>
            </div>
            <a href="#" className="text-sm font-semibold text-[#213368] hover:text-[#F37032]">Ver todos →</a>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projetos.map(p => (
              <Card key={p.titulo} className="group overflow-hidden border p-0">
                <div className="aspect-[4/3] overflow-hidden bg-muted">
                  <img src={p.img} alt={p.titulo} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                </div>
                <div className="p-5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#F37032]">{p.tipo}</div>
                  <h3 className="mt-1 text-lg font-bold">{p.titulo}</h3>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Diferenciais */}
      <section className="bg-[#213368] py-20 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <span className="text-sm font-semibold uppercase tracking-wider text-[#F37032]">Diferenciais</span>
            <h2 className="mt-3 text-3xl font-extrabold text-white md:text-4xl">Por que escolher o Grupo GRD</h2>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {diferenciais.map(d => (
              <div key={d.title} className="rounded-xl border border-white/10 bg-white/5 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#F37032]"><d.icon className="h-6 w-6" /></div>
                <h3 className="mt-5 text-lg font-bold text-white">{d.title}</h3>
                <p className="mt-2 text-sm text-white/70">{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contato */}
      <section id="contato" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <span className="text-sm font-semibold uppercase tracking-wider text-[#F37032]">Contato</span>
              <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">Vamos conversar sobre seu projeto</h2>
              <p className="mt-4 text-muted-foreground">Nossa equipe está pronta para entender suas necessidades e propor a melhor solução.</p>
              <ul className="mt-6 space-y-3 text-sm">
                <li className="flex items-center gap-3"><Phone className="h-4 w-4 text-[#F37032]" /> (11) 4000-0000</li>
                <li className="flex items-center gap-3"><Mail className="h-4 w-4 text-[#F37032]" /> contato@grupogrd.com.br</li>
                <li className="flex items-center gap-3"><MapPin className="h-4 w-4 text-[#F37032]" /> Av. Brigadeiro Faria Lima, 1000 — São Paulo, SP</li>
              </ul>
              <div className="mt-6 aspect-[16/9] overflow-hidden rounded-xl border bg-muted">
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Mapa da localização</div>
              </div>
            </div>
            <Card className="border p-6 md:p-8">
              <form className="grid gap-4" onSubmit={(e) => e.preventDefault()}>
                <div className="grid gap-2"><label className="text-sm font-medium">Nome</label><Input placeholder="Seu nome" /></div>
                <div className="grid gap-2 md:grid-cols-2 md:gap-4">
                  <div className="grid gap-2"><label className="text-sm font-medium">E-mail</label><Input type="email" placeholder="voce@empresa.com" /></div>
                  <div className="grid gap-2"><label className="text-sm font-medium">Telefone</label><Input placeholder="(11) 99999-9999" /></div>
                </div>
                <div className="grid gap-2"><label className="text-sm font-medium">Mensagem</label><Textarea rows={5} placeholder="Conte-nos sobre seu projeto..." /></div>
                <Button className="mt-2 bg-[#F37032] text-white hover:bg-[#ff8850]">Enviar mensagem</Button>
              </form>
            </Card>
          </div>
        </div>
      </section>

      <Footer />
      <WhatsAppFab />
      <CookieBanner />
    </div>
  );
}
