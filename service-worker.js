const CACHE = 'takeoff-v2-4-osm';
const ASSETS = ['./','index.html','style.css','app.js','app.js?v=20261003-osm','airports.js','routeReferences.js','weather.js','storage.js','map.js','map.js?v=20261003-osm','ui.js','manifest.json'];
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })));
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith('takeoff-') && key !== CACHE).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(event.request)) || fetch(event.request);
  })());
});
