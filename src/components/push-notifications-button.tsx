"use client";

import { useEffect, useState } from "react";

type Status =
  | "loading"
  | "unsupported"
  | "idle"
  | "asking"
  | "subscribed"
  | "denied"
  | "error";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

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

/**
 * Bannière discrète d'activation des notifications sur l'appareil courant.
 *
 * Le service worker (public/sw.js) reçoit les pushs ; ici on crée l'abonnement
 * et on l'envoie au serveur. Rien n'est demandé tant que l'utilisateur ne
 * clique pas : les navigateurs bloquent les demandes de permission spontanées.
 */
export function PushNotificationsButton() {
  const [status, setStatus] = useState<Status>("loading");
  const [test, setTest] = useState<{ status: "idle" | "sending" | "ok" | "error"; message?: string }>(
    { status: "idle" },
  );

  useEffect(() => {
    if (!VAPID_PUBLIC_KEY) {
      setStatus("unsupported");
      return;
    }
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
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
        if (cancelled) return;
        setStatus(subscription ? "subscribed" : "idle");
      })
      .catch(() => {
        if (!cancelled) setStatus("idle");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (status === "asking" || status === "subscribed") return;
    setStatus("asking");

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "idle");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(VAPID_PUBLIC_KEY),
        }));

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) throw new Error(`subscribe failed: ${response.status}`);

      setStatus("subscribed");
    } catch (error) {
      console.error("Activation des notifications impossible", error);
      setStatus("error");
    }
  }

  if (status === "loading" || status === "unsupported") return null;

  // Diagnostic : envoie une vraie notification au téléphone courant et affiche
  // la raison précise en cas d'échec (VAPID, abonnement, service de push).
  async function sendTestNotification() {
    if (test.status === "sending") return;
    setTest({ status: "sending" });

    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string }
        | null;

      if (!response.ok || !data?.ok) {
        setTest({
          status: "error",
          message: data?.message ?? `Échec de l'envoi (${response.status}).`,
        });
        return;
      }

      setTest({
        status: "ok",
        message: data.message ?? "Notification de test envoyée.",
      });
    } catch {
      setTest({ status: "error", message: "Impossible de contacter le serveur." });
    }
  }

  if (status === "subscribed") {
    return (
      <div className="rounded-xl bg-teal-50 px-3 py-2 text-xs text-teal-900">
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-2">
            <span aria-hidden>🔔</span>
            Notifications activées sur ce téléphone.
          </p>
          <button
            type="button"
            onClick={sendTestNotification}
            disabled={test.status === "sending"}
            className="btn-secondary ml-auto !py-1.5 !text-xs"
          >
            {test.status === "sending" ? "Envoi…" : "🔔 Tester sur ce téléphone"}
          </button>
        </div>

        {test.message ? (
          <p
            role="status"
            className={`mt-1.5 ${test.status === "error" ? "text-red-700" : "text-teal-800"}`}
          >
            {test.message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <button
        type="button"
        onClick={enable}
        disabled={status === "asking" || status === "denied"}
        className="btn-secondary !py-2 !text-xs"
      >
        {status === "asking" ? "Activation…" : "🔔 Activer les notifications sur ce téléphone"}
      </button>
      <span className="text-xs text-slate-500">
        {status === "denied"
          ? "Notifications bloquées : autorise-les dans les réglages du navigateur."
          : status === "error"
            ? "Échec de l'activation, réessaie dans un instant."
            : "Reçois les nouvelles commandes et les changements de statut en direct."}
      </span>
    </div>
  );
}
