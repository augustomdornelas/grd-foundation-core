import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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

const WHATSAPP_URL =
  "https://wa.me/5514996004194?text=" +
  encodeURIComponent("Olá! Gostaria de solicitar um orçamento de locação de equipamentos.");

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
  "FIXAÇÃO": "Pistolas de fixação, pregos, buchas e sistemas de ancoragem",
  "FURAÇÃO E DEMOLIÇÃO": "Marteletes, rompedores e equipamentos para demolição e furação",
  "ILUMINAÇÃO": "Refletores, gambiarras e torres de iluminação para obra noturna",
  "JARDINAGEM": "Roçadeiras, sopradores e equipamentos para manutenção de áreas verdes",
  "LIMPEZA": "Lavadoras de alta pressão e equipamentos para limpeza industrial",
  "MEDIÇÃO E NÍVEL": "Níveis a laser, trenas e instrumentos de medição de precisão",
  "OUTROS": "Equipamentos diversos para apoio às atividades de obra",
  "SEGURANÇA": "EPIs, sinalização e equipamentos de segurança para obra",
};

const FOTOS: Record<string, string> = {
  "ANDAIME": "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=600",
  "COMPACTACAO": "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=600",
  "CONTAINER": "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600",
  "CORTE E CONCRETO": "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600",
  "ELETRICO, AGUA E AR": "https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=600",
  "ESCORAS": "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=600",
  "FERRAMENTAS A BATERIA": "https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=600",
  "FERRAMENTAS ELETRICAS": "https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=600",
  "FURACAO E DEMOLICAO": "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=600",
  "JARDINAGEM": "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600",
  "LIMPEZA": "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600",
  "OUTROS": "https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=600",
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

type Row = { id: string; nome: string; categoria: string };

function CatalogPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("equipamentos")
      .select("id, nome, categoria")
      .eq("status", "Disponível")
      .then(({ data }) => {
        setRows((data ?? []) as Row[]);
        setLoading(false);
      });
  }, []);

  const categorias = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const cat = (r.categoria || "OUTROS").trim();
      if (normalize(cat) === "VEICULO") continue;
      set.add(cat.toUpperCase());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rows]);

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
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {categorias.map((cat) => {
              const desc = DESCRICOES[normalize(cat)] || "Equipamentos disponíveis para locação";
              return (
                <div
                  key={cat}
                  className="group relative overflow-hidden rounded-xl border border-gray-200 bg-gray-100 h-48 cursor-pointer transition-all duration-300 hover:bg-[#213368] hover:shadow-xl hover:-translate-y-1"
                >
                  <div className="absolute inset-0 flex items-center justify-center px-4 transition-opacity duration-300 group-hover:opacity-0">
                    <h3 className="text-center text-lg font-bold text-[#213368] uppercase tracking-wide">
                      {cat}
                    </h3>
                  </div>
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <h3 className="text-base font-bold text-white uppercase mb-2 tracking-wide">
                      {cat}
                    </h3>
                    <p className="text-sm text-white/90 leading-relaxed">{desc}</p>
                  </div>
                </div>
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
    </div>
  );
}
