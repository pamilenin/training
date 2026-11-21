'use strict';

const APP_SCOPE = new URL(self.registration.scope);
const INDEX_URL = new URL('index.html', APP_SCOPE).href;
const MANIFEST_URL = new URL('manifest.webmanifest', APP_SCOPE).href;
const CACHE_PREFIX = `ofp-diary:${APP_SCOPE.pathname}:`;
const CACHE_NAME = `${CACHE_PREFIX}ice-v1`;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Для офлайн-работы нужен только HTML: стили и скрипты встроены в него.
    await cache.add(new Request(INDEX_URL, { cache: 'reload' }));

    // Отсутствующий или ещё не опубликованный манифест не блокирует установку SW.
    try {
      await cache.add(new Request(MANIFEST_URL, { cache: 'reload' }));
    } catch {
      // Манифест можно будет получить при следующем открытии с интернетом.
    }

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== APP_SCOPE.origin) return;

  const isAppPage = request.mode === 'navigate' &&
    (url.pathname === APP_SCOPE.pathname ||
      url.pathname === new URL(INDEX_URL).pathname);

  const isManifest = url.pathname === new URL(MANIFEST_URL).pathname;
  if (!isAppPage && !isManifest) return;

  const cacheKey = isAppPage ? INDEX_URL : MANIFEST_URL;

  event.respondWith((async () => {
    let networkResponse;

    try {
      networkResponse = await fetch(request, { cache: 'no-cache' });
      if (networkResponse.ok) {
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(cacheKey, networkResponse.clone());
        } catch {
          // Если обновить кеш не удалось, всё равно возвращаем ответ сети.
        }
        return networkResponse;
      }
    } catch {
      // Нет сети: пробуем последнюю сохранённую версию.
    }

    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(cacheKey);
    return cached ?? networkResponse ?? new Response(
      'Дневник пока недоступен без сети. Откройте его один раз с интернетом.',
      {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      }
    );
  })());
});