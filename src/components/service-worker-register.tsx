"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker (public/sw.js).
 *
 * Uniquement en production : en développement, le cache du service worker
 * servirait des chunks obsolètes entre deux rechargements et casserait le HMR.
 * Pour tester l'installation : `npm run build && npm start`.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.warn("Service worker non enregistré", error);
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
