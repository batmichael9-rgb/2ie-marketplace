import { CatalogBrowser, type CatalogCard } from "@/components/catalog-browser";
import { db } from "@/lib/db";
import { ensureCatalogCategories } from "@/server/categories";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categorie?: string; campus?: string }>;
}) {
  const { q, categorie, campus } = await searchParams;
  const search = (q ?? "").trim();

  // Les 27 catégories de référence sont créées à la première visite pour que
  // les produits puissent y être rattachés dès leur publication.
  await ensureCatalogCategories();

  const allProducts = await db.product.findMany({
    where: { isActive: true },
    include: {
      images: { orderBy: { position: "asc" }, take: 1 },
      vendor: { select: { shopName: true, slug: true, roomNumber: true, campus: true } },
      category: { select: { slug: true } },
      reviews: { where: { isVisible: true }, select: { rating: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Le filtrage (recherche, catégorie, campus) est fait côté client pour une
  // réponse instantanée : on envoie le catalogue avec le texte indexable.
  const cards: CatalogCard[] = allProducts.slice(0, 200).map((product) => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    priceXof: product.priceXof,
    stockMode: product.stockMode,
    stockQty: product.stockQty,
    lowStockThreshold: product.lowStockThreshold,
    isReservable: product.isReservable,
    images: product.images,
    vendor: product.vendor,
    categorySlug: product.category?.slug ?? null,
    rating: {
      count: product.reviews.length,
      average:
        product.reviews.length > 0
          ? product.reviews.reduce((sum, review) => sum + review.rating, 0) /
            product.reviews.length
          : 0,
    },
    searchText: `${product.name} ${product.description}`,
  }));

  return (
    <CatalogBrowser
      initialQuery={search}
      initialCategory={categorie}
      initialCampus={campus}
      cards={cards}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-teal-100">
        Institut 2iE · Ouagadougou
      </p>
      <h1 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">
        Le commerce du campus, au même endroit.
      </h1>
      <p className="mt-2 max-w-xl text-sm text-teal-50">
        Vêtements, électronique, énergie, construction, maison, beauté, services… Commande en
        ligne, retire sur le campus, paie à la remise.
      </p>
    </CatalogBrowser>
  );
}
