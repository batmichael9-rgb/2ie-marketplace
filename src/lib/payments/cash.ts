import type { PaymentProvider } from "./types";

/**
 * Paiement à la réception : espèces ou transfert Mobile Money directement au
 * vendeur, au moment de la remise.
 *
 * C'est le mode par défaut du MVP. Aucun frais de passerelle sur un plat à
 * 500 FCFA, et le vendeur est payé immédiatement. La contrepartie : le taux de
 * no-show sur les réservations, assumé et traité par la confirmation manuelle.
 */
export const cashProvider: PaymentProvider = {
  id: "CASH",
  label: "Paiement à la réception",
  description:
    "Espèces ou transfert direct au vendeur (Orange Money / Moov Money) au moment de la remise. Sans frais.",
  supportsRedirect: false,

  isEnabled() {
    return true;
  },

  async createIntent() {
    return {
      status: "PENDING",
      providerTxnId: null,
      checkoutUrl: null,
      message: "Commande enregistrée : le paiement se fait à la remise.",
      raw: { mode: "cash" },
    };
  },

  async verifyPayment() {
    // Le règlement est constaté par le vendeur, pas par un PSP.
    return { status: "PENDING", raw: { mode: "cash" } };
  },

  parseWebhook() {
    return null;
  },
};
