const cachePrefix = 'miami-beach-pwa-template-';
const cacheName = `${cachePrefix}__BUILD__`;
const developingLocally = ['localhost', '127.0.0.1'].includes(self.location.hostname);
const appShell = [
  './',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
];

const localReferences = html =>
  [...html.matchAll(/(?:href|src)="([^"#]+)"/g)]
    .map(match => match[1])
    .filter(path => new URL(path, self.location).origin === self.location.origin);

const downloadApp = async () => {
  const page = await fetch('./');
  if (!page.ok) throw new Error(`Could not download app: ${page.status}`);

  const html = await page.text();
  const cache = await caches.open(cacheName);

  await cache.put('./', new Response(html, {
    headers: page.headers,
    status: page.status,
    statusText: page.statusText,
  }));
  await cache.addAll([...new Set([
    ...appShell.slice(1),
    ...localReferences(html),
  ])]);
};

self.addEventListener('install', event => {
  event.waitUntil(downloadApp().then(() => developingLocally ? self.skipWaiting() : undefined));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names
        .filter(name => name.startsWith(cachePrefix) && name !== cacheName)
        .map(name => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const sameOrigin = new URL(request.url).origin === self.location.origin;

  if (request.method !== 'GET' || !sameOrigin) return;

  if (developingLocally) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  event.respondWith((async () =>
    await caches.match(request)
    ?? (request.mode === 'navigate' ? await caches.match('./') : undefined)
    ?? fetch(request)
  )());
});
