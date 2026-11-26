import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  PAYOUT_STATUS_LABELS,
  formatBfPhone,
  formatDate,
  payoutMethodLabel,
} from "@/lib/domain";
import {
  PLATFORM_FEE_PERCENT,
  VENDOR_NET_PERCENT,
  formatPercent,
  formatXof,
} from "@/lib/money";
import { vendorPayoutAccount } from "@/lib/payments/payout";
import { triggerPayoutAction } from "@/server/actions/payouts";

export const metadata: Metadata = { title: "Espace administrateur" };

/**
 * Suivi des reversements vendeurs — rôle purement informatif.
 *
 * Le flux normal est 100 % automatique : confirmation de réception par
 * l'acheteur (ou auto-release 48 h) → virement de la part nette → webhook
 * Money Fusion.
 * L'administrateur n'intervient que pour relancer un virement en échec
 * (`FAILED`), jamais pour le déclencher.
 */
export default async function AdminPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; reversement?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const feeLabel = formatPercent(PLATFORM_FEE_PERCENT);
  const netLabel = formatPercent(VENDOR_NET_PERCENT);

  const orders = await db.order.findMany({
    where: {
      paymentStatus: "PAID",
      payoutStatus: { in: ["READY_FOR_PAYOUT", "PROCESSING", "PAID", "FAILED"] },
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
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const totals = orders.reduce(
    (acc, order) => {
      const gross = order.grossAmount || order.totalXof;
      const net = order.vendorNetAmount || gross - order.platformFee;
      acc.gross += gross;
      acc.commission += order.platformFee;
      acc.net += net;
      if (order.payoutStatus === "PAID") acc.paidOut += net;
      if (order.payoutStatus === "FAILED") acc.failed += 1;
      return acc;
    },
    { gross: 0, commission: 0, net: 0, paidOut: 0, failed: 0 },
  );

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-teal-900 to-teal-700 px-5 py-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-200">
          Espace administrateur
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          Suivi des frais de service et reversements
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-teal-50">
          Les {netLabel} % nets sont reversés automatiquement à la confirmation de réception par
          l&apos;acheteur, ou 48 h après la livraison. Aucune action administrative n&apos;est
          nécessaire : cet écran ne sert qu&apos;au suivi et à la relance d&apos;un virement en
          échec.
        </p>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white/10 px-3 py-2">
            <dt className="text-xs text-teal-100">Brut encaissé</dt>
            <dd className="text-lg font-bold">{formatXof(totals.gross)}</dd>
          </div>
          <div className="rounded-2xl bg-white/10 px-3 py-2">
            <dt className="text-xs text-teal-100">Frais de service &amp; Mobile Money</dt>
            <dd className="text-lg font-bold">{formatXof(totals.commission)}</dd>
          </div>
          <div className="rounded-2xl bg-white/10 px-3 py-2">
            <dt className="text-xs text-teal-100">Net vendeur ({netLabel} %)</dt>
            <dd className="text-lg font-bold">{formatXof(totals.net)}</dd>
          </div>
          <div className="rounded-2xl bg-white/10 px-3 py-2">
            <dt className="text-xs text-teal-100">Échecs à relancer</dt>
            <dd className="text-lg font-bold">{totals.failed}</dd>
          </div>
        </dl>
      </header>

      {params.reversement === "ok" ? (
        <p className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900">
          Relance envoyée. Le statut sera mis à jour automatiquement à la confirmation de
          l&apos;opérateur.
        </p>
      ) : null}

      {params.erreur ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {params.erreur === "commande" ? "Commande introuvable." : params.erreur}
        </p>
      ) : null}

      {orders.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="font-semibold">Aucun reversement suivi pour le moment</p>
          <p className="mt-1 text-sm text-slate-600">
            Les commandes payées en ligne apparaîtront ici dès leur confirmation.
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Commande</th>
                <th className="px-4 py-3 font-semibold">Vendeur</th>
                <th className="px-4 py-3 font-semibold">Brut</th>
                <th className="px-4 py-3 font-semibold">Frais de transaction</th>
                <th className="px-4 py-3 font-semibold">Net vendeur ({netLabel} %)</th>
                <th className="px-4 py-3 font-semibold">Compte</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
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
                    <td className="px-4 py-3 align-top">
                      <span
                        className={
                          order.payoutStatus === "PAID"
                            ? "badge bg-teal-50 text-teal-800"
                            : order.payoutStatus === "FAILED"
                              ? "badge bg-red-50 text-red-700"
                              : "badge bg-amber-50 text-amber-800"
                        }
                      >
                        {order.payoutStatus === "PAID"
                          ? `Reversé (${netLabel} %)`
                          : (PAYOUT_STATUS_LABELS[order.payoutStatus] ?? order.payoutStatus)}
                      </span>
                      {order.payoutStatus === "FAILED" && order.payoutError ? (
                        <p className="mt-1 max-h-40 max-w-[320px] overflow-y-auto break-words text-xs text-red-700">
                          {order.payoutError}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {order.payoutStatus === "FAILED" ? (
                        <form action={triggerPayoutAction}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <button type="submit" className="btn-secondary !py-1.5 !text-xs">
                            Relancer le virement
                          </button>
                        </form>
                      ) : order.payoutStatus === "PAID" ? (
                        <span className="text-xs text-teal-800">Automatique ✓</span>
                      ) : (
                        <span className="text-xs text-slate-500">Automatique</span>
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
