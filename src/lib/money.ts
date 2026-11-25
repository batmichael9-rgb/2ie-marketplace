/**
 * Montants et frais.
 *
 * Tous les montants sont manipulés en entiers de francs CFA (XOF) : le franc
 * CFA n'a pas de sous-unité, on ne doit jamais utiliser de flottants.
 */

export function formatXof(amount: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(Math.round(amount))} FCFA`;
}

/** Affiche un pourcentage sans zéro inutile : 5, 5,5, 7,25. */
export function formatPercent(value: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
}

/**
 * Commission plateforme retenue sur chaque vente payée en ligne.
 *
 * Le prix affiché reste le prix payé par l'acheteur. La commission est déduite
 * de la part du vendeur (100 - taux reversés), jamais ajoutée au prix client.
 *
 * Taux piloté par PLATFORM_FEE_PERCENT ; absent ou nul, il retombe sur 5 %.
 */
export const PLATFORM_FEE_PERCENT =
  Number(process.env.PLATFORM_FEE_PERCENT) || 5;

/** Part nette reversée au vendeur, en pourcentage (100 - commission). */
export const VENDOR_NET_PERCENT = 100 - PLATFORM_FEE_PERCENT;

/** Taux de commission sous forme décimale (5 % → 0,05). */
export const PLATFORM_COMMISSION_RATE = PLATFORM_FEE_PERCENT / 100;

/**
 * Décompose un montant payé en ligne en commission et net vendeur.
 * Arrondi à l'entier de franc CFA, le net étant calculé par différence pour que
 * commission + net = montant payé, au franc près.
 */
export function computeFeeBreakdown(grossAmount: number): {
  grossAmount: number;
  platformFee: number;
  vendorNetAmount: number;
} {
  const gross = Math.max(0, Math.round(grossAmount));
  const platformFee = Math.round(gross * PLATFORM_COMMISSION_RATE);
  return { grossAmount: gross, platformFee, vendorNetAmount: gross - platformFee };
}

/** Calcule la commission appliquée à un montant payé en ligne. */
export function computeFees(subtotalXof: number): number {
  return computeFeeBreakdown(subtotalXof).platformFee;
}
