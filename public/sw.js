// ============================================================
// Service worker do Portal GRD (PWA)
// ------------------------------------------------------------
// Existe para duas coisas: permitir "Adicionar à tela inicial" e
// mostrar uma página de "sem conexão" em vez do dinossauro do Chrome.
// NÃO é um app offline.
//
// O QUE ENTRA EM CACHE — só arquivo estático:
//   /assets/*   JS e CSS do build. O nome já traz o hash do conteúdo,
//               então um arquivo com o mesmo nome nunca muda: cache
//               primeiro é seguro.
//   /icons/*, /favicon.*, /offline.html
//
// O QUE NUNCA ENTRA EM CACHE:
//   - páginas HTML: sempre da rede; sem rede, offline.html
//   - Supabase (outro domínio): o SW nem intercepta
//   - server functions e qualquer outra rota do próprio Portal: o SW
//     não chama respondWith, e o navegador segue direto para a rede
//   Tudo que tem login e dado passa longe daqui — a tela mostra sempre
//   o dado atual.
//
// ATUALIZAÇÃO: o HTML vem sempre da rede e aponta para os /assets/ do
// deploy novo, então cada deploy chega aos celulares sozinho. Mudou
// ESTE arquivo? Suba a versão abaixo: no activate os caches com outro
// nome são apagados.
// ============================================================
const VERSAO = "grd-v2";
const OFFLINE = "/offline.html";
const PRECACHE = [OFFLINE, "/icons/logo-grd.png", "/icons/icon-192.png", "/favicon.ico"];
// Teto de arquivos no cache: /assets/ de deploys antigos não são mais
// pedidos, e sem teto o cache só cresceria.
const MAX_ENTRADAS = 120;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSAO)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

function ehEstatico(url) {
  return (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/favicon.") ||
    url.pathname === OFFLINE
  );
}

async function aparar(cache) {
  const chaves = await cache.keys();
  const sobra = chaves.length - MAX_ENTRADAS;
  // keys() vem na ordem de inserção: os mais antigos saem primeiro.
  for (let i = 0; i < sobra; i++) await cache.delete(chaves[i]);
}

async function cachePrimeiro(request) {
  const cache = await caches.open(VERSAO);
  const salvo = await cache.match(request);
  if (salvo) return salvo;
  const resposta = await fetch(request);
  // Só guarda resposta completa e bem-sucedida do próprio Portal.
  if (resposta.ok && resposta.type === "basic") {
    await cache.put(request, resposta.clone());
    void aparar(cache);
  }
  return resposta;
}

async function redePrimeiro(request) {
  try {
    return await fetch(request);
  } catch {
    const offline = await caches.match(OFFLINE);
    return offline ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Outro domínio (Supabase, fontes, Secullum): não é assunto do SW.
  if (url.origin !== self.location.origin) return;

  // Navegação = abrir uma página. Rede sempre; sem rede, offline.html.
  if (request.mode === "navigate") {
    event.respondWith(redePrimeiro(request));
    return;
  }

  if (ehEstatico(url)) {
    event.respondWith(cachePrimeiro(request));
  }
  // Todo o resto (server functions, APIs, /sw.js, manifest) segue
  // direto para a rede, sem passar por cache nenhum.
});
