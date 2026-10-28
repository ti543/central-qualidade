/* =========================================================================
   CENTRAL DA QUALIDADE — Service Worker
   Só existe pra habilitar o "Instalar app" no navegador (PWA) e dar uma
   experiência melhor de carregamento. NÃO guarda dados do Firestore nem
   funciona como app totalmente offline — login e dados sempre exigem rede.

   Estratégia: network-first pros arquivos do shell (HTML/CSS/JS), com
   fallback pro cache só se a rede cair. Assim ninguém fica preso numa
   versão antiga do site depois de uma atualização.

   Se mudar algo essencial de cache, só subir a versão abaixo — isso invalida
   o cache antigo de todo mundo automaticamente.
   ========================================================================= */

const CACHE_VERSION = 'cq-shell-v1';

const ARQUIVOS_SHELL = [
  './index.html',
  './manifest.webmanifest',
  './assets/layout.css',
  './assets/layout.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(ARQUIVOS_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => {}) // não trava a instalação se algum arquivo falhar
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Só intercepta GET do mesmo site. Tudo que é Firebase/Firestore/CDN
  // externo passa direto pra rede, sem cache — dados sempre precisam ser
  // atuais.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copia));
        return resposta;
      })
      .catch(() => caches.match(req))
  );
});
