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

type Feedback = { status: "idle" | "sending" | "ok" | "error"; message?: string };

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

/**
 * Crée (ou récupère) l'abonnement du navigateur puis l'enregistre en base.
 * Utilisé à la fois pour l'activation initiale et après une réinitialisation.
 */
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
 * Bannière discrète d'activation des notifications sur l'appareil courant.
 *
 * Le service worker (public/sw.js) reçoit les pushs ; ici on crée l'abonnement
 * et on l'envoie au serveur. Rien n'est demandé tant que l'utilisateur ne
 * clique pas : les navigateurs bloquent les demandes de permission spontanées.
 *
 * Deux boutons de diagnostic : « Tester » envoie une vraie notification et
 * affiche le statusCode / body renvoyé par web-push, « Réinitialiser » repart
 * d'un abonnement propre quand l'ancien est mort ou lié à d'autres clés VAPID.
 */
export function PushNotificationsButton() {
  const [status, setStatus] = useState<Status>("loading");
  const [test, setTest] = useState<Feedback>({ status: "idle" });
  const [resetting, setResetting] = useState(false);

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

      await ensureSubscription();
      setStatus("subscribed");
    } catch (error) {
      console.error("Activation des notifications impossible", error);
      setStatus("error");
    }
  }

  /**
   * Appareil réinitialisé : on désabonne côté navigateur, on purge les
   * abonnements de l'utilisateur côté serveur, puis on recrée un abonnement
   * neuf avec la clé VAPID publique courante.
   */
  async function resetDevice() {
    if (resetting) return;
    setResetting(true);
    setTest({ status: "idle" });

    try {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (existing) await existing.unsubscribe();
      } catch (error) {
        // On continue quand même : le serveur doit aussi être nettoyé.
        console.error("Désabonnement local impossible", error);
      }

      await fetch("/api/push/subscribe", { method: "DELETE" });

      if (Notification.permission !== "granted") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setStatus(permission === "denied" ? "denied" : "idle");
          setTest({
            status: "error",
            message: "Permission refusée : autorise les notifications dans le navigateur.",
          });
          return;
        }
      }

      await ensureSubscription();
      setStatus("subscribed");
      setTest({
        status: "ok",
        message:
          "Appareil réinitialisé : nouvel abonnement enregistré. Utilise « Tester » pour vérifier le son.",
      });
    } catch (error) {
      console.error("Réinitialisation des notifications impossible", error);
      setStatus("error");
      setTest({
        status: "error",
        message: "Réinitialisation échouée : réessaie ou réactive les notifications.",
      });
    } finally {
      setResetting(false);
    }
  }

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

  if (status === "loading" || status === "unsupported") return null;

  if (status === "subscribed") {
    return (
      <div className="rounded-xl bg-teal-50 px-3 py-2 text-xs text-teal-900">
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-2">
            <span aria-hidden>🔔</span>
            Notifications activées sur ce téléphone.
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={sendTestNotification}
              disabled={test.status === "sending"}
              className="btn-secondary !py-1.5 !text-xs"
            >
              {test.status === "sending" ? "Envoi…" : "🔔 Tester sur ce téléphone"}
            </button>
            <button
              type="button"
              onClick={resetDevice}
              disabled={resetting}
              className="btn-ghost !py-1.5 !text-xs"
            >
              {resetting ? "Réinitialisation…" : "🔄 Réinitialiser sur cet appareil"}
            </button>
          </div>
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
    <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={enable}
          disabled={status === "asking" || status === "denied"}
          className="btn-secondary !py-2 !text-xs"
        >
          {status === "asking" ? "Activation…" : "🔔 Activer les notifications sur ce téléphone"}
        </button>

        {status === "error" ? (
          <button
            type="button"
            onClick={resetDevice}
            disabled={resetting}
            className="btn-ghost !py-2 !text-xs"
          >
            {resetting ? "Réinitialisation…" : "🔄 Réinitialiser sur cet appareil"}
          </button>
        ) : null}

        <span className="text-xs text-slate-500">
          {status === "denied"
            ? "Notifications bloquées : autorise-les dans les réglages du navigateur."
            : status === "error"
              ? "Échec de l'activation, réessaie dans un instant."
              : "Reçois les nouvelles commandes et les changements de statut en direct."}
        </span>
      </div>

      {test.message ? (
        <p
          role="status"
          className={`text-xs ${test.status === "error" ? "text-red-700" : "text-teal-800"}`}
        >
          {test.message}
        </p>
      ) : null}
    </div>
  );
}
