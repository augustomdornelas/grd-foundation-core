// ============================================================
// PWA — registro do service worker e o botão "INSTALAR APP"
// ------------------------------------------------------------
// ANDROID / CHROME: o navegador dispara `beforeinstallprompt` quando o
// Portal pode ser instalado. O evento é guardado aqui e o botão do menu
// chama prompt() nele. O listener fica no carregamento do módulo, e não
// num useEffect, porque o evento pode chegar antes de o React montar o
// menu — e evento perdido não volta.
//
// IPHONE / SAFARI: não existe esse evento. O botão abre um diálogo
// explicando o caminho pelo botão Compartilhar.
//
// JÁ INSTALADO (aberto pelo ícone, display-mode standalone): o botão
// some.
// ============================================================
import { useSyncExternalStore } from "react";

/** O evento que o Chrome dispara; não está nos tipos do DOM. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type EstadoPwa = {
  /** Chrome/Android deixou instalar: existe um evento guardado. */
  podeInstalar: boolean;
  /** Aberto como app (pelo ícone da tela inicial). */
  instalado: boolean;
  /** iPhone/iPad no Safari: instalação só pelo Compartilhar. */
  ios: boolean;
};

const SSR: EstadoPwa = { podeInstalar: false, instalado: false, ios: false };
let estado: EstadoPwa = SSR;
let eventoGuardado: BeforeInstallPromptEvent | null = null;
const ouvintes = new Set<() => void>();

function emitir(parcial: Partial<EstadoPwa>) {
  estado = { ...estado, ...parcial };
  ouvintes.forEach((o) => o());
}

function abertoComoApp(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari antigo não entende o media query; usa esta propriedade.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function ehIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ se apresenta como Mac; o toque denuncia.
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

if (typeof window !== "undefined") {
  estado = { podeInstalar: false, instalado: abertoComoApp(), ios: ehIos() };

  window.addEventListener("beforeinstallprompt", (e) => {
    // Sem preventDefault o Chrome mostraria a barrinha dele por conta
    // própria; o convite fica com o botão do menu.
    e.preventDefault();
    eventoGuardado = e as BeforeInstallPromptEvent;
    emitir({ podeInstalar: true });
  });

  window.addEventListener("appinstalled", () => {
    eventoGuardado = null;
    emitir({ podeInstalar: false, instalado: true });
  });

  window.matchMedia("(display-mode: standalone)").addEventListener("change", (e) => {
    emitir({ instalado: e.matches });
  });
}

export function usePwa(): EstadoPwa {
  return useSyncExternalStore(
    (o) => {
      ouvintes.add(o);
      return () => {
        ouvintes.delete(o);
      };
    },
    () => estado,
    () => SSR,
  );
}

/** Abre o convite do Chrome. Devolve true se a pessoa aceitou. */
export async function instalarPwa(): Promise<boolean> {
  const evento = eventoGuardado;
  if (!evento) return false;
  await evento.prompt();
  const { outcome } = await evento.userChoice;
  // O evento só serve uma vez, aceite ou não.
  eventoGuardado = null;
  emitir({ podeInstalar: false });
  return outcome === "accepted";
}

/**
 * Registra /sw.js. Só em produção — em `vite dev` um service worker
 * guardando /assets/ atrapalharia o recarregamento — e só depois do
 * `load`, para não disputar banda com a primeira carga da tela.
 */
export function registrarServiceWorker() {
  if (!import.meta.env.PROD) return;
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const registrar = () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.warn("[pwa] service worker não registrado:", err);
    });
  };
  if (document.readyState === "complete") registrar();
  else window.addEventListener("load", registrar, { once: true });
}
