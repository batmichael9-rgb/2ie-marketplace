import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampusBadge } from "@/components/campus-badge";
import { ShareShopButton } from "@/components/share-shop-button";
import { Stars } from "@/components/stars";
import { db } from "@/lib/db";
import { formatXof } from "@/lib/money";
import { ogImageUrl } from "@/lib/seo";

/**
 * Vitrine publique d'une boutique : /boutique/<slug>
 *
 * Elle regroupe tous les plats actifs d'un commerçant et sert de page de
 * destination pour le partage WhatsApp. Les métadonnées Open Graph utilisent
 * l'affiche de la boutique (ou son logo) pour que le lien s'affiche en grand.
 */

async function getVendor(slug: string) {
  return db.vendorProfile.findUnique({
    where: { slug },
    select: {
      shopName: true,
      slug: true,
      description: true,
      bannerUrl: true,
      campus: true,
      roomNumber: true,
      ratingAvg: true,
      ratingCount: true,
      isActive: true,
      isOpen: true,
      orderCutoffTime: true,
      // Photo du premier produit actif : repli d'aperçu quand la boutique n'a
      // pas de bannière HTTPS exploitable par WhatsApp.
      products: {
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          images: { orderBy: { position: "asc" }, take: 1, select: { url: true } },
        },
      },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const vendor = await getVendor(slug);

  if (!vendor || !vendor.isActive) return { title: "Boutique introuvable" };

  const description =
    vendor.description?.trim() ||
    `Découvre ${vendor.shopName} sur 2iE Market${vendor.campus ? ` — ${vendor.campus}` : ""}.`;
  // Bannière d'abord, puis photo du premier produit actif, puis affiche
  // générique — toujours en URL absolue HTTPS pour le robot WhatsApp.
  const image = ogImageUrl(vendor.bannerUrl, vendor.products[0]?.images[0]?.url);

  return {
    title: { absolute: `${vendor.shopName} | 2iE Market` },
    description,
    openGraph: {
      type: "website",
      title: vendor.shopName,
      description,
      images: [{ url: image, alt: vendor.shopName }],
    },
    twitter: {
      card: "summary_large_image",
      title: vendor.shopName,
      description,
      images: [image],
    },
  };
}

export default async function BoutiquePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const vendor = await db.vendorProfile.findUnique({
    where: { slug },
    include: {
      products: {
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        include: { images: { orderBy: { position: "asc" }, take: 1 } },
      },
    },
  });

  if (!vendor || !vendor.isActive) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="card overflow-hidden">
        {vendor.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vendor.bannerUrl}
            alt={`Affiche de ${vendor.shopName}`}
            className="h-44 w-full object-cover sm:h-60"
          />
        ) : (
          <div className="h-28 w-full bg-gradient-to-br from-teal-800 via-teal-700 to-emerald-600 sm:h-36" />
        )}

        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{vendor.shopName}</h1>
                {!vendor.isOpen ? (
                  <span className="badge bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300">
                    Fermé actuellement
                  </span>
                ) : (
                  <span className="badge bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                    Ouverte aux commandes
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <CampusBadge campus={vendor.campus} />
                <Stars value={vendor.ratingAvg} count={vendor.ratingCount} />
              </div>
              {vendor.roomNumber ? (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  Retrait : {vendor.roomNumber}
                </p>
              ) : null}
              {vendor.orderCutoffTime ? (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Commandes jusqu&apos;à {vendor.orderCutoffTime}
                </p>
              ) : null}
              {vendor.description ? (
                <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  {vendor.description}
                </p>
              ) : null}
            </div>

            <ShareShopButton
              slug={vendor.slug}
              shopName={vendor.shopName}
              description={vendor.description}
              className="btn-secondary w-full sm:w-auto"
            />
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold tracking-tight">Les produits de la boutique</h2>
          <span className="badge bg-slate-100 text-slate-700">{vendor.products.length}</span>
        </div>

        {vendor.products.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="font-semibold">Aucun produit en ligne pour le moment</p>
            <p className="mt-1 text-sm text-slate-600">
              La boutique prépare son menu : reviens un peu plus tard.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {vendor.products.map((product) => (
              <li key={product.id} className="min-w-0">
                <Link
                  href={`/p/${product.slug}`}
                  className="card group flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md"
                >
                  <div className="relative h-28 w-full overflow-hidden bg-slate-100 sm:h-32">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={product.images[0]?.url ?? "/produits/caracolo.svg"}
                      alt={product.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-snug">
                      {product.name}
                    </h3>
                    <p className="mt-auto text-sm font-bold text-teal-800 dark:text-teal-400">
                      {formatXof(product.priceXof)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
