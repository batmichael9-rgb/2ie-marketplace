import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeFeeBreakdown, formatXof } from "@/lib/money";
import { applyPaymentStatus } from "@/lib/payments/apply";
import { checkPaymentStatus, parseMoneyFusionWebhookBody } from "@/lib/payments/moneyfusion";
import { notifyUserSafely } from "@/lib/push";

/**
 * Notification Payin Money Fusion : POST /api/payments/webhook
 *
 * Événements traités : `payin.session.completed`, `payin.session.pending`,
 * `payin.session.cancelled` (ainsi que tout corps portant `statut: "paid"`).
 *
 * Pipeline :
 *  1. le token Payin (`tokenPay`) identifie la commande, jamais le montant ;
 *  2. l'événement est dédupliqué dans PaymentEvent ;
 *  3. le statut est réinterrogé côté serveur (`/paiementNotif/{token}`) ;
 *  4. l'application à la commande est idempotente : un rejeu ne crédite qu'une
 *     fois et ne reverse jamais deux fois.
 */

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function extractToken(body: Record<string, unknown>): string | null {
  const token = body.tokenPay ?? body.token_pay ?? body.token ?? body.payment_token;
  return token ? String(token) : null;
}

/**
 * Secret partagé facultatif (MONEYFUSION_WEBHOOK_SECRET).
 *
 * Money Fusion n'appose pas de signature cryptographique : quand le secret est
 * configuré, il doit être présenté dans `x-webhook-secret` (ou en Bearer).
 * L'absence de secret ne désactive jamais la vérification serveur du statut,
 * qui reste la seule preuve de paiement acceptée.
 */
function hasValidWebhookSecret(request: Request): boolean {
  const secret = process.env.MONEYFUSION_WEBHOOK_SECRET;
  if (!secret) return true;

  const header = request.headers.get("x-webhook-secret");
  const authorization = request.headers.get("authorization");
  return header === secret || authorization === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!hasValidWebhookSecret(request)) {
    return json({ error: "invalid_signature" }, 401);
  }

  const rawBody = await request.text();
  const body = parseMoneyFusionWebhookBody(rawBody);
  if (!body) {
    return json({ received: true, ignored: "unparsable" });
  }

  // Seul le token Payin identifie la commande. Un `personal_Info.orderId`
  // fourni par l'appelant ne suffit jamais : sinon n'importe qui connaissant
  // un identifiant de commande pourrait la déclarer payée.
  const token = extractToken(body);
  if (!token) {
    return json({ received: true, ignored: "missing_token" });
  }

  const order = await db.order.findFirst({
    where: { tokenPay: token },
    include: {
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      vendor: { select: { userId: true } },
    },
  });

  if (!order) {
    return json({ received: true, ignored: "order_not_found" });
  }

  const payment = order.payments[0];
  if (!payment) {
    return json({ received: true, ignored: "payment_not_found" });
  }

  // Le token de la notification doit être celui réellement émis pour ce
  // paiement : un token inventé ne peut pas cibler une commande existante.
  if (payment.providerTxnId && payment.providerTxnId !== token) {
    return json({ received: true, ignored: "token_mismatch" });
  }

  const event = body.event ? String(body.event) : "";
  const rawStatus = String(body.statut ?? body.status ?? "").trim().toLowerCase();
  const eventKey = event || rawStatus || "notification";

  // --- Anti-rejeu : un même événement n'est traité qu'une seule fois --------
  let eventId: string | null = null;
  try {
    const created = await db.paymentEvent.create({
      data: {
        paymentId: payment.id,
        provider: "MONEYFUSION",
        providerEventId: `${token ?? order.id}:${eventKey}`,
        eventType: event || "payin.notification",
        payload: rawBody.slice(0, 20_000),
        signatureValid: true,
      },
    });
    eventId = created.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.paymentEvent.findUnique({
        where: {
          provider_providerEventId: {
            provider: "MONEYFUSION",
            providerEventId: `${token ?? order.id}:${eventKey}`,
          },
        },
        select: { id: true, processedAt: true },
      });
      if (existing?.processedAt) {
        return json({ received: true, duplicate: true });
      }
      eventId = existing?.id ?? null;
    } else {
      throw error;
    }
  }

  const markProcessed = async (error: string | null = null) => {
    if (!eventId) return;
    await db.paymentEvent.update({
      where: { id: eventId },
      data: { processedAt: error ? null : new Date(), processingError: error },
    });
  };

  const completed = event.includes("completed") || rawStatus === "paid" || rawStatus === "success";
  const pending = event.includes("pending") || rawStatus === "pending";
  const cancelled =
    event.includes("cancel") || rawStatus === "cancelled" || rawStatus === "canceled";

  if (!completed && !pending && !cancelled) {
    await markProcessed(null);
    return json({ received: true, ignored: "unhandled_event" });
  }

  if (pending) {
    await applyPaymentStatus(payment.merchantRef, "PENDING", { raw: body });
    await markProcessed();
    return json({ received: true, outcome: "PENDING" });
  }

  if (cancelled) {
    const outcome = await applyPaymentStatus(payment.merchantRef, "EXPIRED", {
      raw: body,
      message: "Paiement annulé par l'acheteur",
    });
    await markProcessed();
    return json({ received: true, outcome });
  }

  // --- completed : vérification serveur obligatoire avant crédit ----------
  // Le corps de la notification n'est jamais une preuve de paiement. Sans
  // confirmation SUCCEEDED de Money Fusion, on ne crédite pas la commande.
  const verified = await checkPaymentStatus(token);

  if (verified.status !== "SUCCEEDED") {
    await markProcessed(
      verified.status === "FAILED" || verified.status === "EXPIRED"
        ? "payment_not_confirmed"
        : "payment_still_pending",
    );
    return json({ received: true, ignored: "payment_not_confirmed" });
  }

  if (
    verified.amountXof != null &&
    Number(verified.amountXof) !== Number(order.grossAmount || order.totalXof)
  ) {
    await markProcessed("amount_mismatch");
    return json({ received: true, ignored: "amount_mismatch" });
  }

  const outcome = await applyPaymentStatus(payment.merchantRef, "SUCCEEDED", {
    providerTxnId: token,
    raw: verified.raw,
  });

  if (outcome === "PAID") {
    // Commission plateforme / net vendeur : recalculés depuis le prix réellement
    // encaissé, jamais depuis le corps de la notification.
    const gross = order.grossAmount || order.totalXof;
    const { platformFee, vendorNetAmount } = computeFeeBreakdown(gross);

    await db.order.update({
      where: { id: order.id },
      data: {
        grossAmount: gross,
        platformFee,
        vendorNetAmount,
        payoutStatus: "READY_FOR_PAYOUT",
        paymentToken: token ?? order.paymentToken,
        tokenPay: token ?? order.tokenPay,
      },
    });

    await notifyUserSafely(order.vendor.userId, {
      title: "💰 Paiement reçu sur 2iE Market",
      body: `Commande ${order.reference} payée en ligne : ${formatXof(gross)}, net vendeur ${formatXof(
        vendorNetAmount,
      )}.`,
      url: "/espace-vendeur#finances",
      tag: `payment-${order.reference}`,
    });
  }

  await markProcessed();
  return json({ received: true, outcome });
}
