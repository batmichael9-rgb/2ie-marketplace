import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { ClearIdempotency } from "@/components/clear-idempotency";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  canBuyerCancelOrder,
  formatDate,
  type OrderStatus,
} from "@/lib/domain";
import { formatXof } from "@/lib/money";
import { cancelOrderAction } from "@/server/actions/orders";

export const metadata: Metadata = { title: "Mes commandes" };

const OPEN_STATUSES = ["AWAITING_PAYMENT", "PAID", "VENDOR_CONFIRMED", "READY_FOR_PICKUP"];

const ERRORS: Record<string, string> = {
  commande: "Commande introuvable.",
  paiement:
    "Cette commande est déjà payée : contacte le vendeur pour un remboursement avant de l'annuler.",
  "trop-tard":
    "Trop tard : le vendeur a déjà validé, préparé ou livré cette commande. Contacte-le directement.",
};

export default async function MyOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const user = await requireUser("/mes-commandes");
  const { erreur } = await searchParams;

  const orders = await db.order.findMany({
    where: { buyerId: user.id },
    include: {
      vendor: { select: { shopName: true, roomNumber: true } },
      items: {
        include: { product: { include: { images: { orderBy: { position: "asc" }, take: 1 } } } },
      },
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const ongoing = orders.filter((order) => OPEN_STATUSES.includes(order.status));
  const history = orders.filter((order) => !OPEN_STATUSES.includes(order.status));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Mes commandes</h1>
        <p className="mt-1 text-sm text-slate-600">
          Suis l&apos;état de tes commandes en temps réel et annule-les tant que le vendeur ne les a
          pas validées.
        </p>
      </header>

      {erreur ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {ERRORS[erreur] ?? "Cette action n'a pas pu être effectuée."}
        </p>
      ) : null}

      {orders.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-lg font-semibold">Aucune commande pour le moment</p>
          <p className="mt-1 text-sm text-slate-600">
            Parcours le catalogue et commande auprès d&apos;un vendeur du campus.
          </p>
          <Link href="/" className="btn-primary mt-4">
            Voir le catalogue
          </Link>
        </div>
      ) : (
        <>
          <OrderList
            title="En cours"
            emptyLabel="Aucune commande en cours."
            orders={ongoing}
            showCancel
          />
          <OrderList title="Historique" emptyLabel="Aucune commande terminée." orders={history} />
        </>
      )}
    </div>
  );
}

type MyOrder = Prisma.OrderGetPayload<{
  include: {
    vendor: { select: { shopName: true; roomNumber: true } };
    items: { include: { product: { include: { images: true } } } };
    payments: true;
  };
}>;

function statusTone(status: string): string {
  if (status === "COMPLETED") return "bg-teal-50 text-teal-800";
  if (["CANCELLED", "EXPIRED", "REFUNDED"].includes(status)) return "bg-slate-100 text-slate-600";
  return "bg-amber-50 text-amber-900";
}

function OrderList({
  title,
  emptyLabel,
  orders,
  showCancel = false,
}: {
  title: string;
  emptyLabel: string;
  orders: MyOrder[];
  showCancel?: boolean;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        <span className="badge bg-slate-100 text-slate-700">{orders.length}</span>
      </div>

      {orders.length === 0 ? (
        <p className="card p-4 text-sm text-slate-500">{emptyLabel}</p>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => {
            const statusLabel = ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status;
            const payment = order.payments[0];
            const cancellable = showCancel && canBuyerCancelOrder(order);

            return (
              <li key={order.id} className="card overflow-hidden">
                {order.items.map((item) => (
                  <ClearIdempotency key={item.id} scope={item.productId} />
                ))}

                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/commande/${order.reference}`}
                      className="font-mono text-sm font-semibold text-teal-800 hover:underline"
                    >
                      {order.reference}
                    </Link>
                    <span className={`badge ${statusTone(order.status)}`}>{statusLabel}</span>
                  </div>
                  <span className="text-xs text-slate-500">{formatDate(order.createdAt)}</span>
                </div>

                <div className="flex flex-wrap items-start gap-4 px-4 py-3">
                  <ul className="min-w-0 flex-1 space-y-2">
                    {order.items.map((item) => (
                      <li key={item.id} className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.product.images[0]?.url ?? "/produits/caracolo.svg"}
                          alt=""
                          className="size-12 rounded-xl object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{item.product.name}</p>
                          <p className="text-xs text-slate-500">
                            {item.quantity} × {formatXof(item.unitPriceXof)} ·{" "}
                            {order.vendor.shopName}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="space-y-1 sm:text-right">
                    <p className="font-bold">{formatXof(order.totalXof)}</p>
                    <p className="text-xs text-slate-500">
                      {payment?.provider === "CASH" ? "À la réception" : "Mobile Money"} ·{" "}
                      {PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-4 py-2">
                  <Link href={`/commande/${order.reference}`} className="btn-secondary !py-1.5 !text-xs">
                    Voir le détail
                  </Link>
                  {cancellable ? (
                    <form action={cancelOrderAction}>
                      <input type="hidden" name="orderId" value={order.id} />
                      <button
                        type="submit"
                        className="btn-ghost !py-1.5 !text-xs text-red-700"
                      >
                        Annuler la commande
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
