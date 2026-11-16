import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClearIdempotency } from "@/components/clear-idempotency";
import { StockBadge } from "@/components/stock-badge";
import { Stars } from "@/components/stars";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { appUrl, formatDate } from "@/lib/domain";
import { formatXof } from "@/lib/money";
import { createReviewAction } from "@/server/actions/reviews";

const REVIEWABLE_STATUSES = ["PAID", "VENDOR_CONFIRMED", "READY_FOR_PICKUP", "COMPLETED"];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await db.product.findUnique({
    where: { slug },
    include: { vendor: { select: { shopName: true } } },
  });

  if (!product) return { title: "Produit introuvable" };

  const description = `${formatXof(product.priceXof)} · ${product.vendor.shopName} · ${product.description.slice(0, 120)}`;

  return {
    title: product.name,
    description,
    openGraph: { title: product.name, description, type: "website" },
  };
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { slug } = await params;
  const { ref } = await searchParams;

  const product = await db.product.findUnique({
    where: { slug },
    include: {
      vendor: true,
      category: true,
      images: { orderBy: { position: "asc" } },
      reviews: {
        where: { isVisible: true },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { buyer: { select: { fullName: true } } },
      },
    },
  });

  if (!product || !product.isActive) notFound();

  const user = await getCurrentUser();

  // Un avis n'est possible qu'après un achat : on cherche une ligne de commande
  // du client pour ce produit qui n'a pas encore été notée.
  const reviewableItem = user
    ? await db.orderItem.findFirst({
        where: {
          productId: product.id,
          review: null,
          order: { buyerId: user.id, status: { in: REVIEWABLE_STATUSES } },
        },
        select: { id: true },
      })
    : null;

  const ratingCount = product.reviews.length;
  const ratingAverage =
    ratingCount > 0
      ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / ratingCount
      : 0;

  const outOfStock =
    product.stockMode === "OUT_OF_STOCK" ||
    (product.stockMode === "TRACKED" && product.stockQty <= 0);

  const shareText = `${product.name} — ${formatXof(product.priceXof)} sur 2iE Market : ${appUrl()}/p/${product.slug}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return (
    <div className="space-y-6">
      <ClearIdempotency scope={product.id} />

      <nav className="text-sm text-slate-500">
        <Link href="/" className="hover:text-teal-700">
          Catalogue
        </Link>
        {product.category ? (
          <>
            <span aria-hidden> / </span>
            <Link href={`/?categorie=${product.category.slug}`} className="hover:text-teal-700">
              {product.category.name}
            </Link>
          </>
        ) : null}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="card overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={product.images[0]?.url ?? "/produits/caracolo.svg"}
              alt={product.name}
              className="aspect-square w-full bg-slate-100 object-cover sm:aspect-[4/3]"
            />
          </div>

          {product.images.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto">
              {product.images.map((image) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={image.id}
                  src={image.url}
                  alt=""
                  className="size-20 shrink-0 rounded-xl border border-slate-200 object-cover"
                />
              ))}
            </div>
          ) : null}

          <section className="card p-5">
            <h2 className="text-lg font-bold">Description</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">
              {product.description}
            </p>

            {product.pickupNote ? (
              <p className="mt-4 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900">
                <strong>Retrait :</strong> {product.pickupNote}
              </p>
            ) : null}
          </section>

          <section className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Avis des étudiants</h2>
              <Stars value={ratingAverage} count={ratingCount} />
            </div>

            {product.reviews.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Aucun avis pour le moment. Les avis proviennent uniquement d&apos;achats vérifiés.
              </p>
            ) : (
              <ul className="mt-4 space-y-4">
                {product.reviews.map((review) => (
                  <li key={review.id} className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{review.buyer.fullName}</span>
                      <span className="text-xs text-slate-400">{formatDate(review.createdAt)}</span>
                    </div>
                    <Stars value={review.rating} />
                    {review.comment ? (
                      <p className="mt-1 text-sm text-slate-700">{review.comment}</p>
                    ) : null}
                    <span className="badge mt-2 bg-teal-50 text-teal-700">Achat vérifié</span>
                  </li>
                ))}
              </ul>
            )}

            {reviewableItem ? (
              <form action={createReviewAction} className="mt-5 space-y-3 border-t border-slate-200 pt-4">
                <input type="hidden" name="orderItemId" value={reviewableItem.id} />
                <p className="text-sm font-semibold">Tu as acheté ce produit : laisse un avis</p>
                <div className="flex items-center gap-2">
                  <label htmlFor="rating" className="text-sm text-slate-600">
                    Note
                  </label>
                  <select id="rating" name="rating" className="input !w-auto py-1.5" defaultValue="5">
                    {[5, 4, 3, 2, 1].map((value) => (
                      <option key={value} value={value}>
                        {"★".repeat(value)} ({value}/5)
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  name="comment"
                  rows={3}
                  className="input"
                  placeholder="Produit conforme ? Vendeur réactif ? (visible publiquement)"
                />
                <button type="submit" className="btn-primary">
                  Publier mon avis
                </button>
              </form>
            ) : null}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="card p-5">
            <StockBadge product={product} />
            <h1 className="mt-2 text-xl font-bold leading-tight">{product.name}</h1>
            <p className="mt-2 text-2xl font-extrabold text-teal-800">
              {formatXof(product.priceXof)}
            </p>

            <div className="mt-4 space-y-2">
              {outOfStock ? (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                  Ce produit est en rupture de stock. Demande au vendeur quand il sera de retour.
                </p>
              ) : (
                <Link
                  href={`/commander/${product.id}${ref ? `?ref=${ref}` : ""}`}
                  className="btn-primary w-full !py-3 text-base"
                >
                  {product.isReservable ? "Réserver" : "Commander"}
                </Link>
              )}
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary w-full"
              >
                Partager sur WhatsApp
              </a>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Paiement à la réception (espèces ou transfert direct au vendeur). Aucun frais.
            </p>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-500">Vendu par</h2>
            <p className="mt-1 text-lg font-bold">{product.vendor.shopName}</p>
            <div className="mt-1">
              <Stars value={product.vendor.ratingAvg} count={product.vendor.ratingCount} />
            </div>
            {product.vendor.roomNumber ? (
              <p className="mt-2 text-sm text-slate-700">
                <strong>Chambre :</strong> {product.vendor.roomNumber}
              </p>
            ) : null}
            {product.vendor.description ? (
              <p className="mt-2 text-sm text-slate-600">{product.vendor.description}</p>
            ) : null}
            {product.vendor.momoNumber ? (
              <p className="mt-2 text-sm text-slate-700">
                <strong>Mobile Money :</strong> {product.vendor.momoNumber}
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
