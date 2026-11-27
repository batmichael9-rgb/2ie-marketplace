import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkPayoutStatus } from "@/lib/payments/payout";
import { parseMoneyFusionWebhookBody } from "@/lib/payments/moneyfusion";
import { verifyWebhookSecret } from "@/lib/payments/webhook-auth";

/**
 * Notification de reversement vendeur (Payout) : POST /api/payouts/webhook
 *
 * Événements : `payout.session.completed`, `payout.session.cancelled`.
 * Le token du virement identifie la commande ; la déduplication et la mise à
 * jour sont idempotentes (un rejeu ne change rien).
 */
function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function extractToken(body: Record<string, unknown>): string | null {
  const token = body.tokenPay ?? body.token_pay ?? body.token ?? body.payout_token;
  return token ? String(token) : null;
}

export async function POST(request: Request) {
  // Même règle que le webhook Payin : secret obligatoire en production,
  // vérifié en temps constant.
  const auth = verifyWebhookSecret(request);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status);
  }

  const rawBody = await request.text();
  const body = parseMoneyFusionWebhookBody(rawBody);
  if (!body) return json({ received: true, ignored: "unparsable" });

  const token = extractToken(body);
  if (!token) return json({ received: true, ignored: "missing_token" });

  const order = await db.order.findFirst({
    where: { payoutToken: token },
    select: { id: true, payoutStatus: true, reference: true },
  });

  if (!order) return json({ received: true, ignored: "order_not_found" });

  const event = String(body.event ?? "");
  const eventKey = `${token}:${event || String(body.statut ?? "notification")}`;

  try {
    await db.paymentEvent.create({
      data: {
        provider: "MONEYFUSION_PAYOUT",
        providerEventId: eventKey,
        eventType: event || "payout.notification",
        payload: rawBody.slice(0, 20_000),
        signatureValid: true,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return json({ received: true, duplicate: true });
    }
    throw error;
  }

  // Statut canonique : on interroge Money Fusion plutôt que de faire confiance
  // au seul corps de la notification. Un appelant qui forgerait « completed »
  // ne peut donc jamais marquer un reversement comme payé.
  const verified = await checkPayoutStatus(token);

  const completed = verified.status === "PAID";
  const cancelled = verified.status === "CANCELLED";

  if (completed && order.payoutStatus !== "PAID") {
    await db.order.update({
      where: { id: order.id },
      data: { payoutStatus: "PAID", payoutError: null },
    });
    await db.paymentEvent.updateMany({
      where: { provider: "MONEYFUSION_PAYOUT", providerEventId: eventKey },
      data: { processedAt: new Date() },
    });
    return json({ received: true, outcome: "PAID" });
  }

  if (cancelled) {
    // Échec conservé pour diagnostic ; la relance de secours est proposée dans
    // l'espace administrateur (le flux normal, lui, reste automatique).
    await db.order.update({
      where: { id: order.id },
      data: {
        payoutStatus: "FAILED",
        payoutError: "Virement annulé ou rejeté par Money Fusion.",
      },
    });
    await db.paymentEvent.updateMany({
      where: { provider: "MONEYFUSION_PAYOUT", providerEventId: eventKey },
      data: {
        processedAt: new Date(),
        processingError: "payout_cancelled",
      },
    });
    return json({ received: true, outcome: "FAILED" });
  }

  // Statut encore indécis : l'événement reste non traité pour qu'un nouvel
  // appel de Money Fusion (ou la réconciliation 48 h) puisse le finaliser.
  await db.paymentEvent.updateMany({
    where: { provider: "MONEYFUSION_PAYOUT", providerEventId: eventKey },
    data: { processingError: "payout_pending" },
  });

  return json({ received: true, outcome: "PENDING" });
}
