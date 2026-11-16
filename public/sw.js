// Third Line's offline copy. Once the game has been opened with a connection, it opens without one.
//
// The page itself is fetched from the network when there is one (so an update arrives at once) and from
// the copy kept here when there is not. Everything else the game is made of has a name that changes when
// its contents do, so a kept copy is always the right one: it is served from here first.
const CACHE = 'third-line-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['./', './manifest.webmanifest']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

// The page tells us what it is made of once it has loaded: keep all of it, and let go of what an older
// version used.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'keep' || !Array.isArray(data.urls)) return;
  const wanted = new Set(data.urls);
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      const have = new Set((await cache.keys()).map((request) => request.url));
      await Promise.all([...wanted].filter((url) => !have.has(url)).map((url) => cache.add(url).catch(() => undefined)));
      const scope = self.registration.scope;
      for (const url of have) {
        if (!wanted.has(url) && url !== scope && url !== `${scope}manifest.webmanifest`) await cache.delete(url);
      }
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The page: the network first, the kept copy when there is no network.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('./', copy));
          return response;
        })
        .catch(() => caches.match('./').then((kept) => kept ?? Response.error())),
    );
    return;
  }

  // Everything else: the kept copy first, the network otherwise (and keep what comes back).
  event.respondWith(
    caches.match(request).then(
      (kept) =>
        kept ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
