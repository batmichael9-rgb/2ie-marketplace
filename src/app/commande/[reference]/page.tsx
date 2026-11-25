import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ClearIdempotency } from "@/components/clear-idempotency";
import { PaymentPoller } from "@/components/payment-poller";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  canBuyerCancelOrder,
  formatDate,
  type OrderStatus,
} from "@/lib/domain";
import { VENDOR_NET_PERCENT, formatPercent, formatXof } from "@/lib/money";
import { getProvider } from "@/lib/payments";
import { cancelOrderAction, confirmReceiptAction } from "@/server/actions/orders";
import { startOrderConversationAction } from "@/server/actions/messages";

export const metadata: Metadata = { title: "Ma commande" };

const CANCEL_ERRORS: Record<string, string> = {
  paiement:
    "Cette commande est déjà payée : contacte le vendeur pour un remboursement avant de l'annuler.",
  "trop-tard":
    "Trop tard : le vendeur a déjà validé, préparé ou livré cette commande. Contacte-le directement.",
  reception:
    "La réception ne peut être confirmée que pour une commande livrée et payée.",
};

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ annulee?: string; erreur?: string; reception?: string }>;
}) {
  const { reference } = await params;
  const { annulee, erreur, reception } = await searchParams;
  const netLabel = formatPercent(VENDOR_NET_PERCENT);

  const order = await db.order.findUnique({
    where: { reference },
    include: {
      vendor: true,
      buyer: { select: { fullName: true } },
      items: { include: { product: { include: { images: { take: 1 } } } } },
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!order) notFound();

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/connexion?suivant=${encodeURIComponent(`/commande/${reference}`)}`);
  }

  const isBuyer = order.buyerId === user.id;
  const isVendor = user.vendor?.id === order.vendorId;
  if (!isBuyer && !isVendor && user.role !== "ADMIN") notFound();

  const payment = order.payments[0];
  const provider = payment ? getProvider(payment.provider) : null;
  const statusLabel = ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status;
  const paid = order.paymentStatus === "PAID";

  const pendingOnlinePayment =
    payment?.provider === "MONEYFUSION" &&
    (payment.status === "PENDING" || payment.status === "CREATED") &&
    !paid;

  const cancellable = isBuyer && canBuyerCancelOrder(order);
  const receivable = isBuyer && order.status === "DELIVERED" && paid;

  const statusTone = paid
    ? "bg-teal-50 text-teal-900"
    : order.status === "CANCELLED" || order.status === "EXPIRED"
      ? "bg-slate-100 text-slate-700"
      : "bg-amber-50 text-amber-900";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {order.items.map((item) => (
        <ClearIdempotency key={item.id} scope={item.productId} />
      ))}

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">Commande</p>
          <h1 className="text-xl font-bold tracking-tight">{order.reference}</h1>
        </div>
        <span className={`badge ${statusTone} !px-3 !py-1.5`}>{statusLabel}</span>
      </div>

      {pendingOnlinePayment ? <PaymentPoller reference={order.reference} /> : null}

      {annulee ? (
        <p className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900">
          Commande annulée. Le stock a été remis en vente et aucun montant n&apos;est dû.
        </p>
      ) : null}

      {reception === "ok" ? (
        <p className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900">
          Réception confirmée. La commande est terminée et les {netLabel} % nets du vendeur
          sont en cours de reversement automatique.
        </p>
      ) : null}

      {erreur ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {CANCEL_ERRORS[erreur] ?? "Cette action n'a pas pu être effectuée."}
        </p>
      ) : null}

      <section className="card p-5">
        <h2 className="font-semibold">Récapitulatif</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {order.items.map((item) => {
            const snapshot = safeParse(item.productSnapshot);
            const image = item.product.images[0]?.url ?? "/produits/caracolo.svg";

            return (
              <li key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="" className="size-14 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {snapshot.name ?? item.product.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {item.quantity} × {formatXof(item.unitPriceXof)}
                  </p>
                </div>
                <p className="text-sm font-semibold">
                  {formatXof(item.unitPriceXof * item.quantity)}
                </p>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 space-y-1 border-t border-slate-200 pt-3 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Sous-total</span>
            <span>{formatXof(order.subtotalXof)}</span>
          </div>
          {order.feesXof > 0 ? (
            <div className="flex justify-between text-slate-600">
              <span>Frais de service</span>
              <span>{formatXof(order.feesXof)}</span>
            </div>
          ) : null}
          <div className="flex justify-between pt-1 text-base font-bold">
            <span>Total</span>
            <span>{formatXof(order.totalXof)}</span>
          </div>
        </div>
      </section>

      <section className="card space-y-2 p-5 text-sm">
        <h2 className="font-semibold">Paiement</h2>
        <p>
          <strong>Moyen :</strong> {provider?.label ?? payment?.provider ?? "Non défini"}
        </p>
        <p>
          <strong>Statut :</strong>{" "}
          {PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}
        </p>

        {paid ? (
          <p className="rounded-xl bg-teal-50 px-3 py-2 text-teal-900">
            Paiement confirmé le {order.confirmedAt ? formatDate(order.confirmedAt) : "—"}.
          </p>
        ) : order.status === "CANCELLED" || order.status === "EXPIRED" ? (
          <p className="rounded-xl bg-slate-100 px-3 py-2 text-slate-700">
            Cette commande a été annulée et le stock a été remis en vente. Aucun montant n&apos;a
            été débité en ligne.
          </p>
        ) : (
          <div className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">
            <p className="font-medium">À régler à la remise</p>
            <p className="mt-0.5 text-xs">
              Paie {formatXof(order.totalXof)} au vendeur, en espèces ou par transfert Mobile Money
              {order.vendor.momoNumber ? ` au ${order.vendor.momoNumber}` : ""}. La commande ne sera
              marquée payée qu&apos;après confirmation par le vendeur.
            </p>
          </div>
        )}
      </section>

      <section className="card space-y-1 p-5 text-sm">
        <h2 className="font-semibold">Retrait</h2>
        <p>
          <strong>Vendeur :</strong> {order.vendor.shopName}
          <span className="ml-2 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800">
            Vendeur vérifié 2iE
          </span>
        </p>
        {order.vendor.orangeMoneyNumber ? (
          <p className="text-xs font-medium text-teal-800">
            ✓ Versement vendeur configuré (Orange Money vérifié)
          </p>
        ) : null}
        {order.vendor.roomNumber ? (
          <p>
            <strong>Chambre :</strong> {order.vendor.roomNumber}
          </p>
        ) : null}
        {order.pickupSlot ? (
          <p>
            <strong>Créneau :</strong> {order.pickupSlot}
          </p>
        ) : null}
        {order.buyerRoom ? (
          <p>
            <strong>Livraison :</strong> {order.buyerRoom}
          </p>
        ) : null}
        <p>
          <strong>Contact :</strong> {order.buyerName} · {order.buyerPhone}
        </p>
        <p className="text-xs text-slate-500">Commande passée le {formatDate(order.createdAt)}</p>
      </section>

      <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-semibold">Une question sur cette commande ?</h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Échange directement dans la messagerie 2iE Market. Le destinataire reçoit une
            notification Push.
          </p>
        </div>
        <form action={startOrderConversationAction}>
          <input type="hidden" name="orderId" value={order.id} />
          <button type="submit" className="btn-secondary">
            💬 Discuter avec {isBuyer ? "le vendeur" : "l'acheteur"}
          </button>
        </form>
      </section>

      {receivable ? (
        <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h2 className="font-semibold">Tu as bien reçu ta commande ?</h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Confirme la réception pour clôturer la commande. Le vendeur reçoit immédiatement sa
              part nette ({netLabel} %). Sans action de ta part, la libération est automatique
              48 h après la livraison.
            </p>
          </div>
          <form action={confirmReceiptAction}>
            <input type="hidden" name="orderId" value={order.id} />
            <button type="submit" className="btn-primary">
              Confirmer la réception
            </button>
          </form>
        </section>
      ) : null}

      {cancellable ? (
        <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h2 className="font-semibold">Changer d&apos;avis ?</h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Tu peux annuler tant que le vendeur n&apos;a pas validé la commande. Le stock sera
              immédiatement remis en vente.
            </p>
          </div>
          <form action={cancelOrderAction}>
            <input type="hidden" name="orderId" value={order.id} />
            <button type="submit" className="btn-ghost text-red-700">
              Annuler ma commande
            </button>
          </form>
        </section>
      ) : null}

      {isVendor ? (
        <Link href="/espace-vendeur" className="btn-secondary w-full">
          Gérer cette commande dans mon espace vendeur
        </Link>
      ) : (
        <Link href="/" className="btn-secondary w-full">
          Continuer mes achats
        </Link>
      )}
    </div>
  );
}

function safeParse(value: string): { name?: string; image?: string | null } {
  try {
    return JSON.parse(value) as { name?: string; image?: string | null };
  } catch {
    return {};
  }
}
