const CACHE_NAME = 'chanfiou-v2';

const PRECACHED_ASSETS = [
  './',
  './styles/app.css',
  './app.js',
  './assets/fonts/archivo-brand.woff2',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png',
];

// iOS refuse au lancement d'une PWA installée toute réponse marquée « redirected »
// servie par le service worker (« response served by service worker has redirections »).
// On reconstruit donc une réponse propre avant de la mettre en cache ou de la servir.
const cleanResponse = async (response) => {
  if (!response.redirected) return response;
  const body = await response.blob();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        PRECACHED_ASSETS.map(async (asset) => {
          const response = await fetch(asset, { redirect: 'follow' });
          if (response.ok) await cache.put(asset, await cleanResponse(response));
        }),
      );
      await self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = {};
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title ?? 'Chanfiou', {
        body: data.body ?? '',
        icon: './assets/icon-192.png',
        badge: './assets/icon-192.png',
        data: { url: data.url ?? './#/espace' },
      });
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.postMessage({ type: 'sync' }));
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const open = clients.find((client) => 'focus' in client);
      if (open) return open.focus();
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).origin !== self.location.origin) return;

  const cacheKey = event.request.mode === 'navigate' ? './' : event.request;
  event.respondWith(
    caches.match(cacheKey).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then(async (response) => {
          const clean = await cleanResponse(response);
          const copy = clean.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, copy));
          return clean;
        })
        .catch(() => caches.match('./'));
    }),
  );
});
