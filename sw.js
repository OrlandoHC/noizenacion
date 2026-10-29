'use strict';

// Sube este número cada vez que cambies archivos del sitio (CSS, JS, imágenes)
// para que los visitantes descarguen la versión nueva.
const CACHE_NAME = 'noize-nacion-v2';

// Página que se muestra si no hay internet y no hay copia guardada de la página.
const OFFLINE_URL = './offline.html';
const PRECACHE = [OFFLINE_URL];

self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Se guarda archivo por archivo: si offline.html no existe, la instalación NO falla.
      Promise.all(
        PRECACHE.map((url) =>
          cache.add(url).catch(() => console.warn('[SW] No se pudo precachear', url))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evt) => {
  const req = evt.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Todo lo que no sea de noizenacion (el stream de audio, rcast, CDNs, ShareThis, Facebook...)
  // va directo a la red. Nunca se toca el audio.
  if (url.origin !== self.location.origin) return;

  // Peticiones parciales de audio/video: directo a la red.
  if (req.headers.has('range')) return;

  if (req.mode === 'navigate') {
    evt.respondWith(paginaConRespaldo(req));
  } else {
    evt.respondWith(archivoEstatico(req));
  }
});

// Páginas: primero la red (así siempre ves la versión nueva). Si no hay internet,
// la última copia buena; si tampoco hay, offline.html; y como último recurso, un aviso simple.
async function paginaConRespaldo(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const resp = await fetch(req);
    if (resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch (err) {
    return (
      (await cache.match(req)) ||
      (await cache.match(OFFLINE_URL)) ||
      new Response('<h1>Sin conexión</h1><p>Vuelve a intentarlo cuando tengas internet.</p>', {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    );
  }
}

// CSS, JS e imágenes del sitio: se sirven al instante desde la copia guardada
// y en segundo plano se actualiza la copia para la próxima visita.
async function archivoEstatico(req) {
  const cache = await caches.open(CACHE_NAME);
  const guardado = await cache.match(req);
  const desdeRed = fetch(req)
    .then((resp) => {
      if (resp.ok) cache.put(req, resp.clone());
      return resp;
    })
    .catch(() => guardado || Response.error());
  return guardado || desdeRed;
}
