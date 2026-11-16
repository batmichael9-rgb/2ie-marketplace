/*
 * Service worker de 2iE Market.
 *
 * Stratégies :
 *  - navigations (pages) : réseau d'abord, copie en cache, secours sur la
 *    dernière version connue ou sur la page hors-ligne ;
 *  - assets statiques (build Next, images produits, icônes) : cache d'abord ;
 *  - tout le reste (API, Server Actions, requêtes non GET) : réseau uniquement.
 *
 * Incrémenter CACHE_VERSION après un changement de stratégie pour purger
 * l'ancien cache chez les visiteurs.
 */

const CACHE_VERSION = "2ie-market-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages : réseau d'abord, avec repli hors-ligne.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          return (
            (await caches.match(request)) ||
            (await caches.match(OFFLINE_URL)) ||
            new Response("Hors ligne", { status: 503, headers: { "Content-Type": "text/plain" } })
          );
        }),
    );
    return;
  }

  // Assets versionnés et images : cache d'abord.
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/produits/") ||
    url.pathname === "/icon.svg";

  if (isStatic) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        });
      }),
    );
  }
});
