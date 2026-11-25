import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Retour de la page de paiement en marque blanche.
 *
 * Le prestataire renvoie l'acheteur ici avec l'identifiant interne de la
 * commande ; on le redirige vers sa page de suivi habituelle. Aucune marque du
 * prestataire n'est exposée.
 */
export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { orderId } = await searchParams;
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/connexion?suivant=${encodeURIComponent("/mes-commandes")}`);
  }

  if (!orderId) redirect("/mes-commandes");

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { reference: true, buyerId: true },
  });

  if (!order || (order.buyerId !== user.id && user.role !== "ADMIN")) {
    redirect("/mes-commandes");
  }

  redirect(`/commande/${order.reference}`);
}
