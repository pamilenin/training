'use strict';

const CACHE_PREFIX = 'ofp-diary-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const INDEX_URL = new URL('./index.html', self.location.href).href;
const MANIFEST_URL = new URL('./manifest.webmanifest', self.location.href).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([
      new Request(INDEX_URL, { cache: 'reload' }),
      new Request(MANIFEST_URL, { cache: 'reload' })
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin) return;

  const isDiaryPage = request.mode === 'navigate' &&
    (url.pathname === scope.pathname ||
      url.pathname === new URL(INDEX_URL).pathname);
  const isManifest = url.href === MANIFEST_URL;

  if (!isDiaryPage && !isManifest) return;

  const cacheKey = isDiaryPage ? INDEX_URL : MANIFEST_URL;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    try {
      const response = await fetch(request, { cache: 'no-cache' });
      if (response.ok) {
        await cache.put(cacheKey, response.clone());
        return response;
      }
      return (await cache.match(cacheKey)) ?? response;
    } catch {
      return (await cache.match(cacheKey)) ??
        new Response('Дневник пока недоступен без сети.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
  })());
});