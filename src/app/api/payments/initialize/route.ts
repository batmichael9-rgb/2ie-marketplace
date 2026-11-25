import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { appUrl, generateOrderReference } from "@/lib/domain";
import { computeFeeBreakdown } from "@/lib/money";
import { applyPaymentStatus } from "@/lib/payments/apply";
import { moneyfusionProvider } from "@/lib/payments/moneyfusion";
import { reserveStock } from "@/lib/stock";

/**
 * Encaissement acheteur (Payin) — POST /api/payments/initialize
 *
 * Le prix est relu en base : le client ne peut jamais imposer `totalPrice`.
 * L'acheteur paie exactement le prix du catalogue ; la commission de 5 % est
 * déduite de la part vendeur (95 % nets). Le `tokenPay` renvoyé par Money Fusion
 * est conservé sur la commande (clé d'idempotence des webhooks) et l'acheteur
 * est redirigé vers l'URL de paiement.
 */
const initSchema = z.object({
  productId: z.string().trim().min(1, "Produit manquant : recharge la page."),
  quantity: z.coerce.number().int().min(1).max(50).default(1),
  buyerName: z.string().trim().min(2, "Indique ton nom complet.").max(80),
  buyerPhone: z.string().trim().min(8, "Indique ton numéro de téléphone.").max(20),
  operator: z
    .enum(["ORANGE_MONEY", "MOOV_MONEY", "WAVE", "CARD"], {
      error: "Choisis ton moyen de paiement.",
    })
    .default("ORANGE_MONEY"),
  buyerRoom: z.string().trim().max(30).optional().or(z.literal("")),
  pickupSlot: z.string().trim().max(60).optional().or(z.literal("")),
  note: z.string().trim().max(300).optional().or(z.literal("")),
  shareCode: z.string().trim().max(20).optional().or(z.literal("")),
  idempotencyKey: z.string().trim().min(16, "Clé d'idempotence invalide.").max(80),
});

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError("invalid_body", 400);
  }

  const parsed = initSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_input",
        message: parsed.error.issues[0]?.message ?? "Formulaire incomplet.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!moneyfusionProvider.isEnabled()) {
    return jsonError("payment_unavailable", 503);
  }

  const data = parsed.data;

  const product = await db.product.findUnique({
    where: { id: data.productId },
    include: {
      vendor: {
        select: { id: true, userId: true, isActive: true, orangeMoneyNumber: true },
      },
    },
  });

  if (!product || !product.isActive || !product.vendor.isActive) {
    return jsonError("product_unavailable", 404);
  }

  // Sans compte de versement, le vendeur ne peut pas recevoir ses 95 % :
  // l'encaissement en ligne reste bloqué.
  if (!product.vendor.orangeMoneyNumber) {
    return jsonError("vendor_payout_not_configured", 409);
  }

  const outOfStock =
    product.stockMode === "OUT_OF_STOCK" ||
    (product.stockMode === "TRACKED" && product.stockQty < data.quantity);
  if (outOfStock) return jsonError("out_of_stock", 409);

  // --- Déduplication : même clé = même commande, pas de second débit --------
  const existingPayment = await db.payment.findUnique({
    where: {
      provider_idempotencyKey: {
        provider: moneyfusionProvider.id,
        idempotencyKey: data.idempotencyKey,
      },
    },
    include: { order: { select: { reference: true } } },
  });

  if (existingPayment) {
    return NextResponse.json(
      {
        reference: existingPayment.order.reference,
        paymentUrl: existingPayment.checkoutUrl,
        duplicate: true,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const grossAmount = product.priceXof * data.quantity;
  const { platformFee, vendorNetAmount } = computeFeeBreakdown(grossAmount);
  const reference = generateOrderReference();
  const merchantRef = `${reference}-1`;

  const shareLink = data.shareCode
    ? await db.shareLink.findUnique({ where: { code: data.shareCode }, select: { id: true } })
    : null;

  let orderId = "";

  try {
    await db.$transaction(async (tx) => {
      const reserved = await reserveStock(tx, product.id, data.quantity);
      if (!reserved) throw new Error("OUT_OF_STOCK");

      const order = await tx.order.create({
        data: {
          reference,
          buyerId: user.id,
          vendorId: product.vendorId,
          shareLinkId: shareLink?.id ?? null,
          type: product.isReservable ? "RESERVATION" : "DIRECT",
          status: "AWAITING_PAYMENT",
          paymentStatus: "UNPAID",
          subtotalXof: grossAmount,
          feesXof: 0,
          totalXof: grossAmount,
          grossAmount,
          platformFee,
          vendorNetAmount,
          payoutStatus: "PENDING",
          buyerName: data.buyerName,
          buyerPhone: data.buyerPhone,
          buyerRoom: data.buyerRoom || null,
          buyerNote: data.note || null,
          pickupSlot: data.pickupSlot || null,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          items: {
            create: {
              productId: product.id,
              quantity: data.quantity,
              unitPriceXof: product.priceXof,
              productSnapshot: JSON.stringify({
                name: product.name,
                priceXof: product.priceXof,
                image: null,
              }),
            },
          },
        },
      });

      orderId = order.id;

      await tx.stockMovement.create({
        data: {
          productId: product.id,
          delta: -data.quantity,
          reason: "SALE",
          orderId: order.id,
        },
      });

      await tx.payment.create({
        data: {
          orderId: order.id,
          provider: moneyfusionProvider.id,
          operator: data.operator,
          idempotencyKey: data.idempotencyKey,
          merchantRef,
          amountXof: grossAmount,
          status: "PENDING",
        },
      });

      if (shareLink) {
        await tx.shareLink.update({
          where: { id: shareLink.id },
          data: { conversionsCount: { increment: 1 } },
        });
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "OUT_OF_STOCK") {
      return jsonError("out_of_stock", 409);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await db.payment.findUnique({
        where: {
          provider_idempotencyKey: {
            provider: moneyfusionProvider.id,
            idempotencyKey: data.idempotencyKey,
          },
        },
        include: { order: { select: { reference: true } } },
      });
      if (duplicate) {
        return NextResponse.json(
          {
            reference: duplicate.order.reference,
            paymentUrl: duplicate.checkoutUrl,
            duplicate: true,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
    }
    console.error("Initialisation du paiement en ligne :", error);
    return jsonError("payment_init_failed", 500);
  }

  // --- Appel Money Fusion hors transaction ---------------------------------
  const intent = await moneyfusionProvider.createIntent({
    merchantRef,
    idempotencyKey: data.idempotencyKey,
    amountXof: grossAmount,
    description: `${product.name} × ${data.quantity}`.slice(0, 100),
    orderReference: reference,
    orderId,
    userId: user.id,
    buyer: { name: data.buyerName, phone: data.buyerPhone, email: user.email },
    returnUrl: `${appUrl()}/orders?orderId=${orderId}`,
    notifyUrl: `${appUrl()}/api/payments/webhook`,
    metadata: {
      product: product.id,
      vendor: product.vendorId,
      gross: grossAmount,
      fee: platformFee,
      operator: data.operator,
    },
  });

  await db.payment.update({
    where: { merchantRef },
    data: {
      status: intent.status === "FAILED" ? "FAILED" : intent.status,
      checkoutUrl: intent.checkoutUrl ?? null,
      notifyToken: intent.notifyToken ?? null,
      providerTxnId: intent.providerTxnId ?? null,
      rawInitPayload: JSON.stringify(intent.raw ?? {}).slice(0, 20_000),
      lastError: intent.status === "FAILED" ? (intent.message ?? null) : null,
    },
  });

  if (intent.providerTxnId) {
    await db.order.update({
      where: { id: orderId },
      data: { paymentToken: intent.providerTxnId, tokenPay: intent.providerTxnId },
    });
  }

  if (intent.status === "FAILED" || !intent.checkoutUrl) {
    await applyPaymentStatus(merchantRef, "FAILED", {
      message: intent.message ?? null,
      raw: intent.raw,
    });
    return NextResponse.json(
      {
        error: "payment_init_failed",
        message:
          intent.message ?? "Le paiement n'a pas pu être initialisé. Réessaie dans un instant.",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      reference,
      orderId,
      paymentUrl: intent.checkoutUrl,
      grossAmount,
      platformFee,
      vendorNetAmount,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
