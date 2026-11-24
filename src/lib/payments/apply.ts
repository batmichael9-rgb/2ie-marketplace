import { db } from "@/lib/db";
import { restockOrder } from "@/lib/stock";
import type { NormalizedPaymentStatus } from "./types";

export type ApplyOutcome = "IGNORED" | "PENDING" | "PAID" | "CLOSED";

/**
 * Applique un statut de paiement à la commande, de façon idempotente.
 *
 * Trois garde-fous empilés :
 *  1. le paiement déjà SUCCEEDED sort immédiatement ;
 *  2. updateMany conditionnel sur status IN (CREATED, PENDING) : la transition
 *     n'a lieu qu'une fois, même si deux webhooks arrivent en parallèle ;
 *  3. si la transition a déjà eu lieu (count === 0), on ne touche pas la commande.
 *
 * Un webhook rejoué 10 fois, ou un double appel du front, ne peut donc pas
 * valider deux fois la commande ni remettre deux fois le stock.
 */
export async function applyPaymentStatus(
  merchantRef: string,
  status: NormalizedPaymentStatus,
  info: { providerTxnId?: string | null; raw?: unknown; message?: string | null } = {},
): Promise<ApplyOutcome> {
  const rawFinalPayload = JSON.stringify(info.raw ?? {}).slice(0, 20_000);

  return db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { merchantRef } });
    if (!payment) return "IGNORED";

    if (payment.status === "SUCCEEDED" || payment.status === "REFUNDED") {
      return "IGNORED";
    }

    if (status === "PENDING") {
      if (payment.status === "CREATED") {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: "PENDING", rawFinalPayload },
        });
      }
      return "PENDING";
    }

    if (status === "SUCCEEDED") {
      const guard = await tx.payment.updateMany({
        where: { id: payment.id, status: { in: ["CREATED", "PENDING"] } },
        data: {
          status: "SUCCEEDED",
          confirmedAt: new Date(),
          providerTxnId: info.providerTxnId ?? payment.providerTxnId,
          rawFinalPayload,
        },
      });
      if (guard.count === 0) return "IGNORED";

      await tx.order.update({
        where: { id: payment.orderId },
        data: {
          paymentStatus: "PAID",
          status: "PAID",
          confirmedAt: new Date(),
          // Une vente en ligne est encaissée par la plateforme : la part nette
          // du vendeur devient due et attend son reversement Mobile Money.
          ...(payment.provider !== "CASH" ? { payoutStatus: "READY_FOR_PAYOUT" } : {}),
        },
      });
      return "PAID";
    }

    // FAILED | EXPIRED | REFUNDED : on libère le stock réservé.
    const guard = await tx.payment.updateMany({
      where: { id: payment.id, status: { in: ["CREATED", "PENDING"] } },
      data: {
        status: status === "EXPIRED" ? "EXPIRED" : status === "REFUNDED" ? "REFUNDED" : "FAILED",
        lastError: info.message ?? null,
        rawFinalPayload,
      },
    });
    if (guard.count === 0) return "IGNORED";

    await restockOrder(tx, payment.orderId);
    await tx.order.update({
      where: { id: payment.orderId },
      data: {
        paymentStatus: status === "REFUNDED" ? "REFUNDED" : "FAILED",
        status: status === "REFUNDED" ? "REFUNDED" : "CANCELLED",
      },
    });
    return "CLOSED";
  });
}
