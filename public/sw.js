const CACHE_NAME = 'dispatch-map-v1';
const DATA_CACHE = 'dispatch-data-v1';

const STATIC_ASSETS = ['/', '/favicon.ico'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== DATA_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  if (url.pathname.startsWith('/data/')) {
    e.respondWith(
      caches.open(DATA_CACHE).then((cache) =>
        cache.match(e.request).then((cached) => {
          if (cached) return cached;
          return fetch(e.request).then((response) => {
            if (response.ok) cache.put(e.request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
