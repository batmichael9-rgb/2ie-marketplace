import "server-only";

import { db } from "./db";

/**
 * Signaux d'intérêt utilisés par les recommandations.
 *
 * Chaque signal est une ligne minuscule (aucune donnée personnelle au-delà de
 * l'identifiant produit/catégorie). Les erreurs d'écriture sont avalées : un
 * échec de personnalisation ne doit jamais casser une navigation ou une
 * commande.
 */
export const PREFERENCE_ACTIONS = ["VIEW_PRODUCT", "SEARCH", "ORDER", "REVIEW"] as const;
export type PreferenceAction = (typeof PREFERENCE_ACTIONS)[number];

const ACTION_WEIGHT: Record<PreferenceAction, number> = {
  VIEW_PRODUCT: 1,
  SEARCH: 1,
  ORDER: 3,
  REVIEW: 2,
};

export type PreferenceSignalInput = {
  userId: string;
  actionType: PreferenceAction;
  categoryId?: string | null;
  productId?: string | null;
  query?: string | null;
};

export async function recordPreferenceSignal(input: PreferenceSignalInput): Promise<void> {
  try {
    await db.userPreferenceSignal.create({
      data: {
        userId: input.userId,
        actionType: input.actionType,
        categoryId: input.categoryId ?? null,
        productId: input.productId ?? null,
        // On tronque pour éviter qu'une requête très longue ne gonfle la table.
        query: input.query ? input.query.slice(0, 160) : null,
      },
    });
  } catch (error) {
    console.error("Signal de préférence non enregistré", error);
  }
}

export type CategoryAffinity = {
  /** Points d'affinité (5 points par interaction récente, plafonné à 50). */
  score: number;
  /** Nombre pondéré d'interactions, utilisé pour le tri secondaire. */
  interactions: number;
  lastAt: Date;
};

/**
 * Affinité par catégorie sur les 60 derniers jours.
 *
 * Une interaction récente (≤ 7 jours) compte plein tarif, une interaction du
 * mois compte 0,6 et le reste 0,3. La somme est plafonnée à 10 interactions
 * pour éviter qu'un unique produit consulté en boucle n'écrase tout le reste.
 */
export async function getCategoryAffinity(userId: string): Promise<Map<string, CategoryAffinity>> {
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  const signals = await db.userPreferenceSignal.findMany({
    where: {
      userId,
      categoryId: { not: null },
      createdAt: { gte: since },
      actionType: { in: [...PREFERENCE_ACTIONS] },
    },
    select: { categoryId: true, actionType: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const now = Date.now();
  const affinity = new Map<string, CategoryAffinity>();

  for (const signal of signals) {
    if (!signal.categoryId) continue;

    const days = (now - signal.createdAt.getTime()) / (24 * 60 * 60 * 1000);
    const recency = days <= 7 ? 1 : days <= 30 ? 0.6 : 0.3;
    const weight =
      (ACTION_WEIGHT[signal.actionType as PreferenceAction] ?? 1) * recency;

    const current = affinity.get(signal.categoryId) ?? {
      score: 0,
      interactions: 0,
      lastAt: signal.createdAt,
    };

    current.interactions += weight;
    current.score = Math.min(10, current.interactions) * 5;
    if (signal.createdAt > current.lastAt) current.lastAt = signal.createdAt;
    affinity.set(signal.categoryId, current);
  }

  return affinity;
}

/** Enregistre un signal sans bloquer la réponse HTTP (usage : `after`). */
export function recordPreferenceSignalSafely(input: PreferenceSignalInput): () => Promise<void> {
  return () => recordPreferenceSignal(input);
}
