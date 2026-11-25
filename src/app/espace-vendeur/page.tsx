import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { PlatformFeeInfo } from "@/components/platform-fee-info";
import { PushNotificationsButton } from "@/components/push-notifications-button";
import { requireVendor } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  CAMPUSES,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  formatBfPhone,
  formatDate,
  payoutMethodLabel,
  type OrderStatus,
} from "@/lib/domain";
import {
  PLATFORM_FEE_PERCENT,
  VENDOR_NET_PERCENT,
  formatPercent,
  formatXof,
} from "@/lib/money";
import { autoReleaseDeliveredOrders } from "@/lib/payments/auto-release";
import { StockBadge } from "@/components/stock-badge";
import { retryVendorPayoutAction } from "@/server/actions/payouts";
import {
  createShareLinkAction,
  deleteProductAction,
  updateOrderAction,
  updateStockAction,
  updateVendorPayoutAccountsAction,
  updateVendorProfileAction,
} from "@/server/actions/vendor";

export const metadata: Metadata = { title: "Espace vendeur" };

const OPEN_STATUSES = [
  "AWAITING_PAYMENT",
  "PAID",
  "VENDOR_CONFIRMED",
  "READY_FOR_PICKUP",
  "DELIVERED",
];

export default async function VendorDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    produit?: string;
    stock?: string;
    commande?: string;
    partage?: string;
    boutique?: string;
    versement?: string;
    erreur?: string;
    supprimer?: string;
  }>;
}) {
  const { vendor } = await requireVendor();
  const params = await searchParams;
  const feeLabel = formatPercent(PLATFORM_FEE_PERCENT);
  const netLabel = formatPercent(VENDOR_NET_PERCENT);

  // Déclenchement paresseux de l'auto-release 48 h : le vendeur n'a pas à
  // attendre le cron quotidien pour recevoir sa part nette.
  await autoReleaseDeliveredOrders().catch((error) => {
    console.error("Auto-release des reversements :", error);
  });

  // Compte qui recevra effectivement la part nette, selon le mode préféré.
  const payoutAccount =
    vendor.preferredPayoutMethod === "MOOV_MONEY"
      ? vendor.moovMoneyNumber
      : vendor.preferredPayoutMethod === "WAVE"
        ? vendor.waveNumber
        : vendor.preferredPayoutMethod === "CARD"
          ? vendor.bankCardOrAccount
          : vendor.orangeMoneyNumber;
  const payoutAccountDisplay =
    vendor.preferredPayoutMethod === "CARD"
      ? payoutAccount
      : formatBfPhone(payoutAccount);

  // URL publique des liens de partage : NEXT_PUBLIC_APP_URL en priorité, sinon
  // l'hôte réel de la requête (jamais localhost en production).
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ||
    (host ? `${protocol}://${host}` : "");

  const [orders, products] = await Promise.all([
    db.order.findMany({
      where: { vendorId: vendor.id },
      include: {
        buyer: { select: { fullName: true } },
        items: {
          include: { product: { include: { images: { orderBy: { position: "asc" }, take: 1 } } } },
        },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.product.findMany({
      where: { vendorId: vendor.id },
      include: {
        images: { orderBy: { position: "asc" }, take: 1 },
        category: true,
        shareLinks: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { orderItems: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Ventes en ligne effectivement payées : seules celles-ci portent une
  // commission plateforme et un reversement à effectuer.
  const onlinePaidOrders = orders.filter(
    (order) => order.paymentStatus === "PAID" && order.payments[0]?.provider !== "CASH",
  );

  const payoutTotals = onlinePaidOrders.reduce(
    (totals, order) => {
      const net = order.vendorNetAmount || order.totalXof;
      totals.net += net;
      totals.commission += order.platformFee;
      totals.gross += order.grossAmount || order.totalXof;
      if (order.payoutStatus === "PAID") totals.paidOut += net;
      else totals.pending += net;
      return totals;
    },
    { gross: 0, commission: 0, net: 0, pending: 0, paidOut: 0 },
  );

  const revenue = orders
    .filter((order) => order.paymentStatus === "PAID")
    .reduce(
      (sum, order) => sum + (order.vendorNetAmount || order.totalXof),
      0,
    );

  const openOrders = orders.filter((order) => OPEN_STATUSES.includes(order.status));

  const lowStockProducts = products.filter(
    (product) =>
      product.isActive &&
      (product.stockMode === "OUT_OF_STOCK" ||
        (product.stockMode === "TRACKED" && product.stockQty <= product.lowStockThreshold)),
  );

  const notices = [
    params.produit === "ajoute" ? "Produit publié : il est maintenant visible au catalogue." : null,
    params.produit === "maj" ? "Produit modifié : les changements sont visibles au catalogue." : null,
    params.produit === "supprime" ? "Produit supprimé définitivement." : null,
    params.stock === "maj" ? "Stock mis à jour." : null,
    params.commande === "maj" ? "Commande mise à jour." : null,
    params.partage ? "Lien de partage créé, prêt à envoyer sur WhatsApp." : null,
    params.boutique === "maj" ? "Informations de la boutique mises à jour." : null,
    params.versement === "maj"
      ? `Comptes de versement enregistrés : tes ${netLabel} % seront reversés sur le compte choisi.`
      : null,
    params.versement === "relance"
      ? "Relance du virement envoyée. Le statut sera mis à jour à la confirmation de l'opérateur."
      : null,
  ].filter(Boolean) as string[];

  const errors: Record<string, string> = {
    stock: "La mise à jour du stock a échoué. Vérifie les valeurs saisies.",
    produit: "Produit introuvable dans ta boutique.",
    boutique:
      "Les informations de la boutique n'ont pas pu être enregistrées : vérifie le nom (2 à 60 caractères) et le numéro Mobile Money.",
    "produit-commandes":
      "Ce produit figure dans des commandes : il ne peut pas être supprimé sans effacer l'historique. Passe-le en « En rupture » pour le retirer du catalogue.",
    commande: "Commande introuvable dans ta boutique.",
    "paiement-non-confirme":
      "Ce paiement Mobile Money n'est pas encore confirmé par l'opérateur. Attends la confirmation avant de livrer.",
    "remboursement-requis":
      "Cette commande a déjà été payée en ligne : un remboursement doit être traité avant de l'annuler.",
    versement:
      "Comptes de versement non enregistrés : le numéro Orange Money est obligatoire au format +226 XX XX XX XX.",
    "versement-compte":
      "Le mode de versement préféré doit correspondre à un compte renseigné.",
  };

  return (
    <div className="space-y-8">
      <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-teal-800 via-teal-700 to-emerald-600 px-5 py-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-100">
              Espace vendeur
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{vendor.shopName}</h1>
              <span
                className={`badge ${vendor.isOpen ? "bg-white/20 text-white" : "bg-red-100 text-red-800"}`}
              >
                {vendor.isOpen ? "Ouverte aux commandes" : "Fermé actuellement"}
              </span>
              {vendor.orderCutoffTime ? (
                <span className="badge bg-white/20 text-white">
                  Commandes jusqu&apos;à {vendor.orderCutoffTime}
                </span>
              ) : null}
            </div>
            <p className="mt-1 max-w-xl text-sm text-teal-50">
              {vendor.description ??
                "Gère tes produits, ton stock et tes commandes depuis cet espace."}
            </p>
            {vendor.roomNumber ? (
              <p className="mt-2 text-xs text-teal-100">Retrait : {vendor.roomNumber}</p>
            ) : null}
          </div>
          <Link
            href="/espace-vendeur/produits/nouveau"
            className="btn bg-white text-teal-800 hover:bg-teal-50"
          >
            + Ajouter un produit
          </Link>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white/10 px-3 py-2">
            <dt className="text-xs text-teal-100">Net encaissé ({netLabel} %)</dt>
            <dd className="text-lg font-bold">{formatXof(revenue)}</dd>
          </div>
          <div className="rounded-2xl bg-white/10 px-3 py-2">
            <dt className="text-xs text-teal-100">Commandes à traiter</dt>
            <dd className="text-lg font-bold">{openOrders.length}</dd>
          </div>
          <div className="rounded-2xl bg-white/10 px-3 py-2">
            <dt className="text-xs text-teal-100">Produits en ligne</dt>
            <dd className="text-lg font-bold">{products.filter((p) => p.isActive).length}</dd>
          </div>
          <div className="rounded-2xl bg-white/10 px-3 py-2">
            <dt className="text-xs text-teal-100">Alertes stock</dt>
            <dd className="text-lg font-bold">{lowStockProducts.length}</dd>
          </div>
        </dl>
      </header>

      <PushNotificationsButton />

      {!vendor.orangeMoneyNumber ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Publie tes articles ?</strong> Renseigne d&apos;abord ton numéro Orange Money dans{" "}
          <a href="#versements" className="font-semibold underline">
            Mes comptes de versement
          </a>{" "}
          : c&apos;est le compte qui recevra tes {netLabel} % nets.
        </p>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Comptes de versement (réception de la part nette)                 */}
      {/* ------------------------------------------------------------------ */}
      <section id="versements" className="card p-5">
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            Mes comptes de versement (Réception de vos {netLabel} %)
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Chaque vente en ligne est encaissée par la plateforme, puis {netLabel} % nets te
            sont reversés sur le compte choisi ci-dessous. La commission plateforme de{" "}
            {feeLabel} % est déjà déduite.
          </p>
        </div>

        {payoutAccountDisplay ? (
          <p className="mt-3 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900">
            Versements envoyés sur {payoutMethodLabel(vendor.preferredPayoutMethod)} :{" "}
            <span className="font-mono">{payoutAccountDisplay}</span>
          </p>
        ) : (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Aucun compte sélectionné : renseigne au moins ton numéro Orange Money pour recevoir
            tes gains et publier des articles.
          </p>
        )}

        <form action={updateVendorPayoutAccountsAction} className="mt-4 space-y-4">
          <div>
            <label htmlFor="orangeMoneyNumber" className="label">
              Numéro Orange Money <span className="text-red-600">(obligatoire)</span>
            </label>
            <input
              id="orangeMoneyNumber"
              name="orangeMoneyNumber"
              className="input"
              inputMode="tel"
              required
              maxLength={20}
              defaultValue={vendor.orangeMoneyNumber ?? ""}
              placeholder="+226 70 00 00 00"
            />
            <p className="mt-1 text-xs text-slate-500">
              Format Burkina Faso : +226 XX XX XX XX. Obligatoire pour activer le compte vendeur
              et publier des articles.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="moovMoneyNumber" className="label">
                Numéro Moov Money{" "}
                <span className="badge ml-1 bg-slate-100 text-slate-600">Facultatif</span>
              </label>
              <input
                id="moovMoneyNumber"
                name="moovMoneyNumber"
                className="input"
                inputMode="tel"
                maxLength={20}
                defaultValue={vendor.moovMoneyNumber ?? ""}
                placeholder="+226 60 00 00 00"
              />
            </div>

            <div>
              <label htmlFor="waveNumber" className="label">
                Numéro Wave{" "}
                <span className="badge ml-1 bg-slate-100 text-slate-600">Facultatif</span>
              </label>
              <input
                id="waveNumber"
                name="waveNumber"
                className="input"
                inputMode="tel"
                maxLength={20}
                defaultValue={vendor.waveNumber ?? ""}
                placeholder="+226 01 00 00 00"
              />
            </div>
          </div>

          <div>
            <label htmlFor="bankCardOrAccount" className="label">
              Carte bancaire / RIB{" "}
              <span className="badge ml-1 bg-slate-100 text-slate-600">Facultatif</span>
            </label>
            <input
              id="bankCardOrAccount"
              name="bankCardOrAccount"
              className="input"
              maxLength={80}
              defaultValue={vendor.bankCardOrAccount ?? ""}
              placeholder="Numéro de carte ou RIB pour un virement"
            />
          </div>

          <div>
            <label htmlFor="preferredPayoutMethod" className="label">
              Mode de versement préféré
            </label>
            <select
              id="preferredPayoutMethod"
              name="preferredPayoutMethod"
              className="input"
              defaultValue={vendor.preferredPayoutMethod ?? "ORANGE_MONEY"}
            >
              <option value="ORANGE_MONEY">Orange Money</option>
              <option value="MOOV_MONEY">Moov Money</option>
              <option value="WAVE">Wave</option>
              <option value="CARD">Carte bancaire / RIB</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Les {netLabel} % nets seront reversés sur ce compte. Il doit être renseigné
              ci-dessus.
            </p>
          </div>

          <button type="submit" className="btn-primary">
            Enregistrer mes comptes de versement
          </button>
        </form>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Finances & reversements                                            */}
      {/* ------------------------------------------------------------------ */}
      <section id="finances" className="space-y-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Finances</h2>
          <p className="mt-1 text-sm text-slate-600">
            Commission plateforme de {feeLabel} % retenue sur les ventes payées en ligne.
          </p>
        </div>

        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="card p-4">
            <dt className="text-xs font-medium text-slate-500">
              Total encaissé (Net {netLabel} %)
            </dt>
            <dd className="mt-1 text-xl font-bold text-teal-800">
              {formatXof(payoutTotals.net)}
            </dd>
            <p className="mt-1 text-xs text-slate-500">
              Commission {feeLabel} % retenue : {formatXof(payoutTotals.commission)}
            </p>
          </div>
          <div className="card p-4">
            <dt className="text-xs font-medium text-slate-500">En attente de reversement</dt>
            <dd className="mt-1 text-xl font-bold text-amber-700">
              {formatXof(payoutTotals.pending)}
            </dd>
            <p className="mt-1 text-xs text-slate-500">
              Payé en ligne, pas encore reversé sur ton Mobile Money.
            </p>
          </div>
          <div className="card p-4">
            <dt className="text-xs font-medium text-slate-500">Déjà reversé</dt>
            <dd className="mt-1 text-xl font-bold text-slate-800">
              {formatXof(payoutTotals.paidOut)}
            </dd>
            <p className="mt-1 text-xs text-slate-500">
              {payoutAccountDisplay
                ? `Compte de versement : ${payoutAccountDisplay} (${payoutMethodLabel(
                    vendor.preferredPayoutMethod,
                  )})`
                : "Aucun compte de versement au-dessus : ouvre « Mes comptes de versement » pour les recevoir."}
            </p>
          </div>
        </dl>

        {onlinePaidOrders.length > 0 ? (
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Commande</th>
                  <th className="px-4 py-2.5 font-semibold">Prix payé</th>
                  <th className="px-4 py-2.5 font-semibold">Commission {feeLabel} %</th>
                  <th className="px-4 py-2.5 font-semibold">Net vendeur</th>
                  <th className="px-4 py-2.5 font-semibold">Compte de versement</th>
                  <th className="px-4 py-2.5 font-semibold">Reversement</th>
                </tr>
              </thead>
              <tbody>
                {onlinePaidOrders.map((order) => (
                  <tr key={order.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-teal-800">
                      {order.reference}
                    </td>
                    <td className="px-4 py-2.5">
                      {formatXof(order.grossAmount || order.totalXof)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{formatXof(order.platformFee)}</td>
                    <td className="px-4 py-2.5 font-semibold">
                      {formatXof(order.vendorNetAmount || order.totalXof)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {payoutAccountDisplay ?? "Non configuré"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={
                          order.payoutStatus === "PAID"
                            ? "badge bg-teal-50 text-teal-800"
                            : order.payoutStatus === "FAILED"
                              ? "badge bg-red-50 text-red-700"
                              : "badge bg-amber-50 text-amber-800"
                        }
                        title={order.payoutError ?? undefined}
                      >
                        {order.payoutStatus === "PAID"
                          ? `Reversé (${netLabel} %)`
                          : order.payoutStatus === "PROCESSING"
                            ? "Reversement en cours"
                            : order.payoutStatus === "FAILED"
                              ? "Échec — nouvelle tentative auto"
                              : "En attente de reversement"}
                      </span>
                      {order.payoutStatus === "FAILED" ? (
                        <form action={retryVendorPayoutAction} className="mt-2">
                          <input type="hidden" name="orderId" value={order.id} />
                          <button type="submit" className="btn-secondary !py-1.5 !text-xs">
                            Relancer le virement
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="card p-4 text-sm text-slate-600">
            Aucune vente en ligne payée pour le moment. Les commandes payées à la remise ne
            supportent pas de commission.
          </p>
        )}

        <PlatformFeeInfo />
      </section>

      {notices.length > 0 ? (
        <div className="space-y-2">
          {notices.map((notice) => (
            <p key={notice} className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900">
              {notice}
            </p>
          ))}
        </div>
      ) : null}

      {params.erreur ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {errors[params.erreur] ?? "Cette action n'a pas pu être effectuée."}
        </p>
      ) : null}

      {params.partage ? (
        <section className="card p-5">
          <h2 className="font-semibold">Ton lien de partage</h2>
          <p className="mt-1 break-all rounded-xl bg-slate-50 px-3 py-2 font-mono text-sm">
            {origin}/s/{params.partage}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Chaque ouverture est comptée. Le lien redirige directement vers la fiche du produit.
          </p>
        </section>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Informations de la boutique                                        */}
      {/* ------------------------------------------------------------------ */}
      <details id="boutique" className="card p-5" open={params.erreur === "boutique"}>
        <summary className="cursor-pointer font-semibold text-teal-800">
          Modifier les informations de la boutique
        </summary>
        <form action={updateVendorProfileAction} className="mt-4 space-y-4">
          <div>
            <label htmlFor="shopName" className="label">
              Nom de la boutique
            </label>
            <input
              id="shopName"
              name="shopName"
              className="input"
              defaultValue={vendor.shopName}
              required
              minLength={2}
              maxLength={60}
            />
            <p className="mt-1 text-xs text-slate-500">
              C&apos;est le nom affiché sur le catalogue et sur tes fiches produit.
            </p>
          </div>

          <div>
            <label htmlFor="description" className="label">
              Description <span className="font-normal text-slate-400">(facultatif)</span>
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              maxLength={500}
              className="input"
              defaultValue={vendor.description ?? ""}
              placeholder="Repas maison, retrait le soir à la chambre B214…"
            />
          </div>

          <div>
            <label htmlFor="campus" className="label">
              Campus 2iE
            </label>
            <select
              id="campus"
              name="campus"
              className="input"
              defaultValue={vendor.campus ?? ""}
              required
            >
              <option value="" disabled>
                Choisis ton site
              </option>
              {CAMPUSES.map((campus) => (
                <option key={campus} value={campus}>
                  {campus}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Ce campus est affiché aux clients sur chacune de tes fiches produit.
            </p>
          </div>

          <div>
            <label htmlFor="roomNumber" className="label">
              Lieu de retrait <span className="font-normal text-slate-400">(facultatif)</span>
            </label>
            <input
              id="roomNumber"
              name="roomNumber"
              maxLength={30}
              className="input"
              defaultValue={vendor.roomNumber ?? ""}
              placeholder="Bât. B, ch. 214"
            />
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 p-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="isOpen"
                defaultChecked={vendor.isOpen}
                className="mt-1 size-4 accent-teal-700"
              />
              <span>
                <span className="block text-sm font-semibold">
                  Boutique ouverte aux commandes
                </span>
                <span className="block text-xs text-slate-600">
                  Décoche cette case quand tu ne peux plus préparer de commandes : tes plats
                  restent visibles avec le badge « Fermé actuellement », mais plus personne ne peut
                  commander jusqu&apos;à la réouverture.
                </span>
              </span>
            </label>

            <div>
              <label htmlFor="orderCutoffTime" className="label">
                Heure limite de commande{" "}
                <span className="font-normal text-slate-400">(facultatif)</span>
              </label>
              <input
                id="orderCutoffTime"
                name="orderCutoffTime"
                type="time"
                className="input"
                defaultValue={vendor.orderCutoffTime ?? ""}
              />
              <p className="mt-1 text-xs text-slate-500">
                Affichée sur ta vitrine (ex. 19:30) pour que les étudiants sachent jusqu&apos;à
                quelle heure commander.
              </p>
            </div>
          </div>

          <button type="submit" className="btn-primary">
            Enregistrer
          </button>
        </form>
      </details>

      {/* ------------------------------------------------------------------ */}
      {/* Commandes                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section id="commandes" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold tracking-tight">Commandes</h2>
          <span className="badge bg-slate-100 text-slate-700">{orders.length} au total</span>
        </div>

        {orders.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="font-semibold">Aucune commande pour le moment</p>
            <p className="mt-1 text-sm text-slate-600">
              Partage tes produits sur WhatsApp pour recevoir tes premières commandes.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {orders.map((order) => {
              const payment = order.payments[0];
              const statusLabel = ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status;
              const canConfirm = order.status === "AWAITING_PAYMENT" || order.status === "PAID";
              const canDeliver = ["PAID", "VENDOR_CONFIRMED", "READY_FOR_PICKUP"].includes(
                order.status,
              );
              const canCancel = ![
                "DELIVERED",
                "COMPLETED",
                "CANCELLED",
                "EXPIRED",
                "REFUNDED",
              ].includes(order.status);
              const isOnlinePaid =
                order.paymentStatus === "PAID" && payment?.provider !== "CASH";
              const paymentLabel = PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus;
              const awaitingOnlinePayment =
                payment?.provider === "MONEYFUSION" &&
                (payment.status === "CREATED" || payment.status === "PENDING");

              return (
                <li key={order.id} className="card overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/commande/${order.reference}`}
                        className="font-mono text-sm font-semibold text-teal-800 hover:underline"
                      >
                        {order.reference}
                      </Link>
                      <span className="badge bg-slate-100 text-slate-700">{statusLabel}</span>
                      {order.type === "RESERVATION" ? (
                        <span className="badge bg-teal-50 text-teal-700">Réservation</span>
                      ) : null}
                      {isOnlinePaid && order.payoutStatus === "PAID" ? (
                        <span className="badge bg-teal-50 text-teal-800">
                          Reversé ({netLabel} %)
                        </span>
                      ) : null}
                      {isOnlinePaid && order.payoutStatus === "PROCESSING" ? (
                        <span className="badge bg-amber-50 text-amber-800">
                          Reversement en cours
                        </span>
                      ) : null}
                      {isOnlinePaid && order.payoutStatus === "FAILED" ? (
                        <span className="badge bg-red-50 text-red-700">Reversement échoué</span>
                      ) : null}
                    </div>
                    <span className="text-xs text-slate-500">{formatDate(order.createdAt)}</span>
                  </div>

                  <div className="grid gap-4 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="space-y-2">
                      <ul className="space-y-2">
                        {order.items.map((item) => (
                          <li key={item.id} className="flex items-center gap-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.product.images[0]?.url ?? "/produits/caracolo.svg"}
                              alt=""
                              className="size-10 rounded-lg object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{item.product.name}</p>
                              <p className="text-xs text-slate-500">
                                {item.quantity} × {formatXof(item.unitPriceXof)}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>

                      <div className="text-sm text-slate-700">
                        <p>
                          <strong>Client :</strong> {order.buyerName} · {order.buyerPhone}
                        </p>
                        {order.buyerRoom ? (
                          <p>
                            <strong>Livraison :</strong> {order.buyerRoom}
                          </p>
                        ) : null}
                        {order.pickupSlot ? (
                          <p>
                            <strong>Créneau :</strong> {order.pickupSlot}
                          </p>
                        ) : null}
                        {order.buyerNote ? (
                          <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">
                            « {order.buyerNote} »
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-3 sm:text-right">
                      <div>
                        <p className="text-lg font-bold">{formatXof(order.totalXof)}</p>
                        <p className="text-xs text-slate-500">
                          {payment?.provider === "CASH" ? "À la réception" : "Mobile Money"} ·{" "}
                          {paymentLabel}
                        </p>
                      </div>

                      {awaitingOnlinePayment ? (
                        <p className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900 sm:text-left">
                          En attente de confirmation de l&apos;opérateur. Ne livre pas encore.
                        </p>
                      ) : null}

                      {isOnlinePaid && order.payoutStatus === "FAILED" ? (
                        <div className="space-y-2 text-left">
                          {order.payoutError ? (
                            <p className="max-h-40 overflow-y-auto break-words rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700">
                              {order.payoutError}
                            </p>
                          ) : null}
                          <form action={retryVendorPayoutAction}>
                            <input type="hidden" name="orderId" value={order.id} />
                            <button type="submit" className="btn-secondary !py-1.5 !text-xs">
                              Relancer le virement
                            </button>
                          </form>
                        </div>
                      ) : null}

                      {order.status === "DELIVERED" ? (
                        <p className="rounded-lg bg-teal-50 px-2 py-1 text-left text-xs text-teal-900">
                          En attente de confirmation de l&apos;acheteur, ou reversement automatique
                          48 h après la livraison.
                        </p>
                      ) : null}

                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        {canConfirm ? (
                          <form action={updateOrderAction}>
                            <input type="hidden" name="orderId" value={order.id} />
                            <input type="hidden" name="intent" value="CONFIRM" />
                            <button type="submit" className="btn-secondary !py-1.5 !text-xs">
                              Confirmer
                            </button>
                          </form>
                        ) : null}

                        {canDeliver ? (
                          <form action={updateOrderAction}>
                            <input type="hidden" name="orderId" value={order.id} />
                            <input type="hidden" name="intent" value="DELIVER" />
                            <button type="submit" className="btn-primary !py-1.5 !text-xs">
                              {isOnlinePaid ? "Marquer livrée" : "Livrée / payée"}
                            </button>
                          </form>
                        ) : null}

                        {canCancel ? (
                          <form action={updateOrderAction}>
                            <input type="hidden" name="orderId" value={order.id} />
                            <input type="hidden" name="intent" value="CANCEL" />
                            <button type="submit" className="btn-ghost !py-1.5 !text-xs text-red-700">
                              Annuler
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Produits                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section id="produits" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold tracking-tight">Mes produits</h2>
          <Link href="/espace-vendeur/produits/nouveau" className="btn-secondary !py-2 !text-xs">
            + Nouveau
          </Link>
        </div>

        {products.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="font-semibold">Ta boutique est encore vide</p>
            <p className="mt-1 text-sm text-slate-600">
              Ajoute un premier produit pour apparaître dans le catalogue.
            </p>
            <Link href="/espace-vendeur/produits/nouveau" className="btn-primary mt-4">
              Ajouter un produit
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {products.map((product) => {
              const shareLink = product.shareLinks[0];
              const shareUrl = shareLink ? `${origin}/s/${shareLink.code}` : null;

              return (
                <li key={product.id} className="card p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={product.images[0]?.url ?? "/produits/caracolo.svg"}
                      alt=""
                      className="size-16 rounded-xl object-cover"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/p/${product.slug}`}
                          className="font-semibold hover:text-teal-700"
                        >
                          {product.name}
                        </Link>
                        <StockBadge product={product} />
                        {!product.isActive ? (
                          <span className="badge bg-slate-100 text-slate-600">Masqué</span>
                        ) : null}
                        <span className="ml-auto flex items-center gap-1">
                          <Link
                            href={`/espace-vendeur/produits/${product.id}/modifier`}
                            className="btn-secondary !px-2 !py-1 !text-xs"
                          >
                            Modifier
                          </Link>
                          {params.supprimer === product.id ? (
                            <form action={deleteProductAction} className="flex items-center gap-1">
                              <input type="hidden" name="productId" value={product.id} />
                              <span className="text-xs text-slate-600">Supprimer ?</span>
                              <button type="submit" className="btn !bg-red-600 !px-2 !py-1 !text-xs !text-white">
                                Oui
                              </button>
                              <Link
                                href="/espace-vendeur#produits"
                                className="btn-ghost !px-2 !py-1 !text-xs"
                              >
                                Non
                              </Link>
                            </form>
                          ) : (
                            <Link
                              href={`/espace-vendeur?supprimer=${product.id}#produits`}
                              className="btn-ghost !px-2 !py-1 !text-xs text-red-700"
                            >
                              Supprimer
                            </Link>
                          )}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-slate-600">
                        {formatXof(product.priceXof)}
                        {product.category ? ` · ${product.category.name}` : ""} ·{" "}
                        {product._count.orderItems} vente{product._count.orderItems > 1 ? "s" : ""}
                      </p>

                      {shareUrl ? (
                        <div className="mt-2 space-y-1">
                          <p className="break-all font-mono text-xs text-slate-500">{shareUrl}</p>
                          <p className="text-xs text-slate-500">
                            {shareLink.opensCount} ouverture{shareLink.opensCount > 1 ? "s" : ""} ·{" "}
                            {shareLink.conversionsCount} commande
                            {shareLink.conversionsCount > 1 ? "s" : ""}
                          </p>
                          <a
                            href={`https://wa.me/?text=${encodeURIComponent(
                              `${product.name} — ${formatXof(product.priceXof)} sur 2iE Market : ${shareUrl}`,
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-semibold text-teal-700 underline"
                          >
                            Partager sur WhatsApp
                          </a>
                        </div>
                      ) : (
                        <form action={createShareLinkAction} className="mt-2">
                          <input type="hidden" name="productId" value={product.id} />
                          <button type="submit" className="btn-ghost !px-0 !py-1 !text-xs text-teal-700">
                            Créer un lien de partage WhatsApp
                          </button>
                        </form>
                      )}
                    </div>
                  </div>

                  <form
                    action={updateStockAction}
                    className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3"
                  >
                    <input type="hidden" name="productId" value={product.id} />
                    <div className="min-w-36 flex-1">
                      <label className="label !text-xs" htmlFor={`mode-${product.id}`}>
                        Mode de stock
                      </label>
                      <select
                        id={`mode-${product.id}`}
                        name="stockMode"
                        className="input !py-1.5 !text-sm"
                        defaultValue={product.stockMode}
                      >
                        <option value="TRACKED">Stock suivi</option>
                        <option value="UNLIMITED">Disponible en continu</option>
                        <option value="OUT_OF_STOCK">En rupture</option>
                      </select>
                    </div>
                    <div className="w-24">
                      <label className="label !text-xs" htmlFor={`qty-${product.id}`}>
                        Quantité
                      </label>
                      <input
                        id={`qty-${product.id}`}
                        name="stockQty"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100_000}
                        defaultValue={product.stockQty}
                        className="input !py-1.5 !text-sm"
                      />
                    </div>
                    <button type="submit" className="btn-secondary !py-1.5 !text-xs">
                      Mettre à jour
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {lowStockProducts.length > 0 ? (
        <section className="card border-amber-200 bg-amber-50/50 p-5">
          <h2 className="font-semibold text-amber-900">Stocks à surveiller</h2>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {lowStockProducts.map((product) => (
              <li key={product.id}>
                {product.name} —{" "}
                {product.stockMode === "OUT_OF_STOCK" || product.stockQty <= 0
                  ? "en rupture"
                  : `plus que ${product.stockQty} en stock`}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
