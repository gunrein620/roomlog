const CACHE_NAME = "jibwoojibju-homes-v2";
const APP_SHELL = [
  "/",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/login-main.png",
  "/listing-studio.jpg",
  "/listing-bedroom.jpg",
  "/listing-loft.jpg",
  "/listing-building.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    request.mode === "navigate" ||
    url.pathname.startsWith("/_next/") ||
    // API는 동적 데이터(매물 목록·인증 등) — 항상 네트워크로. 여기서 캐시-우선으로 잡으면
    // fetch의 cache:"no-store"까지 무력화되어 "새로고침해야만 최신이 보이는" 문제가 생긴다.
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request)
        .then((response) => {
          const copy = response.clone();

          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }

          return response;
        })
        .catch(() => caches.match("/"));
    })
  );
});
