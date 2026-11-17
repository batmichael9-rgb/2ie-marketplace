import { VENDOR_EMAIL_DOMAIN } from "@/lib/domain";

export const STOCK_MODES = ["TRACKED", "UNLIMITED", "OUT_OF_STOCK"] as const;
export type StockMode = (typeof STOCK_MODES)[number];
export const STOCK_MODE_LABELS: Record<StockMode, string> = { TRACKED: "Stock suivi", UNLIMITED: "Disponible en continu", OUT_OF_STOCK: "En rupture" };
export const ORDER_STATUSES = ["AWAITING_PAYMENT", "PAID", "VENDOR_CONFIRMED", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED", "EXPIRED", "REFUNDED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = { AWAITING_PAYMENT: "En attente de paiement", PAID: "Payée", VENDOR_CONFIRMED: "Confirmée par le vendeur", READY_FOR_PICKUP: "Prête à être retirée", COMPLETED: "Terminée", CANCELLED: "Annulée", EXPIRED: "Expirée", REFUNDED: "Remboursée" };
export const PAYMENT_STATUS_LABELS: Record<string, string> = { UNPAID: "Non payée", PENDING: "Paiement en attente", PAID: "Payée", FAILED: "Paiement échoué", REFUNDED: "Remboursée" };
export const PAYMENT_STATUSES = ["CREATED", "PENDING", "SUCCEEDED", "FAILED", "EXPIRED", "REFUNDED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export function canBuyerCancelOrder(order: { status: string; paymentStatus: string; confirmedAt: Date | null }): boolean { return order.paymentStatus !== "PAID" && ["AWAITING_PAYMENT", "VENDOR_CONFIRMED"].includes(order.status) && order.confirmedAt === null; }
export function stockBadge(product: { stockMode: string; stockQty: number; lowStockThreshold: number }): { label: string; tone: "ok" | "warning" | "danger" } | null { if (product.stockMode === "OUT_OF_STOCK" || (product.stockMode === "TRACKED" && product.stockQty <= 0)) return { label: "En rupture de stock", tone: "danger" }; if (product.stockMode === "UNLIMITED") return null; if (product.stockQty <= product.lowStockThreshold) return { label: `Plus que ${product.stockQty} en stock`, tone: "warning" }; return { label: "Disponible", tone: "ok" }; }
export function normalizeSearchText(value: string): string { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function isOneEditApart(a: string, b: string): boolean { if (a === b) return true; const [short, long] = a.length <= b.length ? [a, b] : [b, a]; if (long.length - short.length > 1) return false; let i = 0, j = 0, edits = 0; while (i < short.length && j < long.length) { if (short[i] === long[j]) { i++; j++; continue; } edits++; if (edits > 1) return false; if (short.length === long.length) { i++; j++; } else j++; } return edits + long.length - j <= 1; }
export function matchesSearchQuery(text: string, query: string): boolean { const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean); if (terms.length === 0) return true; const haystack = normalizeSearchText(text); if (terms.every((term) => haystack.includes(term))) return true; const words = haystack.split(/[^a-z0-9]+/).filter(Boolean); return terms.every((term) => term.length >= 4 ? words.some((word) => isOneEditApart(word, term)) : haystack.includes(term)); }
export const VENDOR_EMAIL_DOMAIN = "2ie-edu.org";
const STRICT_VENDOR_EMAIL = /^[a-zàâäçéèêëîïôöùûüÿ-]+\.[a-zàâäçéèêëîïôöùûüÿ-]+@2ie-edu\.org$/i;
export function isInstitutionalEmail(email: string | null | undefined): boolean { return Boolean(email && STRICT_VENDOR_EMAIL.test(email.trim().toLowerCase())); }
export function slugify(input: string): string { return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "").slice(0, 60); }
export function generateOrderReference(): string { const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; let code = ""; for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)]; return `2IE-${code}`; }
export function generateShareCode(): string { const alphabet = "23456789abcdefghjkmnpqrstuvwxyz"; let code = ""; for (let i = 0; i < 7; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)]; return code; }
export function appUrl(): string { return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, ""); }
export function formatDate(value: Date | string): string { const date = typeof value === "string" ? new Date(value) : value; return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date); }
