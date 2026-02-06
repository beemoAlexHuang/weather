// Very small SW: cache the UI shell + mini.
// (Best-effort; iOS support varies.)
const CACHE = "outfit-shell-2026-02-06a";
const ASSETS = [
  "/",
  "/mini",
  "/styles.css",
  "/app.js",
  "/mini.js",
  "/manifest.webmanifest",
  "/icon.svg",
  "/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k === CACHE ? null : caches.delete(k)))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Don't cache API responses here (they change). Let Worker API do its own caching.
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    caches.match(event.request).then(hit => hit || fetch(event.request))
  );
});
