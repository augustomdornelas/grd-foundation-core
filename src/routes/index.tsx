import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Building2, HardHat, Wrench, Factory, Mountain, Cog, Shield, Clock, Award, Sparkles, Mail, Phone, MapPin, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { WhatsAppFab } from "@/components/site/WhatsAppFab";
import { CookieBanner } from "@/components/site/CookieBanner";
import { GridMotif } from "@/components/brand/GridMotif";
import { Reveal, CountUp } from "@/components/site/Reveal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/")({ component: Home });

const servicos = [
  { icon: Building2, title: "Obras civis industriais", desc: "Execução de fundações, estruturas de concreto e obras civis dentro de plantas industriais." },
  { icon: HardHat, title: "Montagem de estruturas metálicas", desc: "Fabricação, transporte e montagem de estruturas metálicas de todos os portes." },
  { icon: Factory, title: "Galpões e plantas industriais", desc: "Projeto e execução completa de galpões, unidades fabris e plantas industriais." },
  { icon: Cog, title: "Montagem eletromecânica", desc: "Instalação de equipamentos, tubulações, elétrica e automação industrial." },
  { icon: Mountain, title: "Terraplenagem e infraestrutura", desc: "Movimentação de terra, drenagem, pavimentação e infraestrutura de acesso." },
  { icon: Wrench, title: "Manutenção industrial", desc: "Serviços de manutenção preventiva e corretiva em unidades industriais em operação." },
];

const projetos = [
  { titulo: "Planta fabril multissetor", tipo: "Planta industrial", img: "https://images.unsplash.com/photo-1565043666747-69f6646db940?w=1000" },
  { titulo: "Galpão logístico de alto padrão", tipo: "Galpão logístico", img: "https://images.unsplash.com/photo-1553413077-190dd305871c?w=1000" },
  { titulo: "Nova unidade industrial", tipo: "Unidade industrial", img: "https://images.unsplash.com/photo-1581091870622-1e7e2a1f0f9f?w=1000" },
  { titulo: "Ampliação de fábrica", tipo: "Ampliação de fábrica", img: "https://images.unsplash.com/photo-1581093588401-fbb62a02f120?w=1000" },
];

const diferenciais = [
  { icon: Sparkles, title: "Especialização industrial", desc: "Mais de 14 anos dedicados exclusivamente ao segmento industrial." },
  { icon: Shield, title: "Segurança", desc: "Rigor absoluto com normas técnicas e NRs em todas as frentes de obra." },
  { icon: Clock, title: "Prazo", desc: "Compromisso com o cronograma, do primeiro serviço à entrega final." },
  { icon: Award, title: "Qualidade e solidez", desc: "Padrões técnicos elevados e execução com solidez comprovada." },
];

