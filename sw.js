// sw.js — service worker: keeps the app files on the phone so Sky Watch opens offline.
// Orbit data is NOT cached here (the app saves its own copy), and other websites are never touched.
// When you change any app file, bump CACHE so phones pick up the new version.

const CACHE = 'skywatch-v13';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'lib/astronomy.browser.min.js', 'lib/satellite.min.js', 'lib/geomagnetism.min.js',
  'js/main.js', 'js/config.js', 'js/store.js', 'js/bus.js', 'js/time.js', 'js/ui.js',
  'js/sky.js', 'js/magnetic.js', 'js/showers.js', 'js/geo.js', 'js/iss.js', 'js/issService.js', 'js/ics.js', 'js/compass.js', 'js/targets.js', 'js/skymath.js', 'js/skydata.js', 'js/satellites.js', 'js/events.js', 'js/outlook.js', 'js/launches.js', 'js/comets.js', 'js/planes.js', 'js/ufo.js', 'js/colors.js', 'data/land.json', 'js/weather.js', 'data/sky.json',
  'js/views/index.js', 'js/views/skymap.js', 'js/views/events.js', 'js/views/space.js', 'js/views/planes.js', 'js/views/tonight.js', 'js/views/iss.js', 'js/views/showers.js', 'js/views/point.js', 'js/views/settings.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first (so updates arrive quickly), fall back to the saved copy when offline.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
