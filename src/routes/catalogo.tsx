import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, MessageCircle, Package, Search } from "lucide-react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { WhatsAppFab } from "@/components/site/WhatsAppFab";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/mock-data";

export const Route = createFileRoute("/catalogo")({
  head: () => ({
    meta: [
      { title: "Catálogo de Equipamentos — GRD" },
      { name: "description", content: "Equipamentos disponíveis para locação. Consulte nosso catálogo e entre em contato." },
      { property: "og:title", content: "Catálogo de Equipamentos — GRD" },
      { property: "og:description", content: "Equipamentos disponíveis para locação. Consulte nosso catálogo e entre em contato." },
    ],
  }),
  component: CatalogoPage,
});

type EquipRow = {
  id: string;
  nome: string;
  codigo: string;
  categoria: string;
  status: string;
  custo_periodo: number | null;
  unidade_periodo: string | null;
  foto_url: string | null;
};

const WHATS = "5514997562761";
const whatsLink = (nome: string) =>
  `https://wa.me/${WHATS}?text=${encodeURIComponent(
    `Olá! Vi o catálogo de equipamentos da GRD e gostaria de solicitar informações sobre ${nome}.`,
  )}`;

function statusStyle(s: string) {
  if (s === "Disponível") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (s === "Emprestado") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-amber-100 text-amber-800 border-amber-200";
}

function CatalogoPage() {
  const [items, setItems] = useState<EquipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<"Todos" | "Disponível" | "Emprestado">("Todos");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("equipamentos")
          .select("id,nome,codigo,categoria,status,custo_periodo,unidade_periodo,foto_url")
          .order("categoria", { ascending: true })
          .order("nome", { ascending: true });
        if (error) throw error;
        setItems((data ?? []) as EquipRow[]);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return items.filter((e) => {
      if (statusFiltro !== "Todos" && e.status !== statusFiltro) return false;
      if (!q) return true;
      return e.nome.toLowerCase().includes(q) || (e.codigo ?? "").toLowerCase().includes(q);
    });
  }, [items, busca, statusFiltro]);

  const grupos = useMemo(() => {
    const map = new Map<string, EquipRow[]>();
    for (const e of filtrados) {
      const cat = e.categoria || "Sem categoria";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(e);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtrados]);

  const toggle = (cat: string) => setCollapsed((c) => ({ ...c, [cat]: !c[cat] }));

  return (
    <div className="min-h-screen bg-white font-[Montserrat,system-ui,sans-serif]">
      <Header />

      <section className="bg-[#213368] py-14 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h1 className="text-3xl font-extrabold md:text-4xl">Catálogo de Equipamentos</h1>
          <p className="mt-3 max-w-2xl text-white/80">
            Equipamentos disponíveis para locação. Entre em contato para solicitar.
          </p>
        </div>
      </section>

      <section className="border-b bg-[#F4F4F4] py-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nome ou código..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(["Todos", "Disponível", "Emprestado"] as const).map((s) => (
              <Button
                key={s}
                variant={statusFiltro === s ? "default" : "outline"}
                className={
                  statusFiltro === s
                    ? "bg-[#213368] text-white hover:bg-[#2b447f]"
                    : "border-[#213368]/20 text-[#213368] hover:bg-[#213368]/5"
                }
                onClick={() => setStatusFiltro(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        </div>
      </section>

      <section className="py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          {loading && <p className="text-muted-foreground">Carregando equipamentos...</p>}
          {err && <p className="text-red-600">Erro ao carregar: {err}</p>}
          {!loading && !err && grupos.length === 0 && (
            <p className="text-muted-foreground">Nenhum equipamento encontrado.</p>
          )}

          <div className="space-y-4">
            {grupos.map(([cat, lista]) => {
              const isCollapsed = collapsed[cat];
              return (
                <Card key={cat} className="overflow-hidden border">
                  <button
                    onClick={() => toggle(cat)}
                    className="flex w-full items-center justify-between bg-[#213368] px-5 py-4 text-left text-white transition hover:bg-[#2b447f]"
                  >
                    <div className="flex items-center gap-3">
                      {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                      <span className="text-lg font-bold">{cat}</span>
                      <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">{lista.length}</span>
                    </div>
                  </button>
                  {!isCollapsed && (
                    <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
                      {lista.map((e) => (
                        <div
                          key={e.id}
                          className="group flex flex-col overflow-hidden rounded-xl border bg-white transition hover:-translate-y-0.5 hover:shadow-lg"
                        >
                          <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F4F4F4]">
                            {e.foto_url ? (
                              <img
                                src={e.foto_url}
                                alt={e.nome}
                                className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[#213368]/30">
                                <Package className="h-16 w-16" />
                              </div>
                            )}
                            <span
                              className={`absolute right-2 top-2 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusStyle(e.status)}`}
                            >
                              {e.status}
                            </span>
                          </div>
                          <div className="flex flex-1 flex-col p-4">
                            <h3 className="text-base font-bold text-[#213368]">{e.nome}</h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {e.codigo} · {e.categoria}
                            </p>
                            <div className="mt-3 text-sm">
                              <span className="text-muted-foreground">A partir de </span>
                              <span className="font-bold text-[#F37032]">
                                {brl(Number(e.custo_periodo ?? 0))}
                              </span>
                              <span className="text-muted-foreground">/{e.unidade_periodo ?? "dia"}</span>
                            </div>
                            <Button
                              asChild
                              className="mt-4 bg-[#F37032] text-white hover:bg-[#ff8850]"
                            >
                              <a href={whatsLink(e.nome)} target="_blank" rel="noreferrer">
                                <MessageCircle className="mr-2 h-4 w-4" /> Solicitar equipamento
                              </a>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-[#213368] py-14 text-white">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-extrabold">Precisa de algum equipamento específico?</h2>
          <p className="mt-3 text-white/80">
            Fale com nosso time pelo WhatsApp e receba um orçamento personalizado.
          </p>
          <Button asChild size="lg" className="mt-6 bg-[#F37032] text-white hover:bg-[#ff8850]">
            <a
              href={`https://wa.me/${WHATS}?text=${encodeURIComponent("Olá! Gostaria de solicitar um orçamento de locação de equipamentos.")}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle className="mr-2 h-5 w-5" /> Solicitar equipamento
            </a>
          </Button>
        </div>
      </section>

      <Footer />
      <WhatsAppFab />
    </div>
  );
}
