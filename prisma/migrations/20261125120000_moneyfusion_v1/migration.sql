-- Migration Money Fusion (Payin + Payout vendeur) — à exécuter dans l'éditeur
-- SQL Supabase ou via `npx prisma migrate deploy`. Toutes les instructions sont
-- idempotentes : le script peut être rejoué sans erreur.

-- ---------------------------------------------------------------------------
-- VendorProfile : comptes de réception des 95 % et mode de versement préféré
-- ---------------------------------------------------------------------------
ALTER TABLE "VendorProfile"
  ADD COLUMN IF NOT EXISTS "orangeMoneyNumber" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "moovMoneyNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "waveNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "bankCardOrAccount" TEXT,
  ADD COLUMN IF NOT EXISTS "preferredPayoutMethod" TEXT NOT NULL DEFAULT 'ORANGE_MONEY';

-- Reprise douce : l'ancien numéro Mobile Money devient le compte Orange Money
-- des vendeurs qui n'ont pas encore renseigné de numéro dédié.
UPDATE "VendorProfile"
SET "orangeMoneyNumber" = "momoNumber"
WHERE "orangeMoneyNumber" = ''
  AND "momoNumber" IS NOT NULL
  AND "momoNumber" <> '';

-- ---------------------------------------------------------------------------
-- Order : suivi des tokens Money Fusion (Payin puis Payout)
--   paymentToken / tokenPay : token renvoyé par l'initialisation du Payin
--   payoutToken             : token du virement vendeur (95 %)
--   payoutStatus            : PENDING | READY_FOR_PAYOUT | PROCESSING | PAID_OUT
-- ---------------------------------------------------------------------------
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "paymentToken" TEXT,
  ADD COLUMN IF NOT EXISTS "tokenPay" TEXT,
  ADD COLUMN IF NOT EXISTS "payoutToken" TEXT;

CREATE INDEX IF NOT EXISTS "Order_tokenPay_idx" ON "Order" ("tokenPay");
CREATE INDEX IF NOT EXISTS "Order_payoutToken_idx" ON "Order" ("payoutToken");

-- ---------------------------------------------------------------------------
-- Payment : libellé du fournisseur mis à jour (aucune donnée CinetPay à migrer
-- ici : les anciens enregistrements restent lisibles tels quels).
-- ---------------------------------------------------------------------------
ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "notifyToken" TEXT;
