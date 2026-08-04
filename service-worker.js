var CACHE_NAME = "ledger-cache-__CACHE_VERSION__";
var ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./qrcode.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then(function (networkResponse) {
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, networkResponse.clone());
        });
        return networkResponse;
      })
      .catch(function () {
        return caches.match(event.request);
      })
  );
});
