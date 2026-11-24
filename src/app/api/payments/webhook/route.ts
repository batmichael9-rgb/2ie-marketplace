import { Prisma } from "@prisma/client";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { formatXof } from "@/lib/money";
import { applyPaymentStatus } from "@/lib/payments/apply";
import { cinetpayProvider, parseCinetpayWebhookBody } from "@/lib/payments/cinetpay";
import { notifyUserSafely } from "@/lib/push";

/**
 * Notification CinetPay API v1 : POST /api/payments/webhook
 *
 * Pipeline de sécurité :
 *  1. `notify_token` reçu est comparé (timing-safe) à celui enregistré à
 *     l'initialisation du paiement ;
 *  2. le statut est réinterrogé via GET /v1/payment/{id} avec un Bearer token ;
 *  3. le statut doit être SUCCESS et, si l'API renvoie un montant, il doit
 *     correspondre exactement au montant attendu ;
 *  4. l'application à la commande est idempotente : un rejeu ne crédite qu'une
 *     fois.
 *
 * Le corps de la notification ne sert jamais de preuve de paiement.
 */
function tokensMatch(expected: string | null, received: string | null): boolean {
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const body = parseCinetpayWebhookBody(rawBody);
  if (!body) {
    // Réponse 200 : inutile de déclencher une tempête de retries sur un corps illisible.
    return json({ received: true, ignored: "unparsable" });
  }

  const merchantRefRaw = body.merchant_transaction_id ?? null;
  const providerTxnRaw = body.transaction_id ?? null;
  const notifyToken = body.notify_token ? String(body.notify_token) : null;

  if (!merchantRefRaw && !providerTxnRaw) {
    return json({ received: true, ignored: "missing_reference" });
  }

  const include = {
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
  } as const;

  const payment = merchantRefRaw
    ? await db.payment.findUnique({
        where: { merchantRef: String(merchantRefRaw) },
        include,
      })
    : await db.payment.findFirst({
        where: {
          provider: cinetpayProvider.id,
          providerTxnId: String(providerTxnRaw),
        },
        include,
      });

  if (!payment) {
    return json({ received: true, ignored: "payment_not_found" });
  }

  // --- 1. Authentification de la notification -----------------------------
  if (!tokensMatch(payment.notifyToken, notifyToken)) {
    return json({ error: "invalid_notify_token" }, 401);
  }

  // --- Anti-rejeu : un même événement n'est traité qu'une fois --------------
  const providerEventId = String(
    providerTxnRaw ?? notifyToken ?? payment.merchantRef,
  );
  let eventId: string | null = null;

  try {
    const event = await db.paymentEvent.create({
      data: {
        paymentId: payment.id,
        provider: cinetpayProvider.id,
        providerEventId,
        eventType: "payment.notification",
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
        return json({ received: true, duplicate: true });
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
    return json({ received: true, ignored: reason }, status);
  };

  // --- 2. Réinterrogation obligatoire de CinetPay (Bearer v1) --------------
  const verified = await cinetpayProvider.verifyPayment({
    merchantRef: payment.merchantRef,
    providerTxnId: payment.providerTxnId,
  });

  if (verified.status === "PENDING") {
    return fail("payment_not_confirmed");
  }

  if (verified.status !== "SUCCEEDED") {
    return fail(`payment_${verified.status.toLowerCase()}`);
  }

  // --- 3. Montant exact quand l'API le fournit -----------------------------
  if (verified.amountXof != null && Number(verified.amountXof) !== payment.amountXof) {
    return fail("amount_mismatch");
  }

  // --- 4. Application idempotente -----------------------------------------
  const outcome = await applyPaymentStatus(payment.merchantRef, "SUCCEEDED", {
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

  return json({ received: true, outcome });
}
