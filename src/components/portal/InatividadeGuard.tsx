// ============================================================
// Logout automático por inatividade (Portal /app)
// ------------------------------------------------------------
// Montado uma vez no PortalLayout, que só existe nas rotas internas com
// usuário logado — site público, /ponto, /candidato e /login ficam fora.
//
// O tempo é sempre "agora - última atividade" lida do localStorage
// (sessao-inatividade.ts), conferido a cada segundo e ao voltar para a
// aba. Assim várias abas contam como uma, e o computador que dormiu
// desloga na hora em que acorda, se já passou do limite.
//
// Antes de registrar qualquer atividade, confere se o prazo já venceu:
// mexer o mouse depois de o PC acordar não pode ressuscitar a sessão.
// ============================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { AVISO_SEGUNDOS, INATIVIDADE_MINUTOS, REGISTRO_ATIVIDADE_MS } from "@/config/sessao";
import {
  abrirCanalSessao,
  ehChaveDeAtividade,
  gravarUltimaAtividade,
  lerUltimaAtividade,
  limparUltimaAtividade,
  type MensagemSessao,
} from "@/lib/sessao-inatividade";

const LIMITE_MS = INATIVIDADE_MINUTOS * 60_000;
const AVISO_MS = Math.min(AVISO_SEGUNDOS * 1000, LIMITE_MS);

const EVENTOS: (keyof WindowEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "wheel",
];

export function InatividadeGuard() {
  const navigate = useNavigate();
  const [restante, setRestante] = useState<number | null>(null); // segundos; null = sem aviso
  const ultimaRef = useRef(Date.now());
  const saindoRef = useRef(false);
  const avisoRef = useRef(false);
  const canalRef = useRef<BroadcastChannel | null>(null);

  /** Maior entre a memória e o storage: outra aba pode ter renovado. */
  const ultima = useCallback(() => {
    const salva = lerUltimaAtividade();
    if (salva && salva > ultimaRef.current) ultimaRef.current = salva;
    return ultimaRef.current;
  }, []);

  /** Sai daqui: limpa sessão e estado e vai para o login com o aviso. */
  const sair = useCallback(
    async (avisarOutras: boolean) => {
      if (saindoRef.current) return;
      saindoRef.current = true;
      avisoRef.current = false;
      setRestante(null);
      limparUltimaAtividade();
      if (avisarOutras) canalRef.current?.postMessage({ tipo: "logout" } satisfies MensagemSessao);
      // scope local: encerra este navegador (todas as abas), sem derrubar
      // o celular ou outro computador da mesma pessoa. O onAuthStateChange
      // de current-user limpa o usuário em memória.
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      navigate({ to: "/login", search: { motivo: "inatividade" }, replace: true });
    },
    [navigate],
  );

  /** Confere o relógio: desloga, abre/atualiza o aviso ou fecha o aviso. */
  const conferir = useCallback(() => {
    if (saindoRef.current) return true;
    const passou = Date.now() - ultima();
    if (passou >= LIMITE_MS) {
      void sair(true);
      return true;
    }
    if (passou >= LIMITE_MS - AVISO_MS) {
      avisoRef.current = true;
      setRestante(Math.max(1, Math.ceil((LIMITE_MS - passou) / 1000)));
    } else if (avisoRef.current) {
      avisoRef.current = false;
      setRestante(null);
    }
    return false;
  }, [sair, ultima]);

  /** Renova: grava agora e avisa as outras abas. */
  const renovar = useCallback(() => {
    const agora = Date.now();
    ultimaRef.current = agora;
    gravarUltimaAtividade(agora);
    canalRef.current?.postMessage({ tipo: "atividade", em: agora } satisfies MensagemSessao);
    avisoRef.current = false;
    setRestante(null);
  }, []);

  useEffect(() => {
    // Sem registro (primeiro acesso após login/logout): começa agora.
    // Registro antigo (navegador reaberto depois de 20 min): conferir() desloga.
    if (lerUltimaAtividade() === null) renovar();
    else conferir();

    let ultimoRegistro = 0;
    const onAtividade = () => {
      // Com o aviso aberto, só o botão renova: mexer o mouse não fecha o aviso.
      if (avisoRef.current || saindoRef.current) return;
      const agora = Date.now();
      if (agora - ultimoRegistro < REGISTRO_ATIVIDADE_MS) return;
      if (conferir()) return; // venceu enquanto dormia: sai, não renova
      ultimoRegistro = agora;
      renovar();
    };
    const onVisibilidade = () => {
      if (document.visibilityState !== "visible") return;
      if (conferir()) return;
      onAtividade();
    };

    const canal = abrirCanalSessao();
    canalRef.current = canal;
    if (canal) {
      canal.onmessage = (ev: MessageEvent<MensagemSessao>) => {
        const msg = ev.data;
        if (msg?.tipo === "logout") void sair(false);
        else if (msg?.tipo === "atividade" && msg.em > ultimaRef.current) {
          ultimaRef.current = msg.em;
          conferir(); // fecha o aviso se estava aberto
        }
      };
    }
    // Fallback sem BroadcastChannel: o storage muda nas outras abas.
    const onStorage = (ev: StorageEvent) => {
      if (!ehChaveDeAtividade(ev.key)) return;
      if (ev.newValue === null) void sair(false);
      else conferir();
    };

    EVENTOS.forEach((e) => window.addEventListener(e, onAtividade, { passive: true }));
    document.addEventListener("visibilitychange", onVisibilidade);
    window.addEventListener("storage", onStorage);
    const relogio = window.setInterval(conferir, 1000);

    return () => {
      EVENTOS.forEach((e) => window.removeEventListener(e, onAtividade));
      document.removeEventListener("visibilitychange", onVisibilidade);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(relogio);
      canal?.close();
      canalRef.current = null;
    };
  }, [conferir, renovar, sair]);

  return (
    <AlertDialog open={restante !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>SUA SESSÃO VAI EXPIRAR</AlertDialogTitle>
          <AlertDialogDescription>
            POR INATIVIDADE, VOCÊ SERÁ DESCONECTADO EM{" "}
            <span className="font-bold text-[#F37032]">{restante ?? 0} S</span>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => void sair(true)}>SAIR AGORA</AlertDialogCancel>
          <AlertDialogAction
            onClick={renovar}
            className="bg-[#213368] text-white hover:bg-[#2a4185]"
          >
            CONTINUAR CONECTADO
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
