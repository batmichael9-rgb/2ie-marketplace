/**
 * Montants et frais.
 *
 * Tous les montants sont manipulés en entiers de francs CFA (XOF) : le franc
 * CFA n'a pas de sous-unité, on ne doit jamais utiliser de flottants.
 */

export function formatXof(amount: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(Math.round(amount))} FCFA`;
}

/**
 * Commission plateforme retenue sur chaque vente payée en ligne : 5 %.
 *
 * Le prix affiché reste le prix payé par l'acheteur. La commission est déduite
 * de la part du vendeur (95 % reversés), jamais ajoutée au prix client.
 *
 * Taux piloté par PLATFORM_FEE_BPS (500 pb = 5 %). Une valeur absente, invalide
 * ou nulle retombe sur 500 pb pour que la commission reste toujours de 5 %.
 */
const configuredBps = Number(process.env.PLATFORM_FEE_BPS ?? 500);

/** Commission plateforme, en points de base (100 pb = 1 %). */
export const PLATFORM_FEE_BPS =
  Number.isFinite(configuredBps) && configuredBps > 0 ? configuredBps : 500;

export const PLATFORM_COMMISSION_RATE = PLATFORM_FEE_BPS / 10_000;

/**
 * Décompose un montant payé en ligne en commission (5 %) et net vendeur (95 %).
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

/**
 * Calcule la commission à partir de PLATFORM_FEE_BPS (500 pb = 5 %).
 * Conservé pour les appels historiques ; computeFeeBreakdown donne le détail
 * commission + net vendeur.
 */
export function computeFees(subtotalXof: number): number {
  return Math.round((subtotalXof * PLATFORM_FEE_BPS) / 10_000);
}
