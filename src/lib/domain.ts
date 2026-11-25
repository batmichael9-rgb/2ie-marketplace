/**
 * Valeurs de domaine partagées (statuts, modes de stock, libellés).
 *
 * Les statuts sont stockés en String en base pour rester portables entre SQLite
 * et PostgreSQL ; ce module est la source de vérité des valeurs autorisées.
 */

export const STOCK_MODES = ["TRACKED", "UNLIMITED", "OUT_OF_STOCK"] as const;
export type StockMode = (typeof STOCK_MODES)[number];

export const STOCK_MODE_LABELS: Record<StockMode, string> = {
  TRACKED: "Stock suivi",
  UNLIMITED: "Disponible en continu",
  OUT_OF_STOCK: "En rupture",
};

export const ORDER_STATUSES = [
  "AWAITING_PAYMENT",
  "PAID",
  "VENDOR_CONFIRMED",
  "READY_FOR_PICKUP",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  AWAITING_PAYMENT: "En attente de paiement",
  PAID: "Payée",
  VENDOR_CONFIRMED: "Confirmée par le vendeur",
  READY_FOR_PICKUP: "Prête à être retirée",
  DELIVERED: "Livrée — confirme la réception",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
  EXPIRED: "Expirée",
  REFUNDED: "Remboursée",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: "Non payée",
  PENDING: "Paiement en attente",
  PAID: "Payée",
  FAILED: "Paiement échoué",
  REFUNDED: "Remboursée",
};

export const PAYMENT_STATUSES = [
  "CREATED",
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "EXPIRED",
  "REFUNDED",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Le client peut-il annuler lui-même cette commande ? */
export function canBuyerCancelOrder(order: {
  status: string;
  paymentStatus: string;
  confirmedAt: Date | null;
}): boolean {
  if (order.paymentStatus === "PAID") return false;
  if (!["AWAITING_PAYMENT", "VENDOR_CONFIRMED"].includes(order.status)) return false;
  return order.confirmedAt === null;
}

export function stockBadge(product: {
  stockMode: string;
  stockQty: number;
  lowStockThreshold: number;
}): { label: string; tone: "ok" | "warning" | "danger" } | null {
  if (product.stockMode === "OUT_OF_STOCK") {
    return { label: "En rupture de stock", tone: "danger" };
  }
  if (product.stockMode === "UNLIMITED") return null;
  if (product.stockQty <= 0) return { label: "En rupture de stock", tone: "danger" };
  if (product.stockQty <= product.lowStockThreshold) {
    return { label: `Plus que ${product.stockQty} en stock`, tone: "warning" };
  }
  return { label: "Disponible", tone: "ok" };
}

/**
 * Normalise une chaîne pour la recherche : minuscules, sans accents.
 *
 * Utilisé plutôt que `mode: "insensitive"` de Prisma, qui n'existe pas sur
 * SQLite : la recherche se comporte ainsi de la même façon en dev et en prod.
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Deux chaînes diffèrent-elles d'un seul caractère (ajout, suppression ou
 * remplacement) ? Sert à tolérer une petite faute de frappe ("telepone").
 */
function isOneEditApart(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length - short.length > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (short.length === long.length) {
      i += 1;
      j += 1;
    } else {
      j += 1;
    }
  }
  return edits + (long.length - j) <= 1;
}

/**
 * Un texte correspond-il à la recherche ? Insensible à la casse et aux accents,
 * par inclusion partielle ("tel" trouve "Téléphone"), et tolérant à une faute
 * de frappe par mot de 4 lettres ou plus ("telepone").
 *
 * Partagé entre le serveur et le client pour que le filtrage en direct donne
 * exactement le même résultat qu'une recherche envoyée par l'URL.
 */
export function matchesSearchQuery(text: string, query: string): boolean {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = normalizeSearchText(text);
  if (terms.every((term) => haystack.includes(term))) return true;

  const words = haystack.split(/[^a-z0-9]+/).filter(Boolean);
  return terms.every((term) =>
    term.length >= 4
      ? words.some((word) => isOneEditApart(word, term))
      : haystack.includes(term),
  );
}

