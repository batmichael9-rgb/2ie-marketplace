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
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (!ensureConfigured()) return { sent: 0, failed: 0 };

  const subscriptions = await db.pushSubscription.findMany({
    where: { userId },
    select: { endpoint: true, p256dh: true, auth: true },
  });

  if (subscriptions.length === 0) return { sent: 0, failed: 0 };

  const body = JSON.stringify(payload);
  const expired: string[] = [];
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
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          expired.push(subscription.endpoint);
        } else {
          console.error("Envoi de notification Push impossible", statusCode, error);
        }
      }
    }),
  );

  if (expired.length > 0) {
    await db.pushSubscription.deleteMany({ where: { endpoint: { in: expired } } });
  }

  return { sent, failed };
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
