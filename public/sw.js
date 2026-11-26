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

const CACHE_VERSION = "2ie-market-v3";
const OFFLINE_URL = "/offline.html";
// En développement, on n'intercepte aucune requête : le cache servirait des
// chunks obsolètes et casserait le HMR. Les notifications Push restent actives.
const IS_DEV_HOST =
  self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";
const PRECACHE = [
  OFFLINE_URL,
  "/manifest.json",
  "/icon.jpg",
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

  if (IS_DEV_HOST) return;
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
    url.pathname === "/icon.jpg";

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

// ---------------------------------------------------------------------------
// Notifications Push Web
// ---------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "2iE Market";
  const options = {
    body: payload.body || "Nouvelle activité sur 2iE Market.",
    icon: payload.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: payload.url || "/" },
    // Un même tag remplace la notification précédente (pas d'empilement) et
    // renotify force la bannière + le son/vibreur à chaque nouveau message.
    tag: payload.tag || "2ie-market-notif",
    renotify: true,
    silent: false,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = new URL(
    (event.notification.data && event.notification.data.url) || "/",
    self.location.origin,
  ).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === target && "focus" in client) return client.focus();
        }
        return self.clients.openWindow(target);
      }),
  );
});
