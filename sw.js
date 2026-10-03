/*
  Service worker voor An't Luupen.

  Werkt alleen wanneer de site via https:// (of localhost) gehost wordt — dat is een eis
  van browsers zelf, niet van deze code. Zie LEES_MIJ_HOSTEN.txt.

  Strategie:
  - App-shell (index.html, manifest, iconen): "cache first, dan bijwerken op de achtergrond"
    (stale-while-revalidate). Zo opent de app ook offline meteen, en staat hij bij een
    volgende keer met internet vanzelf weer op de nieuwste versie.
  - Alles daarbuiten (bv. Google Fonts): netwerk eerst, met de cache als reserve wanneer er
    geen verbinding is. Niets hiervan is verplicht voor de werking van de app zelf.
*/

const CACHE_NAME = 'antluupen-cache-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(err=>{
      // bv. wanneer een van de bestanden (nog) niet bestaat — de rest cachet gewoon door
      console.warn('Kon niet alle app-shell bestanden precachen:', err);
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  if(isSameOrigin){
    // app-shell en eigen bestanden: stale-while-revalidate
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(req).then(cached => {
          const networkFetch = fetch(req).then(res => {
            if(res && res.status === 200) cache.put(req, res.clone());
            return res;
          }).catch(() => cached);
          return cached || networkFetch;
        })
      )
    );
  } else {
    // externe bronnen (bv. Google Fonts): netwerk eerst, cache als reserve zonder internet
    event.respondWith(
      fetch(req).then(res => {
        if(res && res.status === 200){
          caches.open(CACHE_NAME).then(cache => cache.put(req, res.clone()));
        }
        return res;
      }).catch(() => caches.match(req))
    );
  }
});
