// ============================================================
// Login do Secullum Ponto Web embutido
// ------------------------------------------------------------
// A Secullum publica um script que desenha o formulário de login
// dentro de uma div nossa. Não é API, não usa token e não precisa de
// plano PRO — é só o formulário deles rodando no nosso domínio.
//
// Três cuidados que o exemplo oficial não tem, e que num SPA fazem
// falta:
//
//  1. LIMPEZA NA SAÍDA. O React monta e desmonta a mesma rota várias
//     vezes (e duas vezes seguidas em StrictMode). Sem remover o
//     script e esvaziar a div, o formulário aparece duplicado.
//  2. ID FIXO. O script procura por #secullum-login e não aceita
//     outro nome, então esta div não pode aparecer duas vezes na
//     mesma tela.
//  3. SAÍDA DE EMERGÊNCIA, em dois graus. Script de terceiro cai, é
//     bloqueado por extensão, ou a rede do canteiro está ruim — e
//     esses casos NÃO são a mesma coisa:
//
//       "falhou"    o navegador avisou que o script não carrega.
//                   Acabou; só resta o link para o Ponto Web.
//       "demorando" passou de 8s sem nada desenhado. Não é fim de
//                   linha: o link alternativo aparece, mas a espera
//                   continua e, se o script chegar aos 15s numa 4G
//                   ruim, o formulário toma o lugar sozinho.
//
//     A distinção existe porque a maioria dos casos de campo é o
//     segundo, e dizer "não foi possível" para quem só está numa rede
//     lenta manda a pessoa embora da tela sem precisar.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2, WifiOff } from "lucide-react";

const SCRIPT_SRC = "https://autenticador.secullum.com.br/Js/login-pontoweb-externo.js";
const PONTO_WEB = "https://pontoweb.secullum.com.br/#/home";
const ESPERA_MS = 8000;

type Situacao = "carregando" | "pronto" | "demorando" | "falhou";

export function SecullumLogin() {
  const container = useRef<HTMLDivElement>(null);
  const [situacao, setSituacao] = useState<Situacao>("carregando");

  useEffect(() => {
    const alvo = container.current;
    if (!alvo) return;

    let vivo = true;
    alvo.innerHTML = "";

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onerror = () => {
      if (vivo) setSituacao("falhou");
    };
    document.body.appendChild(script);

    // O script não avisa quando terminou de desenhar; o sinal de que
    // deu certo é a div deixar de estar vazia.
    const observador = new MutationObserver(() => {
      if (vivo && alvo.childElementCount > 0) setSituacao("pronto");
    });
    observador.observe(alvo, { childList: true, subtree: true });

    // O observador NÃO é desligado aqui: é ele que faz o formulário
    // aparecer sozinho quando o script chega depois do prazo.
    const prazo = window.setTimeout(() => {
      if (vivo && alvo.childElementCount === 0) {
        setSituacao((atual) => (atual === "falhou" ? atual : "demorando"));
      }
    }, ESPERA_MS);

    return () => {
      vivo = false;
      observador.disconnect();
      window.clearTimeout(prazo);
      script.remove();
      alvo.innerHTML = "";
    };
  }, []);

  return (
    <div className="w-full">
      {situacao === "carregando" && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando o acesso ao ponto...
        </div>
      )}

      {situacao === "demorando" && (
        <div className="rounded-xl border bg-muted/30 p-6 text-center">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-muted-foreground" />
          <p className="font-semibold text-[#213368]">Está demorando mais que o normal</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Continuamos tentando carregar aqui — se der certo, o formulário aparece sozinho. Se
            estiver com pressa, dá para bater o ponto direto no site da Secullum, com o mesmo login.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => window.open(PONTO_WEB, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Abrir o Ponto Web
          </Button>
        </div>
      )}

      {situacao === "falhou" && (
        <div className="rounded-xl border bg-muted/30 p-6 text-center">
          <WifiOff className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-semibold text-[#213368]">
            Não foi possível carregar o formulário aqui
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Pode ser um bloqueador no navegador ou o serviço fora do ar. Você pode bater o ponto
            direto no site da Secullum — é o mesmo login.
          </p>
          <Button
            className="mt-4 bg-[#F37032] text-white hover:bg-[#ff8850]"
            onClick={() => window.open(PONTO_WEB, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Abrir o Ponto Web
          </Button>
        </div>
      )}

      {/* O id é exigido pelo script da Secullum — não renomear. */}
      <div id="secullum-login" ref={container} className={situacao === "pronto" ? "" : "hidden"} />
    </div>
  );
}
