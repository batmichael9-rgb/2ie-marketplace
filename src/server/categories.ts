import "server-only";

import { CATEGORIES } from "@/lib/categories";
import { db } from "@/lib/db";

/**
 * Garantit que les 27 catégories de `src/lib/categories.ts` existent en base.
 *
 * Les catégories sont créées à la première visite du catalogue ou du
 * formulaire produit, puis mises en cache pour la durée du processus : une
 * seule requête de lecture est faite par démarrage du serveur.
 */
let syncPromise: Promise<void> | null = null;

export function ensureCatalogCategories(): Promise<void> {
  if (!syncPromise) {
    syncPromise = syncCategories().catch((error) => {
      syncPromise = null;
      throw error;
    });
  }

  return syncPromise;
}

async function syncCategories(): Promise<void> {
  const existing = await db.category.findMany({ select: { slug: true } });
  const known = new Set(existing.map((category) => category.slug));
  const missing = CATEGORIES.filter((category) => !known.has(category.slug));

  if (missing.length === 0) return;

  await db.category.createMany({
    data: CATEGORIES.filter((category) => missing.some((item) => item.slug === category.slug)).map(
      (category) => ({
        name: category.name,
        slug: category.slug,
        position: CATEGORIES.findIndex((item) => item.slug === category.slug),
      }),
    ),
    skipDuplicates: true,
  });
}

export type CategoryOption = { id: string; name: string; slug: string };

/**
 * Catégories proposées dans les formulaires produit, dans l'ordre de référence
 * (et non l'ordre d'insertion en base).
 */
export async function catalogCategoryOptions(): Promise<CategoryOption[]> {
  await ensureCatalogCategories();

  const rows = await db.category.findMany({
    where: { slug: { in: CATEGORIES.map((category) => category.slug) } },
    select: { id: true, name: true, slug: true },
  });

  const bySlug = new Map(rows.map((row) => [row.slug, row]));

  return CATEGORIES.flatMap((category) => {
    const row = bySlug.get(category.slug);
    return row ? [{ id: row.id, name: category.name, slug: category.slug }] : [];
  });
}
