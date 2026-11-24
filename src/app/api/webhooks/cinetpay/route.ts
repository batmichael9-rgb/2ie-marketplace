import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { formatXof } from "@/lib/money";
import { applyPaymentStatus } from "@/lib/payments/apply";
import {
  cinetpayProvider,
  cinetpaySecretKey,
  parseCinetpayWebhookBody,
} from "@/lib/payments/cinetpay";
import { notifyUserSafely } from "@/lib/push";

/**
 * Notification CinetPay : /api/webhooks/cinetpay
 *
 * Le corps de la notification n'est jamais une preuve de paiement :
 *  1. l'en-tête `x-token` est comparé à CINETPAY_SECRET_KEY ;
 *  2. le statut est réinterrogé via /v2/payment/check ;
 *  3. le statut doit être ACCEPTED et le montant payé doit correspondre
 *     exactement au montant attendu ;
 *  4. l'application à la commande est idempotente (un rejeu ne crédite qu'une
 *     fois) et le vendeur reçoit une notification Push.
 */
export async function POST(request: Request) {
  const secret = cinetpaySecretKey();
  const token = request.headers.get("x-token") ?? "";

  if (!secret || token !== secret) {
    return NextResponse.json(
      { error: "invalid_token" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const rawBody = await request.text();
  const body = parseCinetpayWebhookBody(rawBody);
  if (!body) {
    // Réponse 200 : inutile de déclencher une tempête de retries sur un corps illisible.
    return NextResponse.json({ received: true, ignored: "unparsable" });
  }

  const merchantRefRaw =
    body.merchant_transaction_id ?? body.transaction_id ?? body.cpm_trans_id ?? null;
  if (!merchantRefRaw) {
    return NextResponse.json({ received: true, ignored: "missing_reference" });
  }
  const merchantRef = String(merchantRefRaw);

  const payment = await db.payment.findUnique({
    where: { merchantRef },
    include: {
      order: {
        select: {
          reference: true,
          totalXof: true,
          grossAmount: true,
          platformFee: true,
          vendorNetAmount: true,
          vendor: { select: { userId: true, shopName: true } },
        },
      },
    },
  });

  if (!payment) {
    return NextResponse.json({ received: true, ignored: "payment_not_found" });
  }

  // --- Anti-rejeu : un même événement n'est traité qu'une fois --------------
  const providerEventId = String(
    body.transaction_id ?? body.cpm_trans_id ?? body.notify_token ?? merchantRef,
  );
  let eventId: string | null = null;

  try {
    const event = await db.paymentEvent.create({
      data: {
        paymentId: payment.id,
        provider: cinetpayProvider.id,
        providerEventId,
        eventType: String(body.cpm_result ?? body.status ?? "payment.notification"),
        payload: rawBody.slice(0, 20_000),
        signatureValid: true,
      },
    });
    eventId = event.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.paymentEvent.findUnique({
        where: {
          provider_providerEventId: {
            provider: cinetpayProvider.id,
            providerEventId,
          },
        },
        select: { id: true, processedAt: true },
      });
      // Déjà traité avec succès : on répond 200 sans rien recréditer.
      if (existing?.processedAt) {
        return NextResponse.json({ received: true, duplicate: true });
      }
      eventId = existing?.id ?? null;
    } else {
      throw error;
    }
  }

  const fail = async (reason: string, status = 200) => {
    if (eventId) {
      await db.paymentEvent.update({
        where: { id: eventId },
        data: { processingError: reason },
      });
    }
    return NextResponse.json({ received: true, ignored: reason }, { status });
  };

  // --- Réinterrogation obligatoire de CinetPay ------------------------------
  const verified = await cinetpayProvider.verifyPayment({
    merchantRef,
    providerTxnId: payment.providerTxnId,
  });

  if (verified.status === "PENDING") {
    return fail("payment_not_confirmed");
  }

  if (verified.status !== "SUCCEEDED") {
    return fail(`payment_${verified.status.toLowerCase()}`);
  }

  const expectedAmount = payment.amountXof;
  if (Number(verified.amountXof) !== expectedAmount) {
    return fail("amount_mismatch");
  }

  const outcome = await applyPaymentStatus(merchantRef, "SUCCEEDED", {
    providerTxnId: verified.providerTxnId,
    raw: verified.raw,
  });

  if (outcome === "PAID") {
    await db.order.update({
      where: { id: payment.orderId },
      data: { payoutStatus: "READY_FOR_PAYOUT" },
    });

    await notifyUserSafely(payment.order.vendor.userId, {
      title: "💰 Paiement reçu sur 2iE Market",
      body: `Commande ${payment.order.reference} payée en ligne : ${formatXof(
        payment.order.grossAmount || payment.order.totalXof,
      )}, net vendeur ${formatXof(
        payment.order.vendorNetAmount ||
          payment.order.grossAmount - payment.order.platformFee,
      )}.`,
      url: "/espace-vendeur#finances",
      tag: `payment-${payment.order.reference}`,
    });
  }

  if (eventId) {
    await db.paymentEvent.update({
      where: { id: eventId },
      data: { processedAt: new Date(), processingError: null },
    });
  }

  return NextResponse.json({ received: true, outcome });
}
