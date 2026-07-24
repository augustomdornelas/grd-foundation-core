import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ZoomIn, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import logoGrd from "@/assets/logo_grd.png";

export const Route = createFileRoute("/catalogo")({
  head: () => ({
    meta: [
      { title: "Locação de Equipamentos — GRD" },
      { name: "description", content: "Equipamentos industriais e de construção disponíveis para locação. Qualidade e segurança para sua obra." },
    ],
  }),
  component: CatalogPage,
});

const WHATSAPP_BASE = "https://wa.me/5514997562761?text=";
const WHATSAPP_URL = WHATSAPP_BASE + encodeURIComponent("Olá! Gostaria de solicitar um orçamento de locação de equipamentos.");

const SUPA = "https://fpuwyndpmcgwkuaqbcvm.supabase.co/storage/v1/object/public/catalogo-categorias";

const DESCRICOES: Record<string, string> = {
  "ACABAMENTO": "Lixadeiras, espátulas, rolos e ferramentas para acabamento fino",
  "ANDAIME": "Andaimes tubulares e fachadeiros para trabalho em altura com segurança",
  "COMPACTAÇÃO": "Placas vibratórias e compactadores para solo e pavimentação",
  "CONTAINER": "Containers para escritório, almoxarifado e vestiário em obra",
  "CORTE E CONCRETO": "Cortadoras de piso, betoneiras e equipamentos para concreto",
  "ELÉTRICO, ÁGUA E AR": "Compressores, geradores, bombas e equipamentos elétricos",
  "ESCORAS": "Escoras metálicas e escoramento para lajes e estruturas",
  "FERRAMENTAS A BATERIA": "Parafusadeiras, furadeiras e ferramentas sem fio de alta performance",
  "FERRAMENTAS ELÉTRICAS": "Furadeiras, esmerilhadeiras, serras e ferramentas elétricas em geral",
  "FURAÇÃO E DEMOLIÇÃO": "Marteletes, rompedores e equipamentos para demolição e furação",
  "JARDINAGEM": "Roçadeiras, sopradores e equipamentos para manutenção de áreas verdes",
  "LIMPEZA": "Lavadoras de alta pressão e equipamentos para limpeza industrial",
  "OUTROS": "Máquinas de solda, transformadores, refletores, cortadores e ferramentas diversas",
  "VEÍCULOS E OUTROS": "Veículos utilitários e equipamentos diversos para apoio às obras",
};

const FOTOS: Record<string, string> = {
  "ANDAIME": `${SUPA}/andaime.jpg`,
  "COMPACTACAO": `${SUPA}/compactacao.jpg`,
  "CONTAINER": `${SUPA}/container.png`,
  "CORTE E CONCRETO": `${SUPA}/corte_e_concreto.webp`,
  "ELETRICO, AGUA E AR": `${SUPA}/eletrico_agua_e_ar.png`,
  "ESCORAS": `${SUPA}/escoras.jpg`,
  "FERRAMENTAS A BATERIA": `${SUPA}/ferramentas_a_bateria.jpg`,
  "FERRAMENTAS ELETRICAS": `${SUPA}/ferramenta_eletrica.webp`,
  "FURACAO E DEMOLICAO": `${SUPA}/demolicão.jpg`,
  "JARDINAGEM": `${SUPA}/jardinagem.jpg`,
  "LIMPEZA": `${SUPA}/limpeza.jpg`,
  "OUTROS": `${SUPA}/veiculos.png`,
  "VEICULOS E OUTROS": `${SUPA}/veiculos.png`,
};

