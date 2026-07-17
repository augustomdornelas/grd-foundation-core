import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  codigo: string;
  categoria: string;
  status: string;
  custo_periodo: number | null;
  unidade_periodo: string | null;
  foto_url: string | null;
};

function CatalogPage() {
  const [items, setItems] = useState<Equip[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<string>("todos");

  useEffect(() => {
    supabase
      .from("equipamentos")
      .select("id, nome, codigo, categoria, status, custo_periodo, unidade_periodo, foto_url")
      .order("categoria")
      .order("nome")
      .then(({ data }) => {
        setItems((data ?? []) as Equip[]);
        setLoading(false);
      });
  }, []);

  const filtrados = items.filter((e) => {
    const q = busca.toLowerCase();
    const matchBusca =
      !busca ||
      e.nome?.toLowerCase().includes(q) ||
      e.codigo?.toLowerCase().includes(q);
    const matchStatus = filtro === "todos" || e.status === filtro;
    return matchBusca && matchStatus;
  });

  const grupos = filtrados.reduce<Record<string, Equip[]>>((acc, e) => {
    const cat = e.categoria || "Outros";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(e);
    return acc;
  }, {});

  const statusColor: Record<string, string> = {
    Disponível: "bg-green-100 text-green-700",
    Emprestado: "bg-blue-100 text-blue-700",
    Manutenção: "bg-yellow-100 text-yellow-700",
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F4F4]">
        <p className="text-[#213368] font-semibold">Carregando catálogo...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F4F4] font-[Montserrat,system-ui,sans-serif]">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <Link to="/" className="text-sm text-[#213368] font-semibold hover:underline">
          ← Voltar ao site
        </Link>
      </div>

      {/* Hero */}
      <div className="bg-[#213368] text-white px-6 py-12">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-extrabold">Catálogo de Equipamentos</h1>
          <p className="mt-2 text-white/80">
            Equipamentos disponíveis para locação. Entre em contato para solicitar.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="max-w-7xl mx-auto px-6 py-6 flex flex-wrap items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou código..."
          className="border rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[#213368]"
        />
        <div className="flex gap-2 flex-wrap">
          {["todos", "Disponível", "Emprestado", "Manutenção"].map((s) => (
            <button
              key={s}
              onClick={() => setFiltro(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                filtro === s
                  ? "bg-[#213368] text-white border-[#213368]"
                  : "bg-white text-[#213368] border-[#213368]/30 hover:bg-[#213368]/5"
              }`}
            >
              {s === "todos" ? "Todos" : s}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500 ml-auto">{filtrados.length} equipamento(s)</span>
      </div>

      {/* Grupos */}
      <div className="max-w-7xl mx-auto px-6 pb-12 space-y-8">
        {Object.keys(grupos).length === 0 ? (
          <p className="text-center text-gray-500 py-12">Nenhum equipamento encontrado.</p>
        ) : (
          Object.entries(grupos).map(([cat, equips]) => (
            <div key={cat}>
              <h2 className="text-xl font-bold text-[#213368] mb-4 flex items-center gap-2">
                <span className="w-1 h-6 bg-[#F37032] rounded" />
                {cat} ({equips.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {equips.map((e) => (
                  <div
                    key={e.id}
                    className="bg-white rounded-xl border overflow-hidden hover:shadow-lg transition"
                  >
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
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-[#213368] text-sm">{e.nome}</h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${
                            statusColor[e.status] ?? "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {e.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Cód: {e.codigo}</p>
                      {Number(e.custo_periodo ?? 0) > 0 && (
                        <p className="text-sm font-bold text-[#F37032] mt-2">
                          R${" "}
                          {Number(e.custo_periodo).toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                          })}
                          /{e.unidade_periodo ?? "dia"}
                        </p>
                      )}
                      <a
                        href={`https://wa.me/5514997562761?text=${encodeURIComponent(
                          `Olá! Vi o catálogo da GRD e gostaria de informações sobre: ${e.nome}`,
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 block w-full text-center bg-[#F37032] text-white text-xs font-semibold py-2 rounded-lg hover:bg-[#ff8850] transition"
                      >
                        Solicitar equipamento
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Rodapé */}
      <div className="bg-white border-t px-6 py-6 text-center text-xs text-gray-500">
        © 2026 Grupo GRD · grupogrdbrasil.com.br · (14) 3261-4194
      </div>
    </div>
  );
}
