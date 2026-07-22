import { useEffect, useState, useCallback } from "react";
import { Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";
import { supabase } from "@/integrations/supabase/client";

type Obra = {
  id: string;
  titulo: string;
  descricao: string | null;
  foto_url: string | null;
};

const PAGE_SIZE = 6;

export function PortfolioGallery() {
  const [obras, setObras] = useState<Obra[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let alive = true;
    supabase
      .from("portfolio")
      .select("id, titulo, descricao, foto_url")
      .eq("ativo", true)
      .order("ordem", { ascending: true })
      .then(({ data }) => {
        if (!alive) return;
        setObras((data ?? []).filter((o: any) => o.foto_url) as Obra[]);
      });
    return () => { alive = false; };
  }, []);

  const totalPages = Math.max(1, Math.ceil(obras.length / PAGE_SIZE));
  const pageStart = page * PAGE_SIZE;
  const visible = obras.slice(pageStart, pageStart + PAGE_SIZE);

  const close = useCallback(() => setOpen(null), []);
  const prev = useCallback(
    () => setOpen((i) => (i === null ? i : (i - 1 + obras.length) % obras.length)),
    [obras.length],
  );
  const next = useCallback(
    () => setOpen((i) => (i === null ? i : (i + 1) % obras.length)),
    [obras.length],
  );

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close, prev, next]);

  return (
    <section id="projetos" className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-3xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wider text-[#F37032]">Portfólio</span>
          <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">Nossas obras</h2>
          <p className="mt-4 text-muted-foreground">
            Projetos industriais executados com rigor técnico e compromisso com a entrega.
          </p>
        </Reveal>

        {obras.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">Em breve, novas obras.</p>
        ) : (
          <div className="mt-10 columns-1 gap-5 sm:columns-2 lg:columns-3 [column-fill:_balance]">
            {visible.map((obra, idx) => {
              const i = pageStart + idx;
              return (
                <Reveal key={obra.id} delay={idx * 90} className="mb-5 block break-inside-avoid">
                  <button
                    type="button"
                    onClick={() => setOpen(i)}
                    className="group relative block w-full overflow-hidden rounded-xl shadow-md transition-shadow duration-300 hover:shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F37032]"
                  >
                    <img
                      src={obra.foto_url ?? ""}
                      alt={obra.titulo}
                      loading="lazy"
                      className="w-full transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="pointer-events-none absolute inset-0 flex translate-y-full flex-col items-center justify-center gap-2 bg-[#213368]/70 p-4 text-center text-white transition-transform duration-300 ease-out group-hover:translate-y-0">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-[#213368] shadow-lg">
                        <Search className="h-5 w-5" />
                      </div>
                      <div className="text-base font-bold">{obra.titulo}</div>
                      {obra.descricao && <div className="text-xs opacity-90 line-clamp-2">{obra.descricao}</div>}
                    </div>
                  </button>
                </Reveal>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#213368]/20 bg-white text-[#213368] transition hover:bg-[#213368] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-[#213368]"
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            {Array.from({ length: totalPages }, (_, p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                className={`h-11 min-w-11 rounded-full px-4 text-sm font-semibold transition ${
                  p === page
                    ? "bg-[#F37032] text-white shadow-md"
                    : "border border-[#213368]/20 bg-white text-[#213368] hover:bg-[#213368] hover:text-white"
                }`}
                aria-label={`Página ${p + 1}`}
                aria-current={p === page ? "page" : undefined}
              >
                {p + 1}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#213368]/20 bg-white text-[#213368] transition hover:bg-[#213368] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-[#213368]"
              aria-label="Próxima página"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      {open !== null && obras[open] && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 animate-in fade-in duration-200"
          onClick={close}
        >
          <button
            aria-label="Fechar"
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); close(); }}
          >
            <X className="h-6 w-6" />
          </button>
          <button
            aria-label="Anterior"
            className="absolute left-4 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); prev(); }}
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
          <button
            aria-label="Próxima"
            className="absolute right-4 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); next(); }}
          >
            <ChevronRight className="h-7 w-7" />
          </button>
          <div
            className="flex max-h-[90vh] max-w-[92vw] flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={obras[open].foto_url ?? ""}
              alt={obras[open].titulo}
              className="max-h-[75vh] rounded-lg object-contain shadow-2xl"
            />
            <div className="max-w-2xl rounded-lg bg-white/10 px-5 py-3 text-center text-white backdrop-blur">
              <div className="text-lg font-bold">{obras[open].titulo}</div>
              {obras[open].descricao && <div className="mt-1 text-sm opacity-90">{obras[open].descricao}</div>}
            </div>
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium text-white">
            {open + 1} / {obras.length}
          </div>
        </div>
      )}
    </section>
  );
}
