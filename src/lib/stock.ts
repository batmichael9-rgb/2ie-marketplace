import type { Prisma } from "@prisma/client";

/**
 * Réservation atomique de stock.
 *
 * L'UPDATE conditionnel est exécuté par la base : deux clients qui valident en
 * même temps ne peuvent pas vendre la même dernière unité. Ne jamais remplacer
 * ceci par un findUnique() suivi d'un update() — c'est la course classique.
 *
 * Retourne false si le stock est insuffisant.
 */
export async function reserveStock(
  tx: Prisma.TransactionClient,
  productId: string,
  quantity: number,
): Promise<boolean> {
  const affected = await tx.$executeRaw`
    UPDATE "Product"
       SET "stockQty" = "stockQty" - ${quantity}
     WHERE "id" = ${productId}
       AND ("stockMode" = 'UNLIMITED' OR "stockQty" >= ${quantity})
  `;
  return affected > 0;
}

/** Remet en stock les lignes d'une commande annulée ou dont le paiement a échoué. */
export async function restockOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    include: { product: { select: { id: true, stockMode: true } } },
  });

  for (const item of items) {
    if (item.product.stockMode !== "TRACKED") continue;

    await tx.product.update({
      where: { id: item.productId },
      data: { stockQty: { increment: item.quantity } },
    });

    await tx.stockMovement.create({
      data: {
        productId: item.productId,
        delta: item.quantity,
        reason: "CANCEL",
        orderId,
      },
    });
  }
}
