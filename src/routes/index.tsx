import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight, Building2, HardHat, Wrench, Cog, Droplets,
  Shield, Clock, Award, Sparkles, MapPin, Mail, Phone, CheckCircle2, Snowflake, Layers,
} from "lucide-react";
import { useState } from "react";
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

import heroImg from "@/assets/hero_grd.jpg.asset.json";
import empresaImg from "@/assets/empresa_grd.jpg.asset.json";
import portEngenharia from "@/assets/port_engenharia.jpg.asset.json";
import portCorporativas from "@/assets/port_corporativas.jpg.asset.json";
import portReformas from "@/assets/port_reformas.jpg.asset.json";

export const Route = createFileRoute("/")({ component: Home });

const servicos = [
  { n: "01", icon: Building2, title: "Engenharia e Construção", desc: "Projetos seguros e duradouros com tecnologia, planejamento e acompanhamento rigoroso do início ao fim." },
  { n: "02", icon: HardHat, title: "Gerenciamento de Obras", desc: "Planejamento preciso e integração entre projeto, execução e manutenção — gestores lado a lado com as equipes." },
  { n: "03", icon: Wrench, title: "Construções e Reformas Industriais", desc: "Ampliação, transformação ou construção do zero, com visão estratégica, agilidade e foco total em custo-benefício." },
  { n: "04", icon: Droplets, title: "Sistemas de Esgoto Sanitário Industrial", desc: "ETEs, canais e dutos industriais, drenagem técnica, controle de erosão e sistemas de contenção." },
  { n: "05", icon: Cog, title: "Frezamento, Lavagem Química e Polimento", desc: "Revestimentos especiais uretano e epóxi para ambientes industriais de alta exigência." },
];

const projetos = [
  { titulo: "Engenharia e Construção", img: heroImg.url },
  { titulo: "Obras Corporativas", img: portCorporativas.url },
  { titulo: "Construções e Reformas Industriais", img: portReformas.url },
  { titulo: "Câmara Frigorífica", img: null, icon: Snowflake },
  { titulo: "Pisos Industriais", img: null, icon: Layers },
  { titulo: "Estruturas Metálicas", img: portEngenharia.url },
];

const parceiros = ["Dexco", "Portinari", "Duratex", "Durafloor", "Frigol", "Bracell", "Madeiranit", "Mondelli", "Century", "Asmountec", "ITS Informov", "Portex"];

