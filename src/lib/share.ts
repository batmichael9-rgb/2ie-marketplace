import { formatXof } from "@/lib/money";

/**
 * Textes de partage des liens publics (boutique et produit).
 *
 * Fonctions pures, utilisables côté client : le message est construit à partir
 * du prix / nom déjà affichés sur la page, sans aucun accès réseau.
 */

export const SHOP_FALLBACK_DESCRIPTION =
  "Commandez vos articles et repas en ligne sur le campus 2iE.";

function formatPriceXof(amount: number): string {
  // formatXof renvoie « 1 500 FCFA » : on ne garde que le montant pour éviter
  // « 1 500 FCFA FCFA » dans le message WhatsApp.
  return formatXof(amount).replace(/\s*FCFA$/i, "");
}

export function buildProductShareMessage({
  name,
  priceXof,
  shopName,
  url,
}: {
  name: string;
  priceXof: number;
  shopName: string;
  url: string;
}): string {
  return [
    `✨ *${name}* — *${formatPriceXof(priceXof)} FCFA*`,
    `Disponible chez *${shopName}* sur 2iE Market (paiement Mobile Money sécurisé).`,
    `👉 Commander ici : ${url}`,
  ].join("\n");
}

export function buildShopShareMessage({
  shopName,
  description,
  url,
}: {
  shopName: string;
  description?: string | null;
  url: string;
}): string {
  const pitch = description?.trim() || SHOP_FALLBACK_DESCRIPTION;
  return [
    `🛍️ Découvre la boutique *${shopName}* sur 2iE Market !`,
    pitch,
    `👉 Voir le catalogue : ${url}`,
  ].join("\n");
}

/** Lien d'ouverture WhatsApp avec le message déjà encodé. */
export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
