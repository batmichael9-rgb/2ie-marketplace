import "server-only";

import {
  sendNotification,
  setVapidDetails,
  type PushSubscription as WebPushSubscription,
} from "web-push";
import { db } from "@/lib/db";

/**
 * Notifications Push Web (PWA).
 *
 * Les clés VAPID identifient le serveur auprès des services de push (FCM,
 * Mozilla, Apple). La clé publique est aussi exposée au navigateur via
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY pour créer l'abonnement.
 *
 * Sans clés configurées, tout l'envoi est silencieusement désactivé : la
 * commande et la mise à jour de statut ne doivent jamais échouer à cause d'une
 * notification.
 */

export type PushPayload = {
  title: string;
  body: string;
  /** Page ouverte quand le client touche la notification. */
  url?: string;
  /** Remplace la notification précédente du même type au lieu d'en empiler. */
  tag?: string;
};

// `.trim()` systématique : une clé copiée-collée dans Vercel peut contenir un
// espace ou un retour à la ligne invisible qui rend la signature VAPID invalide.
const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:contact@2iemarket.bf";

let configured: boolean | null = null;

export function isPushConfigured(): boolean {
  return Boolean(publicKey && privateKey);
}

function ensureConfigured(): boolean {
  if (configured !== null) return configured;

  if (!publicKey || !privateKey) {
    configured = false;
    return configured;
  }

  try {
    setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (error) {
    console.error("Clés VAPID invalides, notifications Push désactivées", error);
    configured = false;
  }

  return configured;
}

function toWebPushSubscription(subscription: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): WebPushSubscription {
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  };
}

/**
 * Envoie une notification à tous les appareils abonnés d'un utilisateur.
 *
 * Les abonnements expirés (404 / 410 renvoyés par le service de push) sont
 * supprimés au passage. Les erreurs d'envoi sont avalées : un push qui échoue
 * ne doit pas faire échouer la commande en cours.
 */
export type PushFailure = {
  /** Code HTTP renvoyé par le service de push (403, 404, 410, 400…). */
  statusCode?: number;
  /** Corps exact de la réponse du service de push (BadJwtToken, VAPID mismatch…). */
  body?: string;
  /** Extrait de l'endpoint concerné, pour identifier l'appareil en cause. */
  endpoint?: string;
  /** true si l'abonnement a été supprimé car expiré (404 / 410). */
  expired?: boolean;
};

export type PushSendResult = {
  sent: number;
  failed: number;
  failures: PushFailure[];
};

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<PushSendResult> {
  if (!ensureConfigured()) return { sent: 0, failed: 0, failures: [] };

  const subscriptions = await db.pushSubscription.findMany({
    where: { userId },
    select: { endpoint: true, p256dh: true, auth: true },
  });

  if (subscriptions.length === 0) return { sent: 0, failed: 0, failures: [] };

  const body = JSON.stringify(payload);
  const expired: string[] = [];
  const failures: PushFailure[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await sendNotification(toWebPushSubscription(subscription), body, {
          TTL: 60 * 60,
          urgency: "high",
        });
        sent += 1;
      } catch (error) {
        failed += 1;
        // `web-push` expose la réponse brute du service de push : c'est elle
        // qui distingue un VAPID mismatch (403), un jeton refusé (400) ou un
        // abonnement mort (410). On la remonte au diagnostic.
        const webPushError = error as {
          statusCode?: number;
          body?: string;
          endpoint?: string;
        };
        const statusCode = webPushError.statusCode;
        const isExpired = statusCode === 404 || statusCode === 410;

        failures.push({
          statusCode,
          body: webPushError.body ? webPushError.body.slice(0, 300) : undefined,
          endpoint: subscription.endpoint.slice(0, 80),
          expired: isExpired,
        });

        if (isExpired) {
          expired.push(subscription.endpoint);
        } else {
          console.error(
            "Envoi de notification Push impossible",
            statusCode,
            webPushError.body,
            error,
          );
        }
      }
    }),
  );

  if (expired.length > 0) {
    await db.pushSubscription.deleteMany({ where: { endpoint: { in: expired } } });
  }

  return { sent, failed, failures };
}

/**
 * Variante « best effort » pour les Server Actions : n'échoue jamais et
 * n'attend pas plus longtemps que le nécessaire.
 */
export async function notifyUserSafely(userId: string, payload: PushPayload): Promise<void> {
  try {
    await sendPushToUser(userId, payload);
  } catch (error) {
    console.error("Notifications Push : erreur inattendue", error);
  }
}
