"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canBuyerCancelOrder } from "@/lib/domain";
import { completeAndPayoutOrder } from "@/lib/payments/auto-release";
import { notifyUserSafely } from "@/lib/push";
import { restockOrder } from "@/lib/stock";

/**
 * Statuts dans lesquels le client peut encore annuler lui-même.
 *
 * - `AWAITING_PAYMENT` : commande Mobile Money jamais confirmée.
 * - `VENDOR_CONFIRMED` : accepté uniquement tant que le vendeur n'a pas confirmé
 *   explicitement (`confirmedAt` vide). C'est le cas des commandes payées à la
 *   réception, créées directement dans cet état.
 *
 * Dès que le vendeur a confirmé, préparé, livré, ou qu'un paiement en ligne a
 * été encaissé, l'annulation passe par le vendeur (remboursement éventuel).
 */
const CANCELLABLE_STATUSES = ["AWAITING_PAYMENT", "VENDOR_CONFIRMED"];

export async function cancelOrderAction(formData: FormData) {
  const user = await requireUser("/mes-commandes");
  const orderId = String(formData.get("orderId") ?? "");

  const order = await db.order.findFirst({
    where: { id: orderId, buyerId: user.id },
    select: { id: true, reference: true, status: true, paymentStatus: true, confirmedAt: true },
  });

  if (!order) redirect("/mes-commandes?erreur=commande");

  if (order.paymentStatus === "PAID") {
    redirect(`/commande/${order.reference}?erreur=paiement`);
  }

  if (!canBuyerCancelOrder(order)) {
    redirect(`/commande/${order.reference}?erreur=trop-tard`);
  }

  const cancelled = await db.$transaction(async (tx) => {
    // Mise à jour conditionnelle : si le vendeur confirme ou livre pendant que le
    // client clique, l'un des deux update ne touche aucune ligne. Aucun risque de
    // commander deux fois la même unité ni de remettre en stock une commande livrée.
    const guard = await tx.order.updateMany({
      where: {
        id: order.id,
        buyerId: user.id,
        status: { in: CANCELLABLE_STATUSES },
        confirmedAt: null,
        paymentStatus: { not: "PAID" },
      },
      data: { status: "CANCELLED" },
    });

    if (guard.count === 0) return false;

    await tx.payment.updateMany({
      where: { orderId: order.id, status: { in: ["CREATED", "PENDING"] } },
      data: { status: "EXPIRED", lastError: "Annulée par le client" },
    });

    // Remet les quantités réservées dans le stock du vendeur et journalise le
    // mouvement (reason = CANCEL).
    await restockOrder(tx, order.id);

    return true;
  });

  revalidatePath("/");
  revalidatePath("/mes-commandes");
  revalidatePath("/espace-vendeur");
  revalidatePath(`/commande/${order.reference}`);

  if (!cancelled) {
    redirect(`/commande/${order.reference}?erreur=trop-tard`);
  }

  redirect(`/commande/${order.reference}?annulee=1`);
}

/**
 * Confirmation de réception par l'acheteur : la commande passe à « Terminée »
 * et le reversement des 95 % est déclenché immédiatement, sans administrateur.
 */
export async function confirmReceiptAction(formData: FormData) {
  const user = await requireUser("/mes-commandes");
  const orderId = String(formData.get("orderId") ?? "");

  const order = await db.order.findFirst({
    where: { id: orderId, buyerId: user.id },
    include: {
      vendor: { select: { userId: true, shopName: true } },
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!order) redirect("/mes-commandes?erreur=commande");

  if (order.status !== "DELIVERED" || order.paymentStatus !== "PAID") {
    redirect(`/commande/${order.reference}?erreur=reception`);
  }

  const guard = await db.order.updateMany({
    where: {
      id: order.id,
      buyerId: user.id,
      status: "DELIVERED",
      paymentStatus: "PAID",
    },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  if (guard.count === 0) {
    redirect(`/commande/${order.reference}?erreur=reception`);
  }

  const payment = order.payments[0];
  if (payment && payment.provider !== "CASH") {
    await completeAndPayoutOrder(order.id).catch((error) => {
      console.error("Reversement après confirmation de réception :", error);
    });

    await notifyUserSafely(order.vendor.userId, {
      title: "✅ Réception confirmée",
      body: `Commande ${order.reference} terminée : les 95 % nets sont en cours de reversement.`,
      url: "/espace-vendeur#finances",
      tag: `payout-${order.id}`,
    }).catch(() => undefined);
  }

  revalidatePath("/espace-vendeur");
  revalidatePath("/espace-admin");
  revalidatePath("/mes-commandes");
  revalidatePath(`/commande/${order.reference}`);

  redirect(`/commande/${order.reference}?reception=ok`);
}
