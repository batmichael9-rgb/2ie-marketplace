import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { PushNotificationsButton } from "@/components/push-notifications-button";
import { requireVendor } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  CAMPUSES,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  formatDate,
  type OrderStatus,
} from "@/lib/domain";
import { formatXof } from "@/lib/money";
import { StockBadge } from "@/components/stock-badge";
import {
  createShareLinkAction,
  deleteProductAction,
  updateOrderAction,
  updateStockAction,
  updateVendorProfileAction,
} from "@/server/actions/vendor";

export const metadata: Metadata = { title: "Espace vendeur" };

const OPEN_STATUSES = ["AWAITING_PAYMENT", "PAID", "VENDOR_CONFIRMED", "READY_FOR_PICKUP"];

export default async function VendorDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    produit?: string;
    stock?: string;
    commande?: string;
    partage?: string;
    boutique?: string;
    erreur?: string;
    supprimer?: string;
  }>;
}) {
  const { vendor } = await requireVendor();
  const params = await searchParams;

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

  const revenue = orders
    .filter((order) => order.paymentStatus === "PAID")
    .reduce((sum, order) => sum + order.totalXof, 0);

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
  };

  return (
    <div className="space-y-8">
      <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-teal-800 via-teal-700 to-emerald-600 px-5 py-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-100">
              Espace vendeur
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{vendor.shopName}</h1>
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
            <dt className="text-xs text-teal-100">Encaissé</dt>
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

          <fieldset className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <legend className="px-1 text-sm font-semibold">Paiement & Mobile Money</legend>
            <p className="text-xs text-slate-500">
              Utilisé pour les paiements et les reversements de tes ventes.
            </p>

            <div>
              <label htmlFor="momoNumber" className="label">
                Numéro Mobile Money{" "}
                <span className="font-normal text-slate-400">(facultatif)</span>
              </label>
              <input
                id="momoNumber"
                name="momoNumber"
                inputMode="tel"
                maxLength={20}
                className="input"
                defaultValue={vendor.momoNumber ?? ""}
                placeholder="+226 70 00 00 00"
              />
            </div>

            <div>
              <label htmlFor="momoOperator" className="label">
                Opérateur Mobile Money
              </label>
              <select
                id="momoOperator"
                name="momoOperator"
                className="input"
                defaultValue={vendor.momoOperator ?? ""}
              >
                <option value="">Non précisé</option>
                <option value="ORANGE_MONEY">Orange Money</option>
                <option value="MOOV_MONEY">Moov Money</option>
                <option value="WAVE">Wave</option>
              </select>
            </div>
          </fieldset>

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
              const canCancel = !["COMPLETED", "CANCELLED", "EXPIRED", "REFUNDED"].includes(
                order.status,
              );
              const paymentLabel = PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus;
              const awaitingOnlinePayment =
                payment?.provider === "CINETPAY" &&
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
                              Livrée / payée
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
