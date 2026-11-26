import { appUrl } from "@/lib/domain";

/** Image de repli quand un produit ou une boutique n'a pas de visuel partageable. */
export const DEFAULT_OG_IMAGE = "/og-default.png";

/**
 * URL absolue d'image pour les aperçus Open Graph / Twitter.
 *
 * Les crawlers (WhatsApp, X, Facebook) n'acceptent que des URL absolues en
 * HTTPS. Une image base64 (`data:`) n'est jamais partageable : on retombe alors
 * sur l'affiche générique de la marketplace.
 */
export function ogImageUrl(url?: string | null): string {
  const base = appUrl();
  if (!url) return `${base}${DEFAULT_OG_IMAGE}`;
  if (url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${base}${url}`;
  return `${base}${DEFAULT_OG_IMAGE}`;
}
