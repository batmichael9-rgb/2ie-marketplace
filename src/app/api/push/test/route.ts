import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isPushConfigured, sendPushToUser, type PushFailure } from "@/lib/push";

const noStore = { "Cache-Control": "no-store" };

/** Résume la première erreur web-push en une ligne lisible. */
function describeFailure(failure: PushFailure): string {
  const status = failure.statusCode ? `HTTP ${failure.statusCode}` : "Erreur inconnue";
  if (!failure.body) return status;
  return `${status} · ${failure.body}`;
}

/**
 * Envoie une notification Push de test à l'utilisateur connecté.
 *
 * Sert de diagnostic « un clic » depuis le profil / l'espace vendeur : la
 * réponse distingue l'absence de clés VAPID, l'absence d'abonnement sur cet
 * appareil et un échec du service de push, en renvoyant le statusCode et le
 * body exacts de web-push (403 VAPID mismatch, 400 BadJwtToken, 410 Gone…).
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", message: "Connecte-toi pour tester les notifications." },
      { status: 401, headers: noStore },
    );
  }

  if (!isPushConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "vapid_missing",
        message:
          "Clés VAPID absentes du serveur (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).",
        failures: [],
      },
      { status: 503, headers: noStore },
    );
  }

  const subscriptionCount = await db.pushSubscription.count({ where: { userId: user.id } });
  if (subscriptionCount === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "no_subscription",
        message: "Aucun appareil abonné : active d'abord les notifications sur ce téléphone.",
        failures: [],
      },
      { status: 409, headers: noStore },
    );
  }

  const { sent, failed, failures } = await sendPushToUser(user.id, {
    title: "🔔 Test 2iE Market",
    body: "Les notifications et le son fonctionnent sur ce téléphone !",
    url: "/",
    tag: "2ie-market-test",
  });

  if (sent === 0) {
    const expired = failures.some((failure) => failure.expired);
    return NextResponse.json(
      {
        ok: false,
        error: expired ? "subscription_expired" : "send_failed",
        sent,
        failed,
        failures,
        message: expired
          ? "Abonnement expiré : il a été supprimé. Réinitialise l'appareil pour le recréer."
          : `Le service de push a refusé l'envoi${
              failures[0] ? ` (${describeFailure(failures[0])})` : ""
            }. Réinitialise les notifications sur cet appareil.`,
      },
      { status: 502, headers: noStore },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      sent,
      failed,
      failures,
      message:
        failed > 0
          ? `Notification envoyée sur ${sent} appareil(s), ${failed} en échec${
              failures[0] ? ` (${describeFailure(failures[0])})` : ""
            }.`
          : "Notification de test envoyée : vérifie la bannière et le son.",
    },
    { headers: noStore },
  );
}
