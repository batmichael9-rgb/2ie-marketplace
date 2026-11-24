import "server-only";

import type { ProductCardData } from "@/components/product-card";
import { db } from "./db";
import { CAMPUSES, type Campus } from "./domain";
import { getCategoryAffinity, type CategoryAffinity } from "./preferences";

export type RecommendedResult = {
  products: ProductCardData[];
  /** true si le classement provient de l'historique de l'utilisateur. */
  personalized: boolean;
};

const EMPTY: RecommendedResult = { products: [], personalized: false };

type ScoredProduct = {
  card: ProductCardData;
  score: number;
  createdAt: Date;
};

function isCampus(value: string | null | undefined): value is Campus {
  return Boolean(value) && CAMPUSES.includes(value as Campus);
}

/**
 * Produits recommandés pour un étudiant.
 *
 * Score d'affinité :
 *   - jusqu'à 50 pts : 5 pts par interaction récente dans la catégorie du
 *     produit (consultations, recherches, commandes, avis des 60 derniers jours) ;
 *   - +3 pts si le vendeur est sur le campus habituel de l'étudiant ;
 *   - jusqu'à +2 pts pour la note moyenne des avis et la fraîcheur (≤ 30 jours).
 *
 * Sans historique (ou visiteur non connecté), on retombe sur les produits les
 * mieux notés et les plus récents du campus demandé.
 */
export async function getRecommendedProducts(
  userId: string | null,
  preferredCampus?: string | null,
  limit = 8,
): Promise<RecommendedResult> {
  try {
    const campus = isCampus(preferredCampus) ? preferredCampus : null;
    const affinity = userId
      ? await getCategoryAffinity(userId)
      : new Map<string, CategoryAffinity>();

    const products = await db.product.findMany({
      where: {
        isActive: true,
        stockMode: { not: "OUT_OF_STOCK" },
        ...(userId ? { vendor: { userId: { not: userId } } } : {}),
        OR: [{ stockMode: { not: "TRACKED" } }, { stockQty: { gt: 0 } }],
      },
      include: {
        images: { orderBy: { position: "asc" }, take: 1 },
        category: { select: { id: true, slug: true } },
        vendor: {
          select: { shopName: true, slug: true, roomNumber: true, campus: true },
        },
        reviews: { where: { isVisible: true }, select: { rating: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });

    if (products.length === 0) return EMPTY;

    const scored: ScoredProduct[] = products.map((product) => {
      const ratings = product.reviews;
      const average =
        ratings.length > 0
          ? ratings.reduce((sum, review) => sum + review.rating, 0) / ratings.length
          : 0;

      const card: ProductCardData = {
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
        rating: { average, count: ratings.length },
      };

      const categoryScore = product.categoryId
        ? (affinity.get(product.categoryId)?.score ?? 0)
        : 0;
      const campusBonus = campus && product.vendor.campus === campus ? 3 : 0;
      const qualityBonus = (average / 5) * 1.5;
      const ageDays = (Date.now() - product.createdAt.getTime()) / (24 * 60 * 60 * 1000);
      const freshnessBonus = ageDays <= 30 ? 0.5 : 0;

      return {
        card,
        score: categoryScore + campusBonus + qualityBonus + freshnessBonus,
        createdAt: product.createdAt,
      };
    });

    const personalized = affinity.size > 0;

    if (personalized) {
      scored.sort(
        (a, b) =>
          b.score - a.score ||
          b.card.rating.average - a.card.rating.average ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      );

      return { products: scored.slice(0, limit).map((item) => item.card), personalized: true };
    }

    // Repli : les mieux notés puis les plus récents, en priorisant le campus.
    const byQuality = (a: ScoredProduct, b: ScoredProduct) =>
      b.card.rating.average - a.card.rating.average ||
      b.card.rating.count - a.card.rating.count ||
      b.createdAt.getTime() - a.createdAt.getTime();

    const campusProducts = campus
      ? scored.filter((item) => item.card.vendor.campus === campus).sort(byQuality)
      : [];

    const rest = scored
      .filter((item) => !campusProducts.includes(item))
      .sort(byQuality);

    // Si le campus ne propose pas assez d'articles, on complète avec les autres
    // plutôt que d'afficher une rangée presque vide.
    return {
      products: [...campusProducts, ...rest].slice(0, limit).map((item) => item.card),
      personalized: false,
    };
  } catch (error) {
    console.error("Recommandations indisponibles", error);
    return EMPTY;
  }
}
