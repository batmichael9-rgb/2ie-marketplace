-- Affiche / bannière publicitaire de la boutique, utilisée sur la vitrine
-- publique et comme image d'aperçu lors du partage du lien.
-- Idempotent : réexécutable sans erreur dans l'éditeur SQL Supabase.

ALTER TABLE "VendorProfile"
  ADD COLUMN IF NOT EXISTS "bannerUrl" TEXT;
