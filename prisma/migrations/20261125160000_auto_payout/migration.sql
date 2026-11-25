-- Reversements 100 % automatiques : horodatage de livraison, message d'erreur
-- du virement et statut FAILED (relance de secours uniquement).
-- Idempotent : réexécutable sans erreur dans l'éditeur SQL Supabase.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "payoutError" TEXT;

-- Accélère la détection des commandes livrées depuis plus de 48 h.
CREATE INDEX IF NOT EXISTS "Order_payoutStatus_deliveredAt_idx"
  ON "Order" ("payoutStatus", "deliveredAt");

-- Le statut final du virement devient PAID (demande produit). Une seule
-- exécution est sans effet ensuite ; la clause WHERE rend l'opération sûre.
UPDATE "Order"
SET "payoutStatus" = 'PAID'
WHERE "payoutStatus" = 'PAID_OUT' AND "paymentStatus" = 'PAID';
