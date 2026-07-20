// build-force-v3
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/catalogo")({
  head: () => ({
    meta: [
      { title: "Catálogo de Equipamentos — GRD" },
      { name: "description", content: "Equipamentos disponíveis para locação. Consulte nosso catálogo e entre em contato." },
    ],
  }),
  component: CatalogPage,
});

type Equip = {
  id: string;
  nome: string;
  categoria: string;
  status: string;
  foto_url: string | null;
  descricao?: string | null;
};

const WHATSAPP = "5514996004194";

function normalize(s: string) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function CatalogPage() {
  const [items, setItems] = useState<Equip[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    supabase
      .from("equipamentos")
      .select("id, nome, categoria, status, foto_url, descricao")
      .eq("status", "Disponível")
      .order("categoria")
      .order("nome")
      .then(({ data }) => {
        setItems((data ?? []) as Equip[]);
        setLoading(false);
      });
  }, []);

  const grupos = useMemo(() => {
    const q = normalize(busca);
    const map = new Map<string, Map<string, Equip>>(); // categoria -> (nomeNormalizado -> equip)
    for (const e of items) {
      const cat = (e.categoria || "Outros").trim();
      if (normalize(cat) === "veiculo") continue; // remover VEÍCULO
      if (q && !normalize(e.nome).includes(q) && !normalize(cat).includes(q)) continue;
      if (!map.has(cat)) map.set(cat, new Map());
      const inner = map.get(cat)!;
      const key = normalize(e.nome);
      if (!inner.has(key)) inner.set(key, e); // DISTINCT ON nome
    }
    return Array.from(map.entries())
      .map(([cat, inner]) => ({ cat, equips: Array.from(inner.values()) }))
      .filter(g => g.equips.length > 0)
      .sort((a, b) => a.cat.localeCompare(b.cat, "pt-BR"));
  }, [items, busca]);

  const totalItens = grupos.reduce((a, g) => a + g.equips.length, 0);

  const waLink = (cat: string) =>
    `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(
      `Olá! Tenho interesse em alugar equipamentos da categoria ${cat}.`,
    )}`;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F4F4]">
        <p className="text-[#213368] font-semibold">Carregando catálogo...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F4F4] font-[Montserrat,system-ui,sans-serif]">
      <div className="bg-white border-b px-6 py-4">
        <Link to="/" className="text-sm text-[#213368] font-semibold hover:underline">
          ← Voltar ao site
        </Link>
      </div>

      <div className="bg-[#213368] text-white px-6 py-12">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-extrabold">Catálogo de Equipamentos</h1>
          <p className="mt-2 text-white/80">
            Equipamentos disponíveis para locação. Entre em contato para solicitar.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 flex flex-wrap items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou categoria..."
          className="border rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-[#213368]"
        />
        <span className="text-xs text-gray-500 ml-auto">
          {grupos.length} categoria(s) · {totalItens} equipamento(s)
        </span>
      </div>

      <div className="max-w-7xl mx-auto px-6 pb-12 space-y-10">
        {grupos.length === 0 ? (
          <p className="text-center text-gray-500 py-12">Nenhum equipamento disponível no momento.</p>
        ) : (
          grupos.map(({ cat, equips }) => (
            <section key={cat}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-xl font-bold text-[#213368] flex items-center gap-2">
                  <span className="w-1 h-6 bg-[#F37032] rounded" />
                  {cat} <span className="text-sm font-semibold text-gray-500">({equips.length})</span>
                </h2>
                <a
                  href={waLink(cat)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-[#F37032] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#ff8850] transition"
                >
                  Entrar em contato
                </a>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {equips.map((e) => (
                  <div key={e.id} className="bg-white rounded-xl border overflow-hidden hover:shadow-lg transition">
                    {e.foto_url ? (
                      <img
                        src={e.foto_url}
                        alt={e.nome}
                        className="w-full h-40 object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-40 bg-[#F4F4F4] flex items-center justify-center text-4xl">
                        🔧
                      </div>
                    )}
                    <div className="p-4">
                      <h3 className="font-bold text-[#213368] text-sm">{e.nome}</h3>
                      {e.descricao && (
                        <p className="text-xs text-gray-600 mt-1 line-clamp-3">{e.descricao}</p>
                      )}
                      <a
                        href={waLink(cat)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 block w-full text-center bg-[#F37032] text-white text-xs font-semibold py-2 rounded-lg hover:bg-[#ff8850] transition"
                      >
                        Entrar em contato
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <div className="bg-white border-t px-6 py-6 text-center text-xs text-gray-500">
        © 2026 Grupo GRD · grupogrdbrasil.com.br
      </div>
    </div>
  );
}
