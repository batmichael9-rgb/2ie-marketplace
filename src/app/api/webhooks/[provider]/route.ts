import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getProvider } from "@/lib/payments";
import { applyPaymentStatus } from "@/lib/payments/apply";

/**
 * Webhook PSP : /api/webhooks/cinetpay
 *
 * Pipeline :
 *  1. déduplication de l'événement (UNIQUE provider + provider_event_id) ;
 *  2. vérification du jeton de notification ;
 *  3. réinterrogation de l'API du PSP pour le statut canonique ;
 *  4. application idempotente à la commande.
 *
 * Le corps du webhook n'est jamais une preuve de paiement : il ne sert qu'à
 * savoir qu'il faut vérifier.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerParam } = await params;
  const provider = getProvider(providerParam.toUpperCase());

  if (!provider) {
    return NextResponse.json({ error: "unknown_provider" }, { status: 404 });
  }

  const rawBody = await request.text();
  const parsed = provider.parseWebhook(rawBody);

  if (!parsed) {
    // On répond 200 pour éviter une tempête de retries sur un corps illisible.
    return NextResponse.json({ received: true, ignored: "unparsable" });
  }

  const payment = await db.payment.findUnique({
    where: { merchantRef: parsed.merchantRef },
    select: { id: true, merchantRef: true, notifyToken: true, provider: true, providerTxnId: true },
  });

  const signatureValid = parsed.notifyToken
    ? Boolean(payment?.notifyToken) && payment?.notifyToken === parsed.notifyToken
    : false;

  let eventId: string;
  try {
    const event = await db.paymentEvent.create({
      data: {
        paymentId: payment?.id ?? null,
        provider: provider.id,
        providerEventId: parsed.providerEventId,
        eventType: parsed.eventType ?? null,
        payload: rawBody.slice(0, 20_000),
        signatureValid,
      },
    });
    eventId = event.id;
  } catch (error) {
    // Événement déjà reçu : on répond 200 sans retraiter.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw error;
  }

  if (!payment) {
    await db.paymentEvent.update({
      where: { id: eventId },
      data: { processedAt: new Date(), processingError: "payment_not_found" },
    });
    return NextResponse.json({ received: true, ignored: "payment_not_found" });
  }

  if (parsed.notifyToken && !signatureValid) {
    await db.paymentEvent.update({
      where: { id: eventId },
      data: { processingError: "invalid_notify_token" },
    });
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const verified = await provider.verifyPayment({
    merchantRef: payment.merchantRef,
    providerTxnId: payment.providerTxnId,
  });

  const outcome = await applyPaymentStatus(parsed.merchantRef, verified.status, {
    providerTxnId: verified.providerTxnId,
    raw: verified.raw,
  });

  await db.paymentEvent.update({
    where: { id: eventId },
    data: { processedAt: new Date(), processingError: null },
  });

  return NextResponse.json({ received: true, outcome });
}