function normalize(s: string) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.98 3.8 13.46 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67M8.53 7.33C8.37 7.33 8.1 7.39 7.87 7.64C7.65 7.89 7 8.5 7 9.71C7 10.93 7.89 12.1 8 12.27C8.14 12.44 9.76 14.94 12.25 16C14.32 16.88 14.74 16.71 15.19 16.66C15.64 16.62 16.64 16.07 16.84 15.5C17.05 14.93 17.05 14.44 17 14.33C16.94 14.23 16.78 14.17 16.53 14.05C16.28 13.93 15.05 13.32 14.82 13.24C14.59 13.16 14.42 13.12 14.26 13.37C14.09 13.61 13.6 14.18 13.46 14.34C13.31 14.51 13.16 14.53 12.91 14.41C12.66 14.28 11.85 14.02 10.89 13.17C10.14 12.5 9.64 11.68 9.5 11.43C9.35 11.18 9.48 11.05 9.61 10.92C9.72 10.81 9.86 10.63 9.98 10.49C10.11 10.35 10.15 10.24 10.23 10.08C10.31 9.91 10.27 9.77 10.21 9.65C10.15 9.53 9.67 8.31 9.45 7.81C9.24 7.33 9.03 7.39 8.87 7.38C8.72 7.38 8.55 7.33 8.53 7.33Z" />
    </svg>
  );
}

type Row = {
  id: string;
  nome: string;
  categoria: string;
  descricao: string | null;
  foto_url: string | null;
  status: string | null;
  exibir_catalogo: boolean | null;
};

type Categoria = {
  id: string;
  nome: string;
  foto_url: string | null;
};

function CatalogPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [catFotos, setCatFotos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [zoomFoto, setZoomFoto] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase
        .from("equipamentos")
        .select("id, nome, categoria, descricao, foto_url, status, exibir_catalogo")
        .eq("exibir_catalogo", true),
      supabase.from("categorias_equipamentos").select("id, nome, foto_url"),
    ]).then(([equipRes, catRes]) => {
      setRows((equipRes.data ?? []) as Row[]);
      const map: Record<string, string> = {};
      for (const c of (catRes.data ?? []) as Categoria[]) {
        if (c.foto_url) map[normalize(c.nome)] = c.foto_url;
      }
      setCatFotos(map);
      setLoading(false);
    });
  }, []);

  const categorias = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const catRaw = (r.categoria || "OUTROS").trim().toUpperCase();
      const nk = normalize(catRaw);
      if (nk === "VEICULO") continue;
      // Agrupar apenas VEÍCULOS como "VEÍCULOS E OUTROS"; OUTROS agora é categoria própria
      const display = nk === "VEICULOS" ? "VEÍCULOS E OUTROS" : catRaw;
      set.add(display);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rows]);

  const equipsPorCategoria = useMemo(() => {
    if (!openCat) return [];
    const nk = normalize(openCat);
    return rows.filter(r => {
      const rk = normalize(r.categoria || "OUTROS");
      if (nk === "VEICULOS E OUTROS") return rk === "VEICULOS";
      return rk === nk;
    });
  }, [openCat, rows]);

  return (
    <div className="min-h-screen bg-[#F4F4F4] font-[Montserrat,system-ui,sans-serif]">
      <div className="bg-white border-b px-6 py-3">
        <Link to="/" className="text-sm text-[#213368] font-semibold hover:underline">
          ← Voltar ao site
        </Link>
      </div>

      <header className="bg-white px-6 py-10 border-b">
        <div className="max-w-7xl mx-auto flex flex-col items-start gap-6">
          <img src={logoGrd} alt="Grupo GRD" className="h-16 md:h-20 w-auto" />
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-[#213368] tracking-tight">
              LOCAÇÃO DE EQUIPAMENTOS
            </h1>
            <p className="mt-2 text-gray-600 max-w-3xl">
              Equipamentos industriais e de construção disponíveis para locação. Qualidade e segurança para sua obra.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {loading ? (
          <p className="text-center text-[#213368] font-semibold py-12">Carregando catálogo...</p>
        ) : categorias.length === 0 ? (
          <p className="text-center text-gray-500 py-12">Nenhuma categoria disponível no momento.</p>
        ) : (
          <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {categorias.map((cat) => {
              const key = normalize(cat);
              const desc = DESCRICOES[cat] || DESCRICOES[key] || "Equipamentos disponíveis para locação";
              const foto = FOTOS[key];
              return (
                <button
                  key={cat}
                  onClick={() => setOpenCat(cat)}
                  className="group relative overflow-hidden rounded-xl shadow-md hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 cursor-pointer text-left"
                  style={{ height: 220 }}
                >
                  {foto ? (
                    <img
                      src={foto}
                      alt={cat}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#213368]">
                      <svg className="h-16 w-16 text-white/40" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1 .1-1.4z" />
                      </svg>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 group-hover:bg-[#213368]/85 transition-colors duration-300" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
                    <h3 className="text-lg md:text-xl font-extrabold text-white uppercase tracking-wide drop-shadow">
                      {cat}
                    </h3>
                    <p className="mt-3 text-sm text-white leading-relaxed max-h-0 overflow-hidden opacity-0 group-hover:max-h-40 group-hover:opacity-100 transition-all duration-300">
                      {desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-12 flex justify-center">
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 bg-[#F37032] text-white font-bold px-8 py-4 rounded-lg shadow-lg hover:bg-[#ff8850] hover:shadow-xl transition-all"
          >
            <WhatsAppIcon className="h-6 w-6" />
            SOLICITAR ORÇAMENTO DE LOCAÇÃO
          </a>
        </div>
      </main>

      <footer className="bg-white border-t px-6 py-6 text-center text-xs text-gray-500">
        © 2026 Grupo GRD · grupogrdbrasil.com.br
      </footer>

      <Dialog open={!!openCat} onOpenChange={(o) => !o && setOpenCat(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#213368] text-xl font-extrabold uppercase">
              {openCat}
            </DialogTitle>
          </DialogHeader>
          {equipsPorCategoria.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Nenhum equipamento disponível nesta categoria.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {equipsPorCategoria.map((eq) => {
                const link = WHATSAPP_BASE + encodeURIComponent(`Olá! Tenho interesse em alugar: ${eq.nome}`);
                const alugado = eq.status === "Emprestado";
                const disponivel = eq.status === "Disponível";
                return (
                  <div key={eq.id} className="rounded-lg border overflow-hidden bg-white flex flex-col">
                    <div className="relative h-40 bg-slate-100 flex items-center justify-center overflow-hidden">
                      {eq.foto_url ? (
                        <button
                          type="button"
                          onClick={() => setZoomFoto(eq.foto_url!)}
                          className="group relative h-full w-full cursor-pointer"
                          aria-label="Ampliar foto"
                        >
                          <img src={eq.foto_url} alt={eq.nome} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                            <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                          </span>
                        </button>
                      ) : (
                        <span className="text-slate-400 text-xs">Sem foto</span>
                      )}
                      {alugado && (
                        <span className="absolute top-2 left-2 bg-[#F37032] text-white text-[10px] font-bold px-2 py-1 rounded-full shadow">
                          ALUGADO
                        </span>
                      )}
                      {disponivel && (
                        <span className="absolute top-2 left-2 bg-emerald-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow">
                          DISPONÍVEL
                        </span>
                      )}
                    </div>
                    <div className="p-4 flex-1 flex flex-col gap-2">
                      <h4 className="font-bold text-[#213368] text-sm uppercase">{eq.nome}</h4>
                      {eq.descricao && (
                        <p className="text-xs text-gray-600 leading-relaxed flex-1">{eq.descricao}</p>
                      )}
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center justify-center gap-2 bg-[#F37032] hover:bg-[#ff8850] text-white text-xs font-bold px-4 py-2 rounded-md transition-colors"
                      >
                        <WhatsAppIcon className="h-4 w-4" />
                        SOLICITAR ESTE EQUIPAMENTO
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!zoomFoto} onOpenChange={(o) => !o && setZoomFoto(null)}>
        <DialogContent className="max-w-5xl bg-black/95 border-none p-0 [&>button]:hidden">
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setZoomFoto(null)}
            className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
          >
            <X className="h-6 w-6" />
          </button>
          {zoomFoto && (
            <img src={zoomFoto} alt="Foto ampliada" className="max-h-[90vh] w-full object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