const contatoSchema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome").max(100),
  email: z.string().trim().email("E-mail inválido").max(255),
  telefone: z.string().trim().min(8, "Telefone inválido").max(20),
  mensagem: z.string().trim().min(10, "Descreva um pouco mais").max(1000),
});

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Home() {
  const [parallax, setParallax] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const onScroll = () => setParallax(window.scrollY * 0.15);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Header />

      {/* Hero */}
      <section id="inicio" className="relative overflow-hidden bg-[#213368] text-white">
        <div className="grid-motif absolute inset-0" style={{ transform: `translateY(${parallax}px)` }} />
        <GridMotif className="absolute -right-10 -top-10" opacity={0.18} />
        <GridMotif className="absolute -left-16 bottom-0" opacity={0.1} />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-20 sm:px-6 md:grid-cols-2 md:py-28">
          <div>
            <Reveal>
              <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
                Grupo GRD
              </span>
            </Reveal>
            <Reveal delay={120}>
              <h1 className="mt-5 text-4xl font-extrabold leading-tight text-white md:text-5xl lg:text-6xl">
                Especialistas em <span className="text-[#F37032]">obras industriais</span> há mais de 14 anos
              </h1>
            </Reveal>
            <Reveal delay={260}>
              <p className="mt-5 max-w-lg text-lg text-white/80">
                O Grupo GRD executa projetos industriais com segurança, qualidade e cumprimento de prazo — do início da obra à entrega.
              </p>
            </Reveal>
            <Reveal delay={380}>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" className="bg-[#F37032] text-white transition hover:bg-[#ff8850] hover:-translate-y-0.5" onClick={() => scrollToId("contato")}>
                  Fale com o comercial <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" className="border-white/40 bg-transparent text-white transition hover:bg-white hover:text-[#213368]" onClick={() => scrollToId("projetos")}>
                  Conheça nossas obras
                </Button>
              </div>
            </Reveal>
          </div>
          <Reveal delay={200} className="relative">
            <div className="aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
              <img src="https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200" alt="Obra industrial em execução" className="h-full w-full object-cover" loading="eager" />
            </div>
            <div className="absolute -bottom-6 -left-6 hidden rounded-xl bg-[#F37032] p-5 text-white shadow-xl md:block">
              <div className="text-3xl font-extrabold">+14</div>
              <div className="text-xs font-semibold uppercase tracking-wider">anos de mercado</div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Indicadores */}
      <section className="border-b bg-white py-12">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 sm:px-6 md:grid-cols-4">
          {[
            { n: 14, suf: "+", label: "anos de mercado" },
            { n: 100, suf: "%", label: "foco industrial" },
            { n: 350, suf: "+", label: "obras industriais entregues" },
            { n: 80, suf: "+", label: "clientes atendidos" },
          ].map((k, i) => (
            <Reveal key={k.label} delay={i * 100} className="text-center md:text-left">
              <div className="text-4xl font-extrabold text-[#213368] md:text-5xl">
                <CountUp end={k.n} suffix={k.suf} />
              </div>
              <div className="mt-2 text-sm font-medium text-muted-foreground">{k.label}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Empresa */}
      <section id="empresa" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-10 md:grid-cols-2 md:items-center">
            <Reveal>
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl">
                <img src="https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=1000" alt="Equipe do Grupo GRD em obra industrial" className="h-full w-full object-cover" />
              </div>
            </Reveal>
            <Reveal delay={150}>
              <span className="text-sm font-semibold uppercase tracking-wider text-[#F37032]">A Empresa</span>
              <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">Foco total em obras industriais</h2>
              <p className="mt-5 text-muted-foreground">
                Há mais de 14 anos, o Grupo GRD é referência em construção industrial. Atuamos exclusivamente no segmento industrial, o que nos permite dominar cada detalhe desse tipo de obra — dos requisitos técnicos e normas de segurança ao rigor com prazos e orçamentos.
              </p>
              <p className="mt-4 text-muted-foreground">
                Cada projeto é conduzido com planejamento, equipe qualificada e o compromisso de entregar com solidez e confiança.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Serviços */}
      <section id="servicos" className="bg-[#F4F4F4] py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="max-w-2xl">
            <span className="text-sm font-semibold uppercase tracking-wider text-[#F37032]">Soluções</span>
            <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">Serviços voltados 100% ao industrial</h2>
            <p className="mt-4 text-muted-foreground">Cobrimos toda a cadeia de execução de uma obra industrial — do movimento de terra à entrega da planta em operação.</p>
          </Reveal>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {servicos.map((s, i) => (
              <Reveal key={s.title} delay={i * 80}>
                <Card className="group h-full border p-6 transition duration-300 hover:-translate-y-1 hover:shadow-xl">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#213368] text-white transition group-hover:bg-[#F37032]">
                    <s.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-lg font-bold">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Projetos */}
      <section id="projetos" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <span className="text-sm font-semibold uppercase tracking-wider text-[#F37032]">Projetos</span>
                <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">Obras industriais em destaque</h2>
              </div>
            </div>
          </Reveal>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {projetos.map((p, i) => (
              <Reveal key={p.titulo} delay={i * 100}>
                <Card className="group h-full overflow-hidden border p-0 transition duration-300 hover:-translate-y-1 hover:shadow-xl">
                  <div className="aspect-[4/3] overflow-hidden bg-muted">
                    <img src={p.img} alt={p.titulo} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                  </div>
                  <div className="p-5">
                    <div className="text-xs font-semibold uppercase tracking-wider text-[#F37032]">{p.tipo}</div>
                    <h3 className="mt-1 text-base font-bold">{p.titulo}</h3>
                  </div>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Diferenciais */}
      <section className="relative overflow-hidden bg-[#213368] py-20 text-white">
        <GridMotif className="absolute -right-16 top-0" opacity={0.12} />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="max-w-2xl">
            <span className="text-sm font-semibold uppercase tracking-wider text-[#F37032]">Diferenciais</span>
            <h2 className="mt-3 text-3xl font-extrabold text-white md:text-4xl">Por que escolher o Grupo GRD</h2>
          </Reveal>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {diferenciais.map((d, i) => (
              <Reveal key={d.title} delay={i * 100}>
                <div className="h-full rounded-xl border border-white/10 bg-white/5 p-6 transition duration-300 hover:-translate-y-1 hover:bg-white/10">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#F37032]"><d.icon className="h-6 w-6" /></div>
                  <h3 className="mt-5 text-lg font-bold text-white">{d.title}</h3>
                  <p className="mt-2 text-sm text-white/70">{d.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Contato */}
      <section id="contato" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-10 md:grid-cols-2">
            <Reveal>
              <span className="text-sm font-semibold uppercase tracking-wider text-[#F37032]">Contato</span>
              <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">Vamos conversar sobre seu projeto industrial</h2>
              <p className="mt-4 text-muted-foreground">Nossa equipe comercial está pronta para entender seu projeto e propor a melhor solução.</p>
              <ul className="mt-6 space-y-3 text-sm">
                <li className="flex items-center gap-3"><Phone className="h-4 w-4 text-[#F37032]" /> (11) 4000-0000</li>
                <li className="flex items-center gap-3"><Mail className="h-4 w-4 text-[#F37032]" /> contato@grupogrd.com.br</li>
                <li className="flex items-center gap-3"><MapPin className="h-4 w-4 text-[#F37032]" /> São Paulo, SP</li>
              </ul>
            </Reveal>
            <Reveal delay={150}>
              <ContatoForm />
            </Reveal>
          </div>
        </div>
      </section>

      <Footer />
      <WhatsAppFab />
      <CookieBanner />
    </div>
  );
}

function ContatoForm() {
  const [values, setValues] = useState({ nome: "", email: "", telefone: "", mensagem: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");

  const update = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues(v => ({ ...v, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = contatoSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) fieldErrors[issue.path[0] as string] = issue.message;
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setStatus("sending");
    setTimeout(() => {
      setStatus("sent");
      setValues({ nome: "", email: "", telefone: "", mensagem: "" });
    }, 700);
  };

  if (status === "sent") {
    return (
      <Card className="flex flex-col items-start gap-3 border p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#16A34A]/10 text-[#16A34A]">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 className="text-xl font-bold text-[#213368]">Mensagem enviada!</h3>
        <p className="text-sm text-muted-foreground">Recebemos seu contato e retornaremos em breve. Obrigado por falar com o Grupo GRD.</p>
        <Button variant="outline" onClick={() => setStatus("idle")}>Enviar outra mensagem</Button>
      </Card>
    );
  }

  return (
    <Card className="border p-6 md:p-8">
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <Field label="Nome" error={errors.nome}>
          <Input value={values.nome} onChange={update("nome")} placeholder="Seu nome" maxLength={100} />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="E-mail" error={errors.email}>
            <Input type="email" value={values.email} onChange={update("email")} placeholder="voce@empresa.com" maxLength={255} />
          </Field>
          <Field label="Telefone" error={errors.telefone}>
            <Input value={values.telefone} onChange={update("telefone")} placeholder="(11) 99999-9999" maxLength={20} />
          </Field>
        </div>
        <Field label="Mensagem" error={errors.mensagem}>
          <Textarea rows={5} value={values.mensagem} onChange={update("mensagem")} placeholder="Conte-nos sobre seu projeto industrial..." maxLength={1000} />
        </Field>
        <Button disabled={status === "sending"} className="mt-2 bg-[#F37032] text-white transition hover:bg-[#ff8850] hover:-translate-y-0.5">
          {status === "sending" ? "Enviando..." : "Enviar mensagem"}
        </Button>
      </form>
    </Card>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {error && <p className="text-xs text-[#DC2626]">{error}</p>}
    </div>
  );
}
