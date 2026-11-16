/**
 * Montants et frais.
 *
 * Tous les montants sont manipulés en entiers de francs CFA (XOF) : le franc
 * CFA n'a pas de sous-unité, on ne doit jamais utiliser de flottants.
 */

export function formatXof(amount: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(Math.round(amount))} FCFA`;
}

/** Commission plateforme, en points de base (100 pb = 1 %). */
export const PLATFORM_FEE_BPS = Number(process.env.PLATFORM_FEE_BPS ?? 0);

/**
 * Calcule la commission. À 0 pb (MVP), la marketplace ne prend rien :
 * le prix affiché est le prix payé.
 */
export function computeFees(subtotalXof: number): number {
  if (!Number.isFinite(PLATFORM_FEE_BPS) || PLATFORM_FEE_BPS <= 0) return 0;
  return Math.round((subtotalXof * PLATFORM_FEE_BPS) / 10_000);
}
