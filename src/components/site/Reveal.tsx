import { useEffect, useRef, useState } from "react";

/**
 * Aparição no scroll.
 *
 * O estado inicial (invisível, deslocado 20px) e o plano B ficam no CSS,
 * em src/styles.css. O JavaScript entra só como refinamento: ao montar,
 * marca o elemento com `reveal-js` — o que desliga a animação de
 * fallback — e revela o bloco quando ele entra na tela.
 *
 * O motivo de o estado inicial não ser mais um `style` inline: quando o
 * bundle do cliente não roda, nada removia aquele opacity 0 e a página
 * inteira ficava invisível, menos o que estava fora do Reveal.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);
  // Falso no servidor e na primeira renderização do cliente, para a
  // hidratação casar; vira verdadeiro no efeito, que só roda com JS vivo.
  const [jsAtivo, setJsAtivo] = useState(false);
  useEffect(() => {
    setJsAtivo(true);
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setVisible(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) { setVisible(true); io.disconnect(); }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -50px 0px", ...options }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, visible, jsAtivo };
}

export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: React.ElementType;
}) {
  const { ref, visible, jsAtivo } = useReveal<HTMLDivElement>();
  const Comp: React.ElementType = Tag;
  const classes = ["reveal", jsAtivo && "reveal-js", visible && "reveal-visivel", className]
    .filter(Boolean)
    .join(" ");
  return (
    <Comp ref={ref} className={classes} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Comp>
  );
}

export function CountUp({ end, duration = 1600, suffix = "", prefix = "" }: { end: number; duration?: number; suffix?: string; prefix?: string }) {
  const { ref, visible } = useReveal<HTMLSpanElement>();
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setValue(end); return; }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(end * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, end, duration]);
  return <span ref={ref}>{prefix}{value}{suffix}</span>;
}
