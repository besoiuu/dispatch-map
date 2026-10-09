const CACHE = 'dispatch-v8';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Serve what we have, then refresh it in the background. */
function staleWhileRevalidate(request) {
  return caches.open(CACHE).then((cache) =>
    cache.match(request).then((cached) => {
      const fresh = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
}

/** Try the network, fall back to whatever was cached on an earlier visit. */
function networkFirst(request) {
  return caches.open(CACHE).then((cache) =>
    fetch(request)
      .then((res) => {
        // Cache-on-success. Nothing used to be written here, so the cache
        // fallback below could never hit and the app did not work offline at
        // all - despite the manifest and the install prompt.
        if (res.ok && res.type === 'basic') cache.put(request, res.clone());
        return res;
      })
      .catch(() => cache.match(request).then((cached) => cached || Response.error()))
  );
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // PMTiles: never intercept. Range requests need to reach the network
  // untouched or MapLibre gets a 200 for a partial read.
  if (url.pathname.startsWith('/tiles/') && url.pathname.endsWith('.pmtiles')) return;

  // The postal-code index is the authority for every lookup in the app, so it
  // has to survive a bad connection. It was not cached at all: 1.9 MB fetched
  // fresh on every load, and offline nothing could be searched or placed.
  if (url.pathname === '/data/search-index.json') {
    e.respondWith(staleWhileRevalidate(req));
    return;
  }

  if (url.pathname.startsWith('/data/') && url.pathname.endsWith('.geojson')) {
    e.respondWith(staleWhileRevalidate(req));
    return;
  }

  e.respondWith(networkFirst(req));
});
