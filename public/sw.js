const CACHE = 'dispatch-v7';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // PMTiles: don't intercept — Range requests need direct access
  if (url.pathname.startsWith('/tiles/') && url.pathname.endsWith('.pmtiles')) {
    return;
  }

  // GeoJSON: stale-while-revalidate — serve cache instantly, update in background
  if (url.pathname.startsWith('/data/') && url.pathname.endsWith('.geojson')) {
    e.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(e.request).then((cached) => {
          const fetchPromise = fetch(e.request).then((res) => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          }).catch(() => cached);

          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Everything else: network-first
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
