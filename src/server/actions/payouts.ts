"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireVendor } from "@/lib/auth";
import { db } from "@/lib/db";
import { triggerVendorPayout } from "@/lib/payments/payout";

/**
 * Relance de secours d'un virement en échec, depuis l'espace administrateur.
 * Le flux normal (confirmation de réception ou auto-release 48 h) ne passe
 * jamais par cette action.
 */
export async function triggerPayoutAction(formData: FormData) {
  await requireAdmin();

  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) redirect("/espace-admin?erreur=commande");

  const result = await triggerVendorPayout(orderId);

  revalidatePath("/espace-admin");
  revalidatePath("/espace-vendeur");

  if (!result.ok) {
    redirect(
      `/espace-admin?erreur=${encodeURIComponent(
        result.message ?? "Le reversement n'a pas pu être déclenché.",
      )}`,
    );
  }

  redirect("/espace-admin?reversement=ok");
}

/**
 * Relance immédiate d'un virement en échec depuis l'Espace Commerçant.
 * Le vendeur ne peut relancer que ses propres commandes.
 */
export async function retryVendorPayoutAction(formData: FormData) {
  const { vendor } = await requireVendor();

  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) redirect("/espace-vendeur?erreur=commande");

  const order = await db.order.findFirst({
    where: { id: orderId, vendorId: vendor.id },
    select: { id: true },
  });
  if (!order) redirect("/espace-vendeur?erreur=commande");

  const result = await triggerVendorPayout(order.id);

  revalidatePath("/espace-admin");
  revalidatePath("/espace-vendeur");

  if (!result.ok) {
    redirect(
      `/espace-vendeur?erreur=${encodeURIComponent(
        result.message ?? "Le reversement n'a pas pu être déclenché.",
      )}`,
    );
  }

  redirect("/espace-vendeur?versement=relance");
}