const diferenciais = [
  { icon: Sparkles, title: "Know-how industrial comprovado", desc: "Mais de 14 anos dedicados exclusivamente ao segmento industrial — experiência que se traduz em resultados." },
  { icon: Shield, title: "Segurança em primeiro lugar", desc: "PGR robusto, cumprimento rigoroso das NRs e compromisso com ISO 14000 e boas práticas sustentáveis." },
  { icon: Clock, title: "Respeito ao prazo", desc: "Planejamento detalhado e execução disciplinada. Nosso histórico prova que somos uma empresa que faz acontecer." },
  { icon: Award, title: "Soluções personalizadas", desc: "Cada projeto tratado com visão estratégica, criatividade e foco total no cliente e no resultado." },
  { icon: MapPin, title: "Atendimento em todo o Brasil", desc: "Equipe capacitada para obras em qualquer região do país, com suporte do início ao fim." },
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
  return (
    <div className="min-h-screen bg-white font-[Montserrat,system-ui,sans-serif]">
      <Header />

      {/* Hero */}
      <section id="inicio" className="relative overflow-hidden text-white">
        <img src={heroImg.url} alt="Obra industrial da GRD" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[#213368]/60" />
        <GridMotif className="absolute -right-10 -top-10" opacity={0.15} />
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-36 lg:py-44">
          <Reveal>
            <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur">
              Grupo GRD · desde 2011
            </span>
          </Reveal>
          <Reveal delay={120}>
            <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-tight text-white md:text-5xl lg:text-6xl">
              Especialistas em <span className="text-[#F37032]">obras industriais</span> há mais de 14 anos
            </h1>
          </Reveal>
          <Reveal delay={260}>
            <p className="mt-5 max-w-2xl text-lg text-white/85">
              Engenharia e construção com rigor técnico, segurança e cumprimento de prazo — do planejamento à entrega final.
            </p>
          </Reveal>
          <Reveal delay={380}>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="bg-[#F37032] text-white transition hover:bg-[#ff8850] hover:-translate-y-0.5" onClick={() => scrollToId("contato")}>
                Fale com o comercial <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="border-white/60 bg-transparent text-white transition hover:bg-white hover:text-[#213368]" onClick={() => scrollToId("projetos")}>
                Conheça nossas obras
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Indicadores */}
      <section className="bg-[#213368] py-14 text-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 sm:px-6 md:grid-cols-4">
          {[
            { n: 14, suf: "+", label: "anos de mercado" },
            { n: 100, suf: "%", label: "foco industrial" },
            { n: 270, suf: "+", label: "obras entregues" },
            { label: "atendimento em todo o Estado de SP", custom: "SP" },
          ].map((k, i) => (
            <Reveal key={k.label} delay={i * 100} className="text-center md:text-left">
              <div className="text-4xl font-extrabold text-[#F37032] md:text-5xl">
                {k.custom ? k.custom : <CountUp end={k.n!} suffix={k.suf} />}
              </div>
              <div className="mt-2 text-sm font-medium text-white/80">{k.label}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Empresa */}
      <section id="empresa" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-10 md:grid-cols-2 md:items-center">
            <Reveal delay={150}>
              <span className="text-sm font-semibold uppercase tracking-wider text-[#F37032]">A Empresa</span>
              <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">Foco total em obras industriais</h2>
              <p className="mt-5 text-muted-foreground">
                O Grupo GRD nasceu da vocação para a construção industrial. Ao longo de mais de 14 anos, construímos uma trajetória sólida entregando projetos de alta complexidade técnica para clientes exigentes em todo o Estado de São Paulo.
              </p>
              <p className="mt-4 text-muted-foreground">
                Combinamos tecnologia, planejamento e experiência de campo para desenvolver obras seguras, otimizadas e duradouras — com acompanhamento rigoroso em cada etapa.
              </p>
              <Button className="mt-6 bg-[#213368] text-white hover:bg-[#2b447f]" onClick={() => scrollToId("servicos")}>
                Saiba mais sobre a GRD <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Reveal>
            <Reveal>
              <div className="group relative aspect-[4/3] overflow-hidden rounded-2xl shadow-xl">
                <img src={empresaImg.url} alt="Equipe do Grupo GRD em obra industrial" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-[#F37032]/0 transition duration-500 group-hover:bg-[#F37032]/20" />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Serviços */}
      <section id="servicos" className="bg-[#F4F4F4] py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="max-w-2xl">
            <span className="text-sm font-semibold uppercase tracking-wider text-[#F37032]">Áreas de atuação</span>
            <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">Nossas áreas de atuação</h2>
            <p className="mt-4 text-muted-foreground">Soluções completas para obras industriais de alta exigência técnica.</p>
          </Reveal>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {servicos.map((s, i) => (
              <Reveal key={s.title} delay={i * 80}>
                <Card className="group relative h-full overflow-hidden border p-6 transition duration-300 hover:-translate-y-1 hover:shadow-xl">
                  <div className="absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 bg-[#F37032] transition-transform duration-500 group-hover:scale-x-100" />
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#213368] text-white transition group-hover:bg-[#F37032]">
                      <s.icon className="h-6 w-6" />
                    </div>
                    <span className="text-2xl font-black text-[#213368]/20">{s.n}</span>
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-[#213368]">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
                  <button onClick={() => scrollToId("contato")} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#F37032] hover:gap-2 transition-all">
                    Saiba mais <ArrowRight className="h-4 w-4" />
                  </button>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Projetos */}
      <section id="projetos" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="max-w-3xl">
            <span className="text-sm font-semibold uppercase tracking-wider text-[#F37032]">Portfólio</span>
            <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">Portfólio de projetos</h2>
            <p className="mt-4 text-muted-foreground">
              Ao longo de nossa história, acumulamos projetos de alta complexidade e exigência técnica. Nossas obras falam por si.
            </p>
          </Reveal>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projetos.map((p, i) => (
              <Reveal key={p.titulo} delay={i * 90}>
                <Card className="group h-full overflow-hidden border p-0 transition duration-300 hover:-translate-y-1 hover:shadow-xl">
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#213368]">
                    {p.img ? (
                      <img src={p.img} alt={p.titulo} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#1a2a55] to-[#213368]">
                        {p.icon && <p.icon className="h-16 w-16 text-white/25" />}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#213368]/80 via-transparent to-transparent" />
                    <h3 className="absolute bottom-4 left-5 right-5 text-lg font-bold text-white">{p.titulo}</h3>
                  </div>
                  <div className="flex items-center justify-between px-5 py-4">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#F37032]">Projeto GRD</span>
                    <button onClick={() => scrollToId("contato")} className="inline-flex items-center gap-1 text-sm font-semibold text-[#213368] hover:gap-2 transition-all">
                      Saiba mais <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </Card>
              </Reveal>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Button variant="outline" className="border-[#213368] text-[#213368] hover:bg-[#213368] hover:text-white" onClick={() => scrollToId("contato")}>
              Ver todos os projetos <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Parceiros */}
      <section id="parceiros" className="border-y bg-[#F4F4F4] py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="max-w-3xl text-center mx-auto">
            <span className="text-sm font-semibold uppercase tracking-wider text-[#F37032]">Parceiros</span>
            <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">Alguns de nossos parceiros</h2>
            <p className="mt-4 text-muted-foreground">
              Construímos relações de longo prazo com clientes exigentes que confiam na GRD pela entrega constante, pontual e qualificada.
            </p>
          </Reveal>
          <div className="mt-10 overflow-hidden">
            <div className="flex gap-10 animate-[marquee_35s_linear_infinite] whitespace-nowrap">
              {[...parceiros, ...parceiros].map((p, i) => (
                <span key={i} className="text-2xl font-extrabold tracking-tight text-[#213368]/60 hover:text-[#F37032] transition">
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
        <style>{`@keyframes marquee { from { transform: translateX(0);} to { transform: translateX(-50%);} }`}</style>
      </section>

      {/* Diferenciais */}
      <section className="relative overflow-hidden bg-[#213368] py-20 text-white">
        <GridMotif className="absolute -right-16 top-0" opacity={0.12} />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="max-w-2xl">
            <span className="text-sm font-semibold uppercase tracking-wider text-[#F37032]">Diferenciais</span>
            <h2 className="mt-3 text-3xl font-extrabold text-white md:text-4xl">Por que escolher a GRD?</h2>
          </Reveal>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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

      {/* CTA final */}
      <section className="bg-[#1a2a55] py-16 text-white">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <Reveal>
            <h2 className="text-3xl font-extrabold md:text-4xl">Pronto para iniciar sua obra industrial?</h2>
            <p className="mt-4 text-white/80">Fale com nosso time e receba uma proposta personalizada para o seu projeto.</p>
            <a href="https://wa.me/5514997562761" target="_blank" rel="noreferrer">
              <Button size="lg" className="mt-8 bg-[#F37032] text-white hover:bg-[#ff8850] hover:-translate-y-0.5 transition">
                Fale com um consultor <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </a>
          </Reveal>
        </div>
      </section>

      {/* Contato */}
      <section id="contato" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-10 md:grid-cols-2">
            <Reveal>
              <span className="text-sm font-semibold uppercase tracking-wider text-[#F37032]">Contato</span>
              <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">Fale com a GRD</h2>
              <p className="mt-4 text-muted-foreground">Nossa equipe está pronta para entender sua necessidade e propor a melhor solução industrial.</p>
              <ul className="mt-6 space-y-3 text-sm">
                <li className="flex items-center gap-3"><Phone className="h-4 w-4 text-[#F37032]" /> (14) 3261-4194</li>
                <li className="flex items-center gap-3"><Mail className="h-4 w-4 text-[#F37032]" /> comercial@grupogrdbrasil.com</li>
                <li className="flex items-start gap-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#F37032]" /> Av. José Antunes de Oliveira, 307 · Vila Honorina · CEP 17128-000 · Agudos-SP</li>
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
            <Input value={values.telefone} onChange={update("telefone")} placeholder="(14) 99999-9999" maxLength={20} />
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
