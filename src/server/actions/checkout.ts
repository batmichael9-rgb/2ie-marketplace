"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { appUrl, generateOrderReference } from "@/lib/domain";
import { computeFeeBreakdown, formatXof } from "@/lib/money";
import { applyPaymentStatus } from "@/lib/payments/apply";
import { getProvider } from "@/lib/payments";
import { recordPreferenceSignal } from "@/lib/preferences";
import { notifyUserSafely } from "@/lib/push";
import { reserveStock } from "@/lib/stock";
import { checkoutSchema } from "@/lib/validators";

class StockError extends Error {}

/**
 * Création de commande + intention de paiement.
 *
 * Ordre des opérations :
 *  1. déduplication par clé d'idempotence (le client qui a perdu le réseau et
 *     renvoie son formulaire retombe sur sa commande existante) ;
 *  2. transaction courte : réservation atomique du stock, commande, paiement ;
 *  3. appel du PSP hors transaction (un appel réseau ne doit jamais tenir un
 *     verrou de base) ;
 *  4. mise à jour du paiement puis redirection.
 *
 * Aucune validation de commande ne dépend du retour du navigateur.
 */
export async function createOrderAction(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");

  const parsed = checkoutSchema.safeParse({
    productId,
    quantity: formData.get("quantity"),
    provider: formData.get("provider"),
    operator: formData.get("operator") || undefined,
    buyerName: formData.get("buyerName"),
    buyerPhone: formData.get("buyerPhone"),
    buyerRoom: formData.get("buyerRoom"),
    pickupSlot: formData.get("pickupSlot"),
    note: formData.get("note"),
    shareCode: formData.get("shareCode"),
    idempotencyKey: formData.get("idempotencyKey"),
  });

  if (!parsed.success) {
    // On renvoie chaque erreur vers son champ pour que l'étudiant sache quoi
    // corriger, au lieu d'un message global du type « Invalid input ».
    const visibleFields = new Set([
      "quantity",
      "provider",
      "operator",
      "buyerName",
      "buyerPhone",
      "buyerRoom",
      "pickupSlot",
      "note",
    ]);
    const fieldErrors: Record<string, string> = {};
    let globalMessage: string | null = null;

    for (const issue of parsed.error.issues) {
      const field = typeof issue.path[0] === "string" ? issue.path[0] : "";
      if (visibleFields.has(field)) {
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      } else if (!globalMessage) {
        globalMessage = issue.message;
      }
    }

    const params = new URLSearchParams();
    if (Object.keys(fieldErrors).length > 0) {
      params.set("champs", JSON.stringify(fieldErrors));
    }
    if (globalMessage) {
      params.set("erreur", globalMessage);
    }
    if ([...params.keys()].length === 0) {
      params.set("erreur", "Formulaire incomplet.");
    }

    redirect(`/commander/${productId}?${params.toString()}`);
  }

  const data = parsed.data;

  // Le paiement en ligne est le seul mode accepté, quel que soit le champ
  // « provider » envoyé par le navigateur.
  const provider = getProvider("MONEYFUSION");
  if (!provider || !provider.isEnabled()) {
    redirect(`/commander/${productId}?erreur=${encodeURIComponent("Mode de paiement indisponible.")}`);
  }

  const product = await db.product.findUnique({
    where: { id: data.productId },
    include: {
      vendor: { select: { id: true, userId: true, momoNumber: true, momoOperator: true } },
    },
  });

  if (!product || !product.isActive) {
    redirect(`/commander/${productId}?erreur=${encodeURIComponent("Produit indisponible.")}`);
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/connexion?suivant=${encodeURIComponent(`/commander/${productId}`)}`);
  }

  // --- 1. Déduplication -----------------------------------------------------
  const existingPayment = await db.payment.findUnique({
    where: {
      provider_idempotencyKey: {
        provider: provider.id,
        idempotencyKey: data.idempotencyKey,
      },
    },
    include: { order: { select: { reference: true } } },
  });

  if (existingPayment) {
    redirect(`/commande/${existingPayment.order.reference}`);
  }

  const quantity = data.quantity;
  // Le prix du catalogue est exactement ce que paie l'acheteur. La commission
  // de 5 % n'est retenue que sur les paiements en ligne, sur la part vendeur.
  const subtotalXof = product.priceXof * quantity;
  const isOnline = provider.id !== "CASH";
  const { platformFee, vendorNetAmount } = computeFeeBreakdown(subtotalXof);
  const feesXof = 0;
  const totalXof = subtotalXof;
  const payoutStatus = "PENDING";
  const reference = generateOrderReference();
  const merchantRef = `${reference}-1`;

  const shareLink = data.shareCode
    ? await db.shareLink.findUnique({ where: { code: data.shareCode }, select: { id: true } })
    : null;

  let merchantReference = merchantRef;
  let createdOrderId: string | null = null;

  try {
    // --- 2. Transaction courte ---------------------------------------------
    await db.$transaction(async (tx) => {
      const reserved = await reserveStock(tx, product.id, quantity);
      if (!reserved) throw new StockError();

      const order = await tx.order.create({
        data: {
          reference,
          buyerId: user.id,
          vendorId: product.vendorId,
          shareLinkId: shareLink?.id ?? null,
          type: product.isReservable ? "RESERVATION" : "DIRECT",
          // Une commande payée à la réception est confirmée immédiatement ;
          // une commande Mobile Money attend la confirmation du PSP.
          status: provider.id === "CASH" ? "VENDOR_CONFIRMED" : "AWAITING_PAYMENT",
          paymentStatus: "UNPAID",
          subtotalXof,
          feesXof,
          totalXof,
          grossAmount: totalXof,
          platformFee: isOnline ? platformFee : 0,
          vendorNetAmount: isOnline ? vendorNetAmount : totalXof,
          payoutStatus,
          buyerName: data.buyerName,
          buyerPhone: data.buyerPhone,
          buyerRoom: data.buyerRoom || null,
          buyerNote: data.note || null,
          pickupSlot: data.pickupSlot || null,
          expiresAt:
            provider.id === "CASH" ? null : new Date(Date.now() + 15 * 60 * 1000),
          items: {
            create: {
              productId: product.id,
              quantity,
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

      await tx.stockMovement.create({
        data: {
          productId: product.id,
          delta: -quantity,
          reason: "SALE",
          orderId: order.id,
        },
      });

      await tx.payment.create({
        data: {
          orderId: order.id,
          provider: provider.id,
          // Opérateur choisi par l'acheteur (Orange Money, Moov, Wave, carte).
          operator: data.operator ?? "ORANGE_MONEY",
          idempotencyKey: data.idempotencyKey,
          merchantRef,
          amountXof: totalXof,
          status: "CREATED",
        },
      });

      if (shareLink) {
        await tx.shareLink.update({
          where: { id: shareLink.id },
          data: { conversionsCount: { increment: 1 } },
        });
      }

      merchantReference = merchantRef;
      createdOrderId = order.id;
    });
  } catch (error) {
    if (error instanceof StockError) {
      redirect(
        `/commander/${productId}?erreur=${encodeURIComponent(
          "Stock insuffisant : quelqu'un vient de commander. Réduis la quantité.",
        )}`,
      );
    }

    // Deux onglets ouverts avec la même clé : on renvoie vers la commande créée.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await db.payment.findUnique({
        where: {
          provider_idempotencyKey: {
            provider: provider.id,
            idempotencyKey: data.idempotencyKey,
          },
        },
        include: { order: { select: { reference: true } } },
      });
      if (duplicate) redirect(`/commande/${duplicate.order.reference}`);
    }

    throw error;
  }

  // --- Signal de commande (personnalisation) --------------------------------
  after(() =>
    recordPreferenceSignal({
      userId: user.id,
      actionType: "ORDER",
      productId: product.id,
      categoryId: product.categoryId,
    }),
  );

  // --- Notification Push du vendeur -----------------------------------------
  // Envoyée dès que la commande existe : un vendeur au téléphone la voit même
  // s'il n'a pas l'application ouverte. Un échec de push ne bloque jamais la
  // commande (notifyUserSafely avale les erreurs).
  await notifyUserSafely(product.vendor.userId, {
    title: "🛍️ Nouvelle commande sur 2iE Market !",
    body: `${data.buyerName} a commandé ${product.name} (${formatXof(totalXof)})`,
    url: "/espace-vendeur",
    tag: `order-${reference}`,
  });

  const payment = await db.payment.findUnique({ where: { merchantRef: merchantReference } });
  if (!payment || !createdOrderId) redirect(`/commande/${reference}`);

  // --- 3. Appel du PSP hors transaction ------------------------------------
  let intent;
  try {
    intent = await provider.createIntent({
      merchantRef: merchantReference,
      idempotencyKey: data.idempotencyKey,
      amountXof: totalXof,
      description: `${product.name} × ${quantity}`.slice(0, 100),
      orderReference: reference,
      orderId: createdOrderId,
      userId: user.id,
      buyer: {
        name: data.buyerName,
        phone: data.buyerPhone,
        email: user.email,
      },
      returnUrl: `${appUrl()}/orders?orderId=${createdOrderId}`,
      notifyUrl: `${appUrl()}/api/payments/webhook`,
      metadata: { product: product.id, vendor: product.vendorId },
    });
  } catch (error) {
    intent = {
      status: "FAILED" as const,
      message: "Le service de paiement est momentanément indisponible.",
      raw: { error: error instanceof Error ? error.message : String(error) },
    };
  }

  // --- 4. Traçabilité -------------------------------------------------------
  await db.payment.update({
    where: { merchantRef: merchantReference },
    data: {
      status:
        intent.status === "FAILED"
          ? "FAILED"
          : intent.status === "SUCCEEDED"
            ? "SUCCEEDED"
            : "PENDING",
      checkoutUrl: intent.checkoutUrl ?? null,
      notifyToken: intent.notifyToken ?? null,
      providerTxnId: intent.providerTxnId ?? null,
      rawInitPayload: JSON.stringify(intent.raw ?? {}).slice(0, 20_000),
      lastError: intent.status === "FAILED" ? (intent.message ?? null) : null,
    },
  });

  // Le token Payin est conservé sur la commande : c'est la clé d'idempotence
  // des webhooks (un rejeu ne peut jamais créditer deux fois).
  if (intent.providerTxnId) {
    await db.order.update({
      where: { id: createdOrderId },
      data: { paymentToken: intent.providerTxnId, tokenPay: intent.providerTxnId },
    });
  }

  if (intent.status === "FAILED") {
    await applyPaymentStatus(merchantReference, "FAILED", {
      message: intent.message ?? null,
      raw: intent.raw,
    });
    redirect(`/commande/${reference}?echec=1`);
  }

  if (intent.checkoutUrl) {
    redirect(intent.checkoutUrl);
  }

  redirect(`/commande/${reference}`);
}
