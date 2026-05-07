const CACHE_NAME = 'ears-v1';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './fonts.css',
  './script.js',
  './data.json',
  './manifest.json',
  './assets/logo.svg',
  './fonts/dm-mono-400.ttf',
  './fonts/dm-mono-500.ttf',
  './fonts/dm-sans-300.ttf',
  './fonts/dm-sans-400.ttf',
  './fonts/dm-sans-500.ttf',
  './fonts/dm-sans-600.ttf'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      }
    )
  );
});