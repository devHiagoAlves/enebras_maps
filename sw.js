// Enebras Mapa de Clientes - Service Worker v4
// App shell em cache (funciona offline) + runtime cache p/ tiles.
// API (Nominatim/OSRM) sempre vai à rede — nunca cacheia.

const CACHE_NAME = 'enebras-mapa-v4';

const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './db.js',
  './routes.js',
  './app.js',
  './manifest.json',
  './favicon.svg',
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

  // Tiles / CDN / fontes: cache primeiro, completa com rede
  if (isCacheableTile(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
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
