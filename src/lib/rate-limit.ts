import "server-only";

import { headers } from "next/headers";

/**
 * Limiteur de débit simple, en mémoire, pour les actions sensibles (envoi de
 * codes OTP, messages). Suffisant pour une instance unique : sur un
 * déploiement multi-instances, chaque instance applique sa propre fenêtre.
 *
 * La mémoire est bornée : au-delà de `MAX_KEYS`, les entrées les plus
 * anciennes sont purgées à chaque appel pour éviter une fuite mémoire.
 */
type Bucket = { hits: number[] };

const MAX_KEYS = 10_000;

const globalForRateLimit = globalThis as unknown as {
  rateLimitBuckets?: Map<string, Bucket>;
};

const buckets = (globalForRateLimit.rateLimitBuckets ??= new Map<string, Bucket>());

function prune(now: number, windowMs: number) {
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((hit) => now - hit < windowMs);
    if (bucket.hits.length === 0) buckets.delete(key);
  }
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

/**
 * Autorise au plus `limit` appels par `windowMs` pour une clé donnée.
 *
 * @example rateLimit(`message:${user.id}`, 20, 60_000)
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  if (buckets.size > MAX_KEYS) prune(now, windowMs);

  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((hit) => now - hit < windowMs);

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0] ?? now;
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
    };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { ok: true };
}

/** Adresse IP du client derrière le proxy (Vercel renseigne x-forwarded-for). */
export async function getClientIp(): Promise<string> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "inconnu";
  return store.get("x-real-ip")?.trim() || "inconnu";
}
