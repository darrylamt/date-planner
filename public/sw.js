/* aduro service worker — offline shell + fast repeat loads.
 * Strategy:
 *   - navigations: network-first, fall back to cache, then the /offline page
 *   - static assets (_next/static, icons, fonts): cache-first (immutable)
 *   - everything else (API, auth, Supabase, cross-origin): pass straight to network
 * Bump CACHE_VERSION to invalidate old caches on deploy.
 */
const CACHE_VERSION = "aduro-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Minimal shell precached on install. Keep this small and reliable.
const PRECACHE_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        // addAll is all-or-nothing; use individual puts so one 404 can't break install.
        Promise.all(
          PRECACHE_URLS.map((url) =>
            fetch(url, { cache: "no-cache" })
              .then((res) => (res.ok ? cache.put(url, res) : null))
              .catch(() => null),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(CACHE_VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Paths the SW must never intercept — dynamic, auth-sensitive, or side-effecting.
function isBypassed(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/admin")
  );
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    /\.(?:png|jpg|jpeg|svg|gif|webp|avif|ico|woff2?|ttf|otf|css|js)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle same-origin GETs; let the browser do everything else (POSTs, Supabase, etc).
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isBypassed(url)) return;

  // App navigations: network-first so users get fresh plans, offline shell as a fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match("/offline")),
        ),
    );
    return;
  }

  // Immutable static assets: cache-first.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return res;
          }),
      ),
    );
  }
});

// Let the page trigger an immediate activation after an update.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
