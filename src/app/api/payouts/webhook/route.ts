import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkPayoutStatus } from "@/lib/payments/payout";
import { parseMoneyFusionWebhookBody } from "@/lib/payments/moneyfusion";

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
  // au seul corps de la notification.
  const verified = await checkPayoutStatus(token);
  const rawStatus = String(body.statut ?? body.status ?? "").toLowerCase();

  const completed =
    verified.status === "PAID" ||
    event.includes("completed") ||
    rawStatus === "completed" ||
    rawStatus === "paid";

  const cancelled =
    verified.status === "CANCELLED" ||
    event.includes("cancel") ||
    rawStatus === "cancelled" ||
    rawStatus === "canceled";

  if (completed && order.payoutStatus !== "PAID_OUT") {
    await db.order.update({
      where: { id: order.id },
      data: { payoutStatus: "PAID_OUT" },
    });
    await db.paymentEvent.updateMany({
      where: { provider: "MONEYFUSION_PAYOUT", providerEventId: eventKey },
      data: { processedAt: new Date() },
    });
    return json({ received: true, outcome: "PAID_OUT" });
  }

  if (cancelled) {
    // Le virement peut être relancé depuis le tableau de bord administrateur.
    await db.order.update({
      where: { id: order.id },
      data: { payoutStatus: "READY_FOR_PAYOUT" },
    });
    await db.paymentEvent.updateMany({
      where: { provider: "MONEYFUSION_PAYOUT", providerEventId: eventKey },
      data: {
        processedAt: new Date(),
        processingError: "payout_cancelled",
      },
    });
    return json({ received: true, outcome: "READY_FOR_PAYOUT" });
  }

  await db.paymentEvent.updateMany({
    where: { provider: "MONEYFUSION_PAYOUT", providerEventId: eventKey },
    data: { processedAt: new Date() },
  });

  return json({ received: true, outcome: "PENDING" });
}
