import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBfPhone, formatDate, payoutMethodLabel } from "@/lib/domain";
import { formatXof } from "@/lib/money";
import { vendorPayoutAccount } from "@/lib/payments/payout";
import { triggerPayoutAction } from "@/server/actions/payouts";

export const metadata: Metadata = { title: "Espace administrateur" };

/**
 * Tableau de bord administrateur des reversements vendeurs.
 *
 * Les 95 % nets d'une commande payée en ligne attendent ici leur virement.
 * Le bouton « Reverser les 95 % au vendeur » envoie le Payout Money Fusion vers
 * le compte choisi par le vendeur ; aucun montant n'est saisi à la main.
 */
export default async function AdminPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; reversement?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const orders = await db.order.findMany({
    where: {
      paymentStatus: "PAID",
      payoutStatus: { in: ["READY_FOR_PAYOUT", "PROCESSING"] },
      payments: { some: { provider: { not: "CASH" } } },
    },
    include: {
      vendor: {
        select: {
          shopName: true,
          slug: true,
          orangeMoneyNumber: true,
          moovMoneyNumber: true,
          waveNumber: true,
          bankCardOrAccount: true,
          preferredPayoutMethod: true,
          momoNumber: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const totals = orders.reduce(
    (acc, order) => {
      const gross = order.grossAmount || order.totalXof;
      acc.gross += gross;
      acc.commission += order.platformFee;
      acc.net += order.vendorNetAmount || gross - order.platformFee;
      return acc;
    },
    { gross: 0, commission: 0, net: 0 },
  );

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-teal-900 to-teal-700 px-5 py-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-200">
          Espace administrateur
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Reversements vendeurs</h1>
        <p className="mt-1 max-w-2xl text-sm text-teal-50">
          Montants encaissés en ligne en attente de virement. La commission plateforme de 5 %
          est conservée ; les 95 % nets sont reversés au compte choisi par le vendeur.
        </p>

        <dl className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white/10 px-3 py-2">
            <dt className="text-xs text-teal-100">Brut encaissé</dt>
            <dd className="text-lg font-bold">{formatXof(totals.gross)}</dd>
          </div>
          <div className="rounded-2xl bg-white/10 px-3 py-2">
            <dt className="text-xs text-teal-100">Commission 5 %</dt>
            <dd className="text-lg font-bold">{formatXof(totals.commission)}</dd>
          </div>
          <div className="rounded-2xl bg-white/10 px-3 py-2">
            <dt className="text-xs text-teal-100">Net à reverser (95 %)</dt>
            <dd className="text-lg font-bold">{formatXof(totals.net)}</dd>
          </div>
        </dl>
      </header>

      {params.reversement === "ok" ? (
        <p className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900">
          Reversement déclenché. Le statut sera mis à jour automatiquement à la confirmation de
          l&apos;opérateur.
        </p>
      ) : null}

      {params.erreur ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {params.erreur === "commande"
            ? "Commande introuvable."
            : params.erreur}
        </p>
      ) : null}

      {orders.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="font-semibold">Aucun reversement en attente</p>
          <p className="mt-1 text-sm text-slate-600">
            Les commandes payées en ligne apparaîtront ici dès leur confirmation.
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Commande</th>
                <th className="px-4 py-3 font-semibold">Vendeur</th>
                <th className="px-4 py-3 font-semibold">Brut</th>
                <th className="px-4 py-3 font-semibold">Commission 5 %</th>
                <th className="px-4 py-3 font-semibold">Net vendeur (95 %)</th>
                <th className="px-4 py-3 font-semibold">Compte de versement</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const account = vendorPayoutAccount(order.vendor);
                const gross = order.grossAmount || order.totalXof;
                const net = order.vendorNetAmount || gross - order.platformFee;
                const displayAccount =
                  account.method === "CARD"
                    ? account.phone
                    : formatBfPhone(account.phone) ?? account.phone;

                return (
                  <tr key={order.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/commande/${order.reference}`}
                        className="font-mono text-xs font-semibold text-teal-800 hover:underline"
                      >
                        {order.reference}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDate(order.createdAt)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{order.vendor.shopName}</p>
                      <p className="text-xs text-slate-500">
                        {payoutMethodLabel(order.vendor.preferredPayoutMethod)}
                      </p>
                    </td>
                    <td className="px-4 py-3">{formatXof(gross)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatXof(order.platformFee)}</td>
                    <td className="px-4 py-3 font-semibold">{formatXof(net)}</td>
                    <td className="px-4 py-3">
                      {displayAccount ? (
                        <span className="font-mono text-xs">{displayAccount}</span>
                      ) : (
                        <span className="badge bg-red-50 text-red-700">Non configuré</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {order.payoutStatus === "PROCESSING" ? (
                        <span className="badge bg-amber-50 text-amber-800">En cours</span>
                      ) : (
                        <form action={triggerPayoutAction}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <button type="submit" className="btn-primary !py-1.5 !text-xs">
                            Reverser les 95 % au vendeur
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
