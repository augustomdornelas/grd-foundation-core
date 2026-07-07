import { useEffect, useState, useCallback } from "react";
import { Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";

import img1 from "@/assets/portfolio_nova_1.jpeg.asset.json";
import img2 from "@/assets/portfolio_nova_2.png.asset.json";
import img3 from "@/assets/portfolio_nova_3.png.asset.json";
import img4 from "@/assets/portfolio_nova_4.jpg.asset.json";
import img5 from "@/assets/portfolio_nova_5.jpeg.asset.json";
import img6 from "@/assets/portfolio_nova_6.jpeg.asset.json";
import img7 from "@/assets/portfolio_nova_7.jpeg.asset.json";
import img8 from "@/assets/portfolio_nova_8.jpeg.asset.json";

const photos = [img1.url, img2.url, img3.url, img4.url, img5.url, img6.url, img7.url, img8.url];
const PAGE_SIZE = 6;

export function PortfolioGallery() {
  const [open, setOpen] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(photos.length / PAGE_SIZE));
  const pageStart = page * PAGE_SIZE;
  const visible = photos.slice(pageStart, pageStart + PAGE_SIZE);

  const close = useCallback(() => setOpen(null), []);
  const prev = useCallback(
    () => setOpen((i) => (i === null ? i : (i - 1 + photos.length) % photos.length)),
    [],
  );
  const next = useCallback(
    () => setOpen((i) => (i === null ? i : (i + 1) % photos.length)),
    [],
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

        <div className="mt-10 columns-1 gap-5 sm:columns-2 lg:columns-3 [column-fill:_balance]">
          {photos.map((src, i) => (
            <Reveal key={src} delay={i * 90} className="mb-5 block break-inside-avoid">
              <button
                type="button"
                onClick={() => setOpen(i)}
                className="group relative block w-full overflow-hidden rounded-xl shadow-md transition-shadow duration-300 hover:shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F37032]"
              >
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  className="w-full transition-transform duration-500 group-hover:scale-105"
                />
                <div className="pointer-events-none absolute inset-0 flex translate-y-full items-center justify-center bg-[#213368]/50 transition-transform duration-300 ease-out group-hover:translate-y-0">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-[#213368] shadow-lg">
                    <Search className="h-6 w-6" />
                  </div>
                </div>
              </button>
            </Reveal>
          ))}
        </div>
      </div>

      {open !== null && (
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
          <img
            src={photos[open]}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
          />
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white">
            {open + 1} / {photos.length}
          </div>
        </div>
      )}
    </section>
  );
}
