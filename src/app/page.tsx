import { CatalogBrowser, type CatalogCard } from "@/components/catalog-browser";
import { db } from "@/lib/db";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categorie?: string }>;
}) {
  const { q, categorie } = await searchParams;
  const search = (q ?? "").trim();

  const [categories, allProducts] = await Promise.all([
    db.category.findMany({ orderBy: { position: "asc" } }),
    db.product.findMany({
      where: {
        isActive: true,
        ...(categorie ? { category: { slug: categorie } } : {}),
      },
      include: {
        images: { orderBy: { position: "asc" }, take: 1 },
        vendor: { select: { shopName: true, slug: true, roomNumber: true, campus: true } },
        reviews: { where: { isVisible: true }, select: { rating: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Le filtrage par mot-clé est fait côté client (recherche en direct) : on
  // envoie donc tout le catalogue de la catégorie, avec le texte indexable.
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
    rating: {
      count: product.reviews.length,
      average:
        product.reviews.length > 0
          ? product.reviews.reduce((sum, review) => sum + review.rating, 0) /
            product.reviews.length
          : 0,
    },
    searchText: `${product.name} ${product.description ?? ""}`,
  }));

  return (
    <CatalogBrowser
      initialQuery={search}
      cards={cards}
      categories={categories}
      activeCategory={categorie}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-teal-100">
        Institut 2iE · Ouagadougou
      </p>
      <h1 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">
        Le commerce du campus, au même endroit.
      </h1>
      <p className="mt-2 max-w-xl text-sm text-teal-50">
        Repas, matériel, téléphones, ordinateurs, vêtements et parfums disponibles sur le campus.
        Commande en ligne, retire sur le campus, paie à la remise.
      </p>
    </CatalogBrowser>
  );
}
