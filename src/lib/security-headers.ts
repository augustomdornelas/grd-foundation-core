// ============================================================
// Cabeçalhos de segurança do site
// ------------------------------------------------------------
// Cada domínio aqui foi tirado do código, um por um (levantamento de
// 27/08/2026). Nada entra "por precaução": domínio que não aparece no
// fonte não aparece na política.
//
// De onde veio cada um:
//
//   autenticador.secullum.com.br  script do login do ponto
//                                 (src/components/site/SecullumLogin.tsx)
//   fonts.googleapis.com          folha da Montserrat (src/routes/__root.tsx)
//   fonts.gstatic.com             arquivos .woff2 da Montserrat (idem)
//   fpuwyndpmcgwkuaqbcvm.supabase.co
//                                 API, auth, storage e as fotos do
//                                 portfólio (src/integrations/supabase,
//                                 src/routes/index.tsx)
//   pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev
//                                 imagem de og:image / twitter:image
//                                 (src/routes/__root.tsx)
//
// O QUE NÃO ENTROU, e por quê:
//   wa.me, instagram.com, pontoweb.secullum.com.br e
//   grupogrdbrasil.com.br:2096 aparecem no código, mas só como destino
//   de <a href target="_blank">. CSP não governa navegação por link —
//   governa recurso carregado NA página. Colocá-los aqui seria ruído.
//
// SOBRE OS DOIS DOMÍNIOS DA GRD (conferido em 27/08/2026):
//   grupogrdbrasil.com     responde 200 — é o site no ar.
//   grupogrdbrasil.com.br  responde 404, e www.grupogrdbrasil.com.br
//                          responde 522 (origem inalcançável).
//   São domínios registráveis diferentes, não um subdomínio do outro.
//   O link do webmail em src/routes/app.webmail.tsx aponta para
//   grupogrdbrasil.com.br:2096, que também devolve 404 — ou seja, o
//   botão de webmail do Portal provavelmente está quebrado hoje. Não
//   mexi nisso: é assunto separado desta política.
//
//   GA4 e Meta Pixel não estão no código ainda. Quando entrarem,
//   acrescente em script-src e connect-src:
//     www.googletagmanager.com  *.google-analytics.com
//     connect.facebook.net      www.facebook.com
//   Sem isso eles falham calados.
// ============================================================

const SUPABASE = "https://fpuwyndpmcgwkuaqbcvm.supabase.co";
const SUPABASE_WS = "wss://fpuwyndpmcgwkuaqbcvm.supabase.co";
const SECULLUM_AUTH = "https://autenticador.secullum.com.br";
const FONTS_CSS = "https://fonts.googleapis.com";
const FONTS_FILES = "https://fonts.gstatic.com";
const R2_OG = "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev";

/**
 * Monta a política.
 *
 * Sobre `style-src 'unsafe-inline'`: é inevitável e está aqui de olhos
 * abertos. O HTML servido tem 33 atributos `style=` — vindos de
 * `style={{...}}` do React (cor da etapa no Kanban, transições do
 * Reveal, altura do logo) — e atributo de estilo não aceita nonce.
 * Tirar isso exigiria reescrever esses componentes para classes
 * utilitárias. Vale fazer um dia; não vale segurar a CSP por isso,
 * porque o risco real de XSS mora em script-src, e lá não há
 * 'unsafe-inline' nenhum.
 */
export function montarCsp(nonce: string): string {
  const diretivas: Record<string, string[]> = {
    "default-src": ["'self'"],

    // Sem 'unsafe-inline'. Os dois scripts inline que o TanStack Start
    // emite na hidratação levam o nonce desta requisição.
    "script-src": ["'self'", `'nonce-${nonce}'`, SECULLUM_AUTH],

    "style-src": ["'self'", "'unsafe-inline'", FONTS_CSS],
    "font-src": ["'self'", FONTS_FILES, "data:"],

    // blob: e data: são dos PDFs: o logo passa por canvas antes de ser
    // embutido (src/lib/rh-pdf.ts, src/lib/termo-epi-pdf.ts).
    "img-src": ["'self'", "data:", "blob:", SUPABASE, R2_OG],

    "connect-src": ["'self'", SUPABASE, SUPABASE_WS, SECULLUM_AUTH],

    // Nenhum <iframe> no código hoje. Se o script da Secullum criar um,
    // a violação vai dizer qual domínio — aí a gente acrescenta o que
    // ele pedir, e só isso.
    "frame-src": ["'none'"],

    // O site da GRD não pode ser embutido em página de terceiro.
    // Só existe como header; por isso a CSP não é meta tag.
    "frame-ancestors": ["'none'"],

    "form-action": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
  };

  return Object.entries(diretivas)
    .map(([nome, valores]) => `${nome} ${valores.join(" ")}`)
    .join("; ");
}

