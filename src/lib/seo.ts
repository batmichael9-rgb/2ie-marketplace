import { appUrl } from "@/lib/domain";

/** Image de repli quand un produit ou une boutique n'a pas de visuel partageable. */
export const DEFAULT_OG_IMAGE = "/logo.jpg";

/**
 * URL absolue d'image pour les aperçus Open Graph / Twitter.
 *
 * Les crawlers (WhatsApp, X, Facebook) n'acceptent que des URL absolues en
 * HTTPS. Les candidats sont essayés dans l'ordre (bannière, photo produit...) et
 * le premier servi en HTTPS l'emporte ; une image base64 (`data:`) ou un chemin
 * relatif n'est jamais partageable, on retombe alors sur le logo 2iE Market.
 */
export function ogImageUrl(...candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    const url = candidate?.trim();
    if (url && url.startsWith("https://")) return url;
  }
  return `${appUrl()}${DEFAULT_OG_IMAGE}`;
}
