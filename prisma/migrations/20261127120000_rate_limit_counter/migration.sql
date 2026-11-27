-- Limitation de débit persistante (login, OTP, messages, recherche IA).
-- Partagée entre toutes les instances serverless Vercel : un compteur ne peut
-- plus être contourné en changeant d'instance.
-- Idempotent : réexécutable sans erreur dans l'éditeur SQL Supabase.

CREATE TABLE IF NOT EXISTS "RateLimitCounter" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("key")
);

-- Purge rapide des fenêtres expirées.
CREATE INDEX IF NOT EXISTS "RateLimitCounter_expiresAt_idx"
  ON "RateLimitCounter" ("expiresAt");
