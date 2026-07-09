const CACHE_NAME = 'minos-web-v1';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './src/main.js',
  './src/camera.js',
  './src/motion.js',
  './src/kalman.js',
  './src/opticalFlow.js',
  './src/tracker.js',
  './src/detectionTracker.js',
  './src/yolo.js',
  './src/hud.js',
  './src/ui.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first for app shell. Cache-first-with-network-fallback for everything else
// (including the cross-origin ONNX model + onnxruntime-web CDN scripts), so once
// a device has loaded it once, it keeps working with no signal.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          // Only cache successful, cacheable responses (opaque cross-origin ok too)
          if (response && (response.status === 200 || response.type === 'opaque')) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
