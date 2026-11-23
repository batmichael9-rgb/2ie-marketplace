import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isPushConfigured, sendPushToUser } from "@/lib/push";

const noStore = { "Cache-Control": "no-store" };

/**
 * Envoie une notification Push de test à l'utilisateur connecté.
 *
 * Sert de diagnostic « un clic » depuis le profil / l'espace vendeur : la
 * réponse distingue l'absence de clés VAPID, l'absence d'abonnement sur cet
 * appareil et un échec d'envoi du service de push.
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
      },
      { status: 409, headers: noStore },
    );
  }

  const { sent, failed } = await sendPushToUser(user.id, {
    title: "🔔 Test 2iE Market",
    body: "Les notifications et le son fonctionnent sur ce téléphone !",
    url: "/",
    tag: "2ie-market-test",
  });

  if (sent === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "send_failed",
        sent,
        failed,
        message:
          "Le service de push a refusé l'envoi. Réactive les notifications sur cet appareil.",
      },
      { status: 502, headers: noStore },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      sent,
      failed,
      message: "Notification de test envoyée : vérifie la bannière et le son.",
    },
    { headers: noStore },
  );
}
