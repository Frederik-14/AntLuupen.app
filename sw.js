/*
  Service worker voor An't Luupen.

  Werkt alleen wanneer de site via https:// (of localhost) gehost wordt — dat is een eis
  van browsers zelf, niet van deze code. Zie LEES_MIJ_HOSTEN.txt.

  Strategie:
  - De pagina zelf (index.html): NETWERK EERST, met de cache als reserve. Met internet krijg
    je dus meteen de nieuwste versie (vroeger pas bij de tweede keer openen); zonder
    internet opent de app gewoon de laatst bewaarde versie. Duurt het netwerk langer dan
    4 seconden, dan toont hij eerst de bewaarde versie.
  - Manifest en iconen: uit de cache, op de achtergrond bijgewerkt.
  - Lettertypes (Google Fonts) en de kaartbibliotheek (cdnjs): netwerk eerst, cache als reserve.
  - Al het andere (adres zoeken, knooppunten, routeberekening, kaarttegels): NIET bewaren.
    Dat zijn steeds andere antwoorden en ze zouden de opslag van je gsm alleen maar vullen.
  - De versiecontrole van de app (index.html?versiecheck=…) gaat altijd rechtstreeks naar het net.
*/

const CACHE_NAME = 'antluupen-cache-v3';
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
const CACHEABLE_EXTERNAL = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(err=>{
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

function timeout(ms){ return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)); }

async function networkFirstPage(req){
  const cache = await caches.open(CACHE_NAME);
  const network = fetch(req).then(res => {
    if(res && res.status === 200) cache.put('./index.html', res.clone());
    return res;
  });
  try{
    return await Promise.race([network, timeout(4000)]);
  } catch(e){
    const cached = await cache.match('./index.html') || await cache.match('./');
    if(cached) return cached;
    return network; // geen bewaarde versie: dan toch op het netwerk wachten
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);

  if(url.origin === self.location.origin){
    if(url.searchParams.has('versiecheck')) return; // altijd rechtstreeks naar het netwerk

    const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
    if(isPage){
      event.respondWith(networkFirstPage(req));
      return;
    }
    // manifest, iconen: cache eerst, op de achtergrond bijwerken
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
    return;
  }

  if(CACHEABLE_EXTERNAL.includes(url.hostname)){
    event.respondWith(
      fetch(req).then(res => {
        if(res && (res.status === 200 || res.type === 'opaque')){
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req))
    );
  }
  // overige externe verzoeken: geen respondWith → de browser handelt ze gewoon af
});
