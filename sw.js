// Service worker: keeps a copy of the app on the phone so it opens instantly and works offline.

// Bump this on EVERY deploy (v2, v3, ...). That is how the phone notices there is a new version.
const CACHE_VERSION = "v2";
const CACHE_NAME = "tt-" + CACHE_VERSION;
const FONT_CACHE = "tt-fonts";

// Every file the app needs. If you add, rename or delete a file, update this list too,
// otherwise installing the new version fails.
const APP_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./program.js",
  "./storage.js",
  "./sync.js",
  "./app.js",
  "./debug.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];

// Download all app files into a fresh cache.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // `reload` skips the browser's normal cache, so we never store an outdated file.
      cache.addAll(APP_FILES.map((url) => new Request(url, { cache: "reload" })))
    )
  );
});

// The new version is now in charge: delete caches from older versions.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME && name !== FONT_CACHE)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// The page sends this when the user taps "Update available".
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // Only plain GET requests are cached. The Apps Script calls are POSTs, so they always go to the network.
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Google Fonts: keep a copy after the first download, so the font also works offline.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) =>
        cache.match(request).then(
          (cached) =>
            cached ||
            fetch(request).then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            })
        )
      )
    );
    return;
  }

  // Anything else from another site (including script.google.com) is left alone.
  if (url.origin !== self.location.origin) return;

  // App files: cache first. `ignoreSearch` lets e.g. "./?debug" use the cached "./".
  event.respondWith(
    caches
      .match(request, { ignoreSearch: true })
      .then((cached) => cached || fetch(request))
  );
});