/**
 * Seuls les emails `prenom.nom@2ie-edu.org` peuvent ouvrir une boutique.
 *
 * Le domaine doit être exactement `2ie-edu.org` : les autres extensions
 * (`@2ie.bf`), les sous-domaines (`@etu.2ie-edu.org`) et les domaines trompeurs
 * (`@faux2ie-edu.org`) sont refusés. Les clients, eux, gardent n'importe quelle
 * adresse pour acheter.
 */
export const VENDOR_EMAIL_DOMAIN = "2ie-edu.org";

export function isInstitutionalEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2) return false;
  const [localPart, domain] = parts;
  return localPart.length > 0 && domain === VENDOR_EMAIL_DOMAIN;
}

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 60);
}

/** Référence de commande lisible au téléphone : "2IE-8F3K2A". */
export function generateOrderReference(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `2IE-${code}`;
}

export function generateShareCode(): string {
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
  let code = "";
  for (let i = 0; i < 7; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Campus 2iE sur lequel le vendeur se trouve. Stocké tel quel dans
 * VendorProfile.campus pour rester lisible en base et dans les exports.
 */
export const CAMPUSES = ["Site de Ouagadougou", "Site de Kamboinsé"] as const;
export type Campus = (typeof CAMPUSES)[number];

export const CAMPUS_LABELS: Record<Campus, string> = {
  "Site de Ouagadougou": "2iE Ouagadougou",
  "Site de Kamboinsé": "2iE Kamboinsé",
};

/** Libellé court affiché aux clients : « 📍 2iE Ouagadougou ». */
export function campusBadgeLabel(campus: string | null | undefined): string | null {
  if (!campus) return null;
  const label = CAMPUS_LABELS[campus as Campus];
  return label ? `📍 ${label}` : null;
}

export const MOBILE_MONEY_PROVIDERS = ["ORANGE_MONEY", "MOOV_MONEY", "WAVE"] as const;
export type MobileMoneyProvider = (typeof MOBILE_MONEY_PROVIDERS)[number];

export const MOBILE_MONEY_LABELS: Record<MobileMoneyProvider, string> = {
  ORANGE_MONEY: "Orange Money",
  MOOV_MONEY: "Moov Money",
  WAVE: "Wave",
};

export function mobileMoneyLabel(provider: string | null | undefined): string | null {
  if (!provider) return null;
  return MOBILE_MONEY_LABELS[provider as MobileMoneyProvider] ?? provider;
}

/** Moyens de réception des reversements vendeur (part nette de 95 %). */
export const PAYOUT_METHODS = ["ORANGE_MONEY", "MOOV_MONEY", "WAVE", "CARD"] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export const PAYOUT_METHOD_LABELS: Record<PayoutMethod, string> = {
  ORANGE_MONEY: "Orange Money",
  MOOV_MONEY: "Moov Money",
  WAVE: "Wave",
  CARD: "Carte bancaire / RIB",
};

export function payoutMethodLabel(method: string | null | undefined): string {
  if (!method) return PAYOUT_METHOD_LABELS.ORANGE_MONEY;
  return PAYOUT_METHOD_LABELS[method as PayoutMethod] ?? method;
}

/** Statuts du virement des 95 % (Order.payoutStatus). */
export const PAYOUT_STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  READY_FOR_PAYOUT: "Prêt à reverser",
  PROCESSING: "Reversement en cours",
  PAID: "Reversé (95 %)",
  FAILED: "Reversement échoué",
};

/**
 * Normalise un numéro burkinabè au format international +226XXXXXXXX.
 * Renvoie une chaîne vide si le numéro n'est pas exploitable.
 */
export function normalizeBfPhone(raw: string | null | undefined): string {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("226")) digits = digits.slice(3);
  return /^\d{8}$/.test(digits) ? `+226${digits}` : "";
}

/** Formate un numéro +226XXXXXXXX en « +226 XX XX XX XX » pour l'affichage. */
export function formatBfPhone(raw: string | null | undefined): string | null {
  const normalized = normalizeBfPhone(raw);
  if (!normalized) return null;
  const local = normalized.slice(4);
  return `+226 ${local.slice(0, 2)} ${local.slice(2, 4)} ${local.slice(4, 6)} ${local.slice(6, 8)}`;
}

export function formatDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
