// Enebras Mapa de Clientes - Service Worker v6
// App shell em cache (funciona offline) + runtime cache p/ tiles (com teto).
// API (Nominatim/OSRM) sempre vai à rede — nunca cacheia.
// v7.1 usa cache-busting (?v=) p/ forçar atualização no celular.

const CACHE_NAME = 'enebras-mapa-v6';
const MAX_TILES = 400;
const ASSET_V = '?v=7.1';

const APP_SHELL = [
  './',
  './index.html',
  './style.css' + ASSET_V,
  './db.js' + ASSET_V,
  './routes.js' + ASSET_V,
  './field.js' + ASSET_V,
  './app.js' + ASSET_V,
  './manifest.json',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './brasil-estados.geojson',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
  'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Tolerante a falha (ex.: offline na 1ª visita): cacheia o que der
      return Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => null)));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.hostname.includes('nominatim.openstreetmap.org')
    || url.hostname.includes('router.project-osrm.org');
}

function isCacheableTile(url) {
  return url.hostname.includes('tile.openstreetmap.org')
    || url.hostname.includes('unpkg.com')
    || url.hostname.includes('cdn.jsdelivr.net')
    || url.hostname.includes('fonts.googleapis.com')
    || url.hostname.includes('fonts.gstatic.com');
}

// Teto do cache de tiles: remove os mais antigos (Cache API não tem LRU nativo)
async function trimTileCache(cache) {
  try {
    const keys = await cache.keys();
    const tiles = keys.filter(r => r.url.includes('tile.openstreetmap.org'));
    const over = tiles.length - MAX_TILES;
    if (over > 0) {
      await Promise.all(tiles.slice(0, over).map(r => cache.delete(r)));
    }
  } catch (e) {}
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // API: sempre rede
  if (isApiRequest(url)) {
    event.respondWith(fetch(req));
    return;
  }

  // Navegação: rede primeiro, cai p/ cache offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Tiles / CDN / fontes: cache primeiro, completa com rede (teto p/ não estourar cota)
  if (isCacheableTile(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, copy).then(() => trimTileCache(cache)).catch(() => {});
            });
          }
          return res;
        });
      })
    );
    return;
  }

  // Mesmo origem (app shell): cache primeiro
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
  }
});
