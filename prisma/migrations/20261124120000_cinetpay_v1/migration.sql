-- Migration CinetPay API v1 — à exécuter sur Supabase (SQL Editor) ou via
-- `npx prisma migrate deploy`. Toutes les instructions sont idempotentes afin
-- de pouvoir être rejouées sans erreur si la base a déjà été synchronisée.

-- ---------------------------------------------------------------------------
-- Payment : identifiants CinetPay v1 stockés à l'initialisation
--   providerTxnId : transaction_id renvoyé par CinetPay
--   notifyToken   : notify_token utilisé pour authentifier les webhooks
-- ---------------------------------------------------------------------------
ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "providerTxnId" TEXT,
  ADD COLUMN IF NOT EXISTS "notifyToken" TEXT;

-- providerTxnId est unique dans le schéma Prisma (@unique).
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_providerTxnId_key"
  ON "Payment" ("providerTxnId");

-- ---------------------------------------------------------------------------
-- Champs requis par le tunnel de paiement en ligne (commission 5 % / 95 %)
-- ---------------------------------------------------------------------------
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "grossAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "platformFee" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "vendorNetAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "payoutStatus" TEXT NOT NULL DEFAULT 'PENDING';

ALTER TABLE "VendorProfile"
  ADD COLUMN IF NOT EXISTS "acceptsCashPayment" BOOLEAN NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- Reprise des commandes en ligne déjà payées avant l'introduction des montants
-- détaillés (facultatif, sans effet sur les commandes déjà renseignées).
-- ---------------------------------------------------------------------------
UPDATE "Order" o
SET "grossAmount" = o."totalXof",
    "platformFee" = ROUND(o."totalXof" * 0.05),
    "vendorNetAmount" = o."totalXof" - ROUND(o."totalXof" * 0.05),
    "payoutStatus" = 'READY_FOR_PAYOUT'
WHERE o."grossAmount" = 0
  AND o."paymentStatus" = 'PAID'
  AND EXISTS (
    SELECT 1 FROM "Payment" p
    WHERE p."orderId" = o."id" AND p."provider" <> 'CASH'
  );
