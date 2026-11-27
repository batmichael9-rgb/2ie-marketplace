import "server-only";

import { headers } from "next/headers";
import { db } from "@/lib/db";

/**
 * Limiteur de débit pour les actions sensibles (connexion, codes OTP, messages,
 * recherche IA).
 *
 * Le stockage principal est PostgreSQL (table `RateLimitCounter`) : sur un
 * déploiement serverless multi-instances (Vercel), une `Map` en mémoire ne
 * suffit pas, car chaque instance possède sa propre fenêtre et un attaquant
 * peut répartir ses tentatives. L'incrément est atomique via un UPSERT Prisma
 * (`INSERT ... ON CONFLICT DO UPDATE`) sur une clé qui contient l'index de
 * fenêtre fixe, donc deux instances concurrentes ne perdent jamais de comptage.
 *
 * Repli mémoire uniquement si la base est injoignable (indisponibilité
 * passagère), afin de ne pas bloquer toute l'authentification. Cette dégradation
 * est journalisée.
 */
type Bucket = { hits: number[] };

const MAX_KEYS = 10_000;

const globalForRateLimit = globalThis as unknown as {
  rateLimitBuckets?: Map<string, Bucket>;
};

const memoryBuckets = (globalForRateLimit.rateLimitBuckets ??= new Map<string, Bucket>());

function memoryPrune(now: number, windowMs: number) {
  for (const [key, bucket] of memoryBuckets) {
    bucket.hits = bucket.hits.filter((hit) => now - hit < windowMs);
    if (bucket.hits.length === 0) memoryBuckets.delete(key);
  }
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

function retryAfter(now: number, windowEnd: number): number {
  return Math.max(1, Math.ceil((windowEnd - now) / 1000));
}

function memoryRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  if (memoryBuckets.size > MAX_KEYS) memoryPrune(now, windowMs);

  const bucket = memoryBuckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((hit) => now - hit < windowMs);

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0] ?? now;
    return { ok: false, retryAfterSeconds: retryAfter(now, oldest + windowMs) };
  }

  bucket.hits.push(now);
  memoryBuckets.set(key, bucket);
  return { ok: true };
}

async function databaseRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  // Fenêtre fixe : la clé change à chaque fenêtre, ce qui rend l'UPSERT
  // atomique sans verrou applicatif ni lecture préalable.
  const windowIndex = Math.floor(now / windowMs);
  const bucketKey = `${key}:${windowIndex}`;
  const windowEnd = (windowIndex + 1) * windowMs;

  const row = await db.rateLimitCounter.upsert({
    where: { key: bucketKey },
    create: { key: bucketKey, count: 1, expiresAt: new Date(windowEnd) },
    update: { count: { increment: 1 } },
    select: { count: true },
  });

  // Purge opportuniste : une fois par fenêtre et par clé, sans requête
  // supplémentaire à chaque appel.
  if (row.count === limit) {
    void db.rateLimitCounter
      .deleteMany({ where: { expiresAt: { lt: new Date(now) } } })
      .catch((error) => console.error("Purge RateLimitCounter impossible :", error));
  }

  if (row.count > limit) {
    return { ok: false, retryAfterSeconds: retryAfter(now, windowEnd) };
  }
  return { ok: true };
}

/**
 * Autorise au plus `limit` appels par `windowMs` pour une clé donnée.
 *
 * @example await rateLimit(`message:${user.id}`, 20, 60_000)
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  try {
    return await databaseRateLimit(key, limit, windowMs);
  } catch (error) {
    console.error(
      "Base de données indisponible pour la limitation de débit : repli mémoire local.",
      error,
    );
    return memoryRateLimit(key, limit, windowMs);
  }
}

/** Adresse IP du client derrière le proxy (Vercel renseigne x-forwarded-for). */
export async function getClientIp(): Promise<string> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "inconnu";
  return store.get("x-real-ip")?.trim() || "inconnu";
}
