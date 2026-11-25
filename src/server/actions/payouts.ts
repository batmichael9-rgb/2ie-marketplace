"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { triggerVendorPayout } from "@/lib/payments/payout";

/**
 * Reversement manuel des 95 % nets au vendeur, déclenché par un administrateur
 * depuis le tableau de bord des reversements.
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
