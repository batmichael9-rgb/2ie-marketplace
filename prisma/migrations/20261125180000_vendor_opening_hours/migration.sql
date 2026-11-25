-- Horaires et disponibilité de la boutique (restaurants et fast-foods).
-- Idempotent : réexécutable sans erreur dans l'éditeur SQL Supabase.

ALTER TABLE "VendorProfile"
  ADD COLUMN IF NOT EXISTS "isOpen" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "VendorProfile"
  ADD COLUMN IF NOT EXISTS "orderCutoffTime" TEXT;
