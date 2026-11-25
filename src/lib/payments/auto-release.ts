import { db } from "@/lib/db";
import { checkPayoutStatus, triggerVendorPayout, type PayoutResult } from "./payout";

/**
 * Clôture d'une commande livrée et reversement de la part nette au vendeur.
 *
 * Utilisé par la confirmation de réception de l'acheteur et par l'auto-release
 * de secours : dans les deux cas, la commande passe à `COMPLETED` puis le
 * Payout est déclenché côté serveur, sans intervention de l'administrateur.
 */
export async function completeAndPayoutOrder(orderId: string): Promise<PayoutResult | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      payoutStatus: true,
      payments: { select: { provider: true }, take: 1 },
    },
  });

  if (!order || order.paymentStatus !== "PAID") return null;

  const online = order.payments.some((payment) => payment.provider !== "CASH");

  // Seule une commande livrée passe à Terminée. Une commande déjà terminée
  // reste éligible au déclenchement (reprise après un échec réseau).
  if (order.status === "DELIVERED") {
    await db.order.updateMany({
      where: { id: order.id, status: "DELIVERED", paymentStatus: "PAID" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  }

  if (!online) return null;

  // `triggerVendorPayout` est idempotent et ne renvoie rien si le virement est
  // déjà parti (PROCESSING) ou déjà réglé (PAID).
  return triggerVendorPayout(order.id);
}

export interface AutoReleaseResult {
  processed: number;
  paid: number;
  pending: number;
  failed: number;
}

/**
 * Réconcilie les virements `PROCESSING` avec Money Fusion.
 *
 * Filet de sécurité si le webhook Payout est perdu : le statut final est
 * récupéré via `/api/v1/payout/check-status/{token}` puis appliqué de façon
 * conditionnelle (aucun retour en arrière possible depuis `PAID`).
 */
export async function refreshProcessingPayouts(): Promise<{ checked: number; paid: number; failed: number }> {
  const orders = await db.order.findMany({
    where: { payoutStatus: "PROCESSING", payoutToken: { not: null } },
    select: { id: true, payoutToken: true },
    take: 20,
  });

  const result = { checked: orders.length, paid: 0, failed: 0 };

  for (const order of orders) {
    if (!order.payoutToken) continue;
    const status = await checkPayoutStatus(order.payoutToken);

    if (status.status === "PAID") {
      const updated = await db.order.updateMany({
        where: { id: order.id, payoutStatus: "PROCESSING" },
        data: { payoutStatus: "PAID", payoutError: null },
      });
      if (updated.count > 0) result.paid += 1;
    } else if (status.status === "CANCELLED") {
      const updated = await db.order.updateMany({
        where: { id: order.id, payoutStatus: "PROCESSING" },
        data: {
          payoutStatus: "FAILED",
          payoutError: "Virement annulé ou rejeté par Money Fusion.",
        },
      });
      if (updated.count > 0) result.failed += 1;
    }
  }

  return result;
}

/**
 * Libération automatique de secours : toute commande payée en ligne, livrée
 * depuis plus de 48 h, sans litige (ni annulée ni remboursée), est terminée et
 * reversée même si l'acheteur n'a jamais cliqué sur « Confirmer la réception ».
 *
 * Idempotent : les candidats sont limités aux statuts de payout encore
 * déclenchables ; le verrou de `triggerVendorPayout` empêche tout double envoi.
 */
export async function autoReleaseDeliveredOrders(): Promise<AutoReleaseResult> {
  // Statuts finaux des virements déjà partis (webhook manqué ou retardé).
  await refreshProcessingPayouts().catch((error) => {
    console.error("Réconciliation des reversements :", error);
  });

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1_000);

  const candidates = await db.order.findMany({
    where: {
      paymentStatus: "PAID",
      payments: { some: { provider: { not: "CASH" } } },
      OR: [
        // Cas nominal : livrée depuis 48 h, confirmation de l'acheteur oubliée.
        {
          status: "DELIVERED",
          deliveredAt: { lte: cutoff },
          payoutStatus: { in: ["READY_FOR_PAYOUT", "FAILED"] },
        },
        // Reprise des commandes terminées (ancien flux ou confirmation dont le
        // déclenchement réseau a échoué) qui attendent encore leur virement.
        // Les échecs `FAILED` restent réservés à la relance de secours.
        { status: "COMPLETED", payoutStatus: "READY_FOR_PAYOUT" },
      ],
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  const result: AutoReleaseResult = {
    processed: candidates.length,
    paid: 0,
    pending: 0,
    failed: 0,
  };

  for (const candidate of candidates) {
    const payout = await completeAndPayoutOrder(candidate.id);
    if (!payout) {
      result.pending += 1;
    } else if (payout.ok) {
      result.paid += 1;
    } else {
      result.failed += 1;
    }
  }

  return result;
}
