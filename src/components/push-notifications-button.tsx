"use client";

import { useEffect, useState } from "react";

type Status = "loading" | "unsupported" | "off" | "on" | "denied" | "error";

const VAPID_PUBLIC_KEY = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();

/** La clé VAPID arrive en base64url : PushManager attend un buffer binaire. */
function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);

  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }

  return buffer;
}

function supportsPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Enregistre l'abonnement courant côté serveur (upsert par endpoint). */
async function saveSubscription(subscription: PushSubscription): Promise<void> {
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });

  if (!response.ok) throw new Error(`subscribe failed: ${response.status}`);
}

/** Crée (ou récupère) l'abonnement du navigateur puis l'enregistre en base. */
async function ensureSubscription(): Promise<PushSubscription> {
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(VAPID_PUBLIC_KEY),
    }));

  await saveSubscription(subscription);
  return subscription;
}

/**
 * Interrupteur des notifications Push de l'appareil courant.
 *
 * - « Activer » : demande la permission, crée l'abonnement et l'enregistre.
 * - « Désactiver » : désabonne le navigateur et supprime l'abonnement serveur.
 * - « Réinitialiser » : uniquement en cas d'erreur (abonnement mort ou lié à
 *   d'anciennes clés VAPID) ; repart d'un abonnement propre.
 */
export function PushNotificationsButton() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!VAPID_PUBLIC_KEY) {
      setStatus("unsupported");
      return;
    }
    if (!supportsPush()) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }

    let cancelled = false;

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (!cancelled) setStatus(subscription ? "on" : "off");
      })
      .catch(() => {
        if (!cancelled) setStatus("off");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (busy || status === "on") return;
    setBusy(true);
    setMessage(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }

      await ensureSubscription();
      setStatus("on");
    } catch (error) {
      console.error("Activation des notifications impossible", error);
      setStatus("error");
      setMessage("Activation impossible : réessaie ou réinitialise l'appareil.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (busy) return;
    setBusy(true);
    setMessage(null);

    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const existing = await registration?.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();
    } catch (error) {
      console.error("Désabonnement local impossible", error);
    }

    try {
      await fetch("/api/push/subscribe", { method: "DELETE" });
      setStatus("off");
      setMessage("Notifications désactivées sur cet appareil.");
    } catch (error) {
      console.error("Suppression de l'abonnement serveur impossible", error);
      setStatus("error");
      setMessage("Le serveur n'a pas pu être mis à jour. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (busy) return;
    setBusy(true);
    setMessage(null);

    try {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (existing) await existing.unsubscribe();
      } catch (error) {
        // On poursuit : le serveur doit aussi être nettoyé.
        console.error("Désabonnement local impossible", error);
      }

      await fetch("/api/push/subscribe", { method: "DELETE" });

      if (Notification.permission !== "granted") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setStatus(permission === "denied" ? "denied" : "off");
          return;
        }
      }

      await ensureSubscription();
      setStatus("on");
      setMessage("Appareil réinitialisé : notifications à nouveau actives.");
    } catch (error) {
      console.error("Réinitialisation des notifications impossible", error);
      setStatus("error");
      setMessage("Réinitialisation échouée. Réactive les notifications dans le navigateur.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading" || status === "unsupported") return null;

  if (status === "on") {
    return (
      <div className="rounded-xl bg-teal-50 px-3 py-2 text-xs text-teal-900 dark:bg-teal-500/10 dark:text-teal-200">
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-2 font-medium">
            <span aria-hidden>🔔</span>
            Notifications activées sur ce téléphone.
          </p>
          <button
            type="button"
            onClick={disable}
            disabled={busy}
            className="btn-ghost ml-auto !py-1.5 !text-xs"
          >
            {busy ? "Désactivation…" : "Désactiver"}
          </button>
        </div>
        {message ? <p className="mt-1.5 text-teal-800 dark:text-teal-300">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={enable}
          disabled={busy || status === "denied"}
          className="btn-secondary !py-2 !text-xs"
        >
          {busy ? "Activation…" : "🔔 Activer les notifications sur ce téléphone"}
        </button>

        {status === "error" ? (
          <button
            type="button"
            onClick={reset}
            disabled={busy}
            className="btn-ghost !py-2 !text-xs"
          >
            🔄 Réinitialiser
          </button>
        ) : null}

        <span className="text-xs text-slate-500 dark:text-slate-400">
          {status === "denied"
            ? "Notifications bloquées : autorise-les dans les réglages du navigateur."
            : status === "error"
              ? "Une erreur est survenue : réessaie ou réinitialise l'appareil."
              : "Reçois les nouvelles commandes et les changements de statut en direct."}
        </span>
      </div>

      {message ? (
        <p
          role="status"
          className={`mt-1.5 text-xs ${
            status === "error" ? "text-red-700 dark:text-red-400" : "text-teal-700 dark:text-teal-300"
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
