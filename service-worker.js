const CACHE = 'takeoff-v2-2';
const ASSETS = ['./','index.html','style.css','app.js','airports.js','routeReferences.js','weather.js','storage.js','map.js','ui.js','manifest.json'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request))));