/**
 * Permissions-Policy desliga o que o site não usa.
 *
 * CÂMERA E LOCALIZAÇÃO FICAM LIGADAS, para `self`. Hoje nada no código
 * chama `getUserMedia` nem `navigator.geolocation` — os sete campos de
 * arquivo do sistema são `<input type="file" accept="image/*">`, que
 * abre o app de câmera do celular e NÃO passa por esta diretiva. Ou
 * seja: desligar não quebraria nada agora.
 *
 * Mas o diário de obra vai tirar foto pelo celular do encarregado, e
 * se ele for feito com captura na própria página (`getUserMedia`, que
 * é o caminho natural para foto com carimbo de data e obra), a câmera
 * desligada o quebra de um jeito traiçoeiro: a falha aparece como
 * promessa rejeitada em JavaScript, e NÃO como violação de CSP no
 * console. Quem estivesse seguindo o roteiro de teste não veria nada.
 *
 * Custo de deixar ligado: `(self)` permite só as nossas próprias
 * páginas pedirem a permissão, e o navegador continua perguntando ao
 * usuário. Custo de deixar desligado: uma quebra silenciosa daqui a
 * alguns meses, difícil de associar a este arquivo.
 *
 * O resto continua desligado — o site não usa nenhum deles.
 */
const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=()",
  "camera=(self)",
  "display-capture=()",
  "encrypted-media=()",
  "fullscreen=(self)",
  "geolocation=(self)",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "usb=()",
  "xr-spatial-tracking=()",
].join(", ");

export type ModoCsp = "report-only" | "enforce";

/**
 * ETAPA 4 — a chave para ligar de verdade.
 *
 * Trocar para "enforce" faz o navegador BLOQUEAR o que hoje ele apenas
 * relata. Só troque depois de rodar o roteiro de teste inteiro sem
 * violação no console: em report-only um erro é uma linha amarela; em
 * enforce é a tela sem funcionar.
 */
export const MODO_CSP: ModoCsp = "report-only";

export function cabecalhosDeSeguranca(
  nonce: string,
  url: URL,
  modo: ModoCsp = MODO_CSP,
): Record<string, string> {
  const cabecalhos: Record<string, string> = {
    [modo === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only"]:
      montarCsp(nonce),

    // Impede o navegador de "adivinhar" o tipo do arquivo — é o que
    // transforma um upload de texto em script executável.
    "X-Content-Type-Options": "nosniff",

    // O domínio da GRD vaza para o site de destino, o caminho não.
    "Referrer-Policy": "strict-origin-when-cross-origin",

    "Permissions-Policy": PERMISSIONS_POLICY,
  };

  // HSTS só faz sentido (e só é obedecido) sobre HTTPS. Fica de fora em
  // desenvolvimento para não prender localhost em https no navegador.
  //
  // MAX-AGE DE 5 MINUTOS, DE PROPÓSITO. Este é o único header do lote
  // que não desfaz por deploy: o navegador guarda a instrução pelo
  // tempo do max-age, e um ano de erro são doze meses de gente sem
  // conseguir abrir o site. Cinco minutos é curto o bastante para
  // errar sem consequência. Depois de uma semana em produção sem
  // problema, subir para 31536000 (um ano).
  //
  // Sem `includeSubDomains`, e agora com o motivo verificado: o site
  // vive em grupogrdbrasil.com, e o webmail que o Portal abre está em
  // grupogrdbrasil.com.br:2096 — domínio registrável DIFERENTE, fora
  // do alcance de includeSubDomains. A dúvida real, então, é sobre
  // subdomínios de .com, que ninguém enumerou ainda.
  if (url.protocol === "https:") {
    cabecalhos["Strict-Transport-Security"] = "max-age=300";
  }

  return cabecalhos;
}

/** Nonce novo a cada resposta. Reaproveitar nonce anula o mecanismo. */
export function gerarNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/[+/=]/g, "");
}
