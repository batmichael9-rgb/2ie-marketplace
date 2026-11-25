import { cashProvider } from "./cash";
import { moneyfusionProvider } from "./moneyfusion";
import type { PaymentProvider, ProviderId } from "./types";

export const providers: Record<ProviderId, PaymentProvider> = {
  CASH: cashProvider,
  MONEYFUSION: moneyfusionProvider,
};

export function getProvider(id: string): PaymentProvider | null {
  return (providers as Record<string, PaymentProvider>)[id] ?? null;
}

/**
 * Fournisseurs proposés au client dans le tunnel de commande.
 * Le paiement en ligne est le seul mode proposé : l'acheteur choisit son
 * opérateur (Orange Money, Moov Money, Wave ou carte) sur la page de paiement.
 */
export function availableProviders(): PaymentProvider[] {
  return [moneyfusionProvider].filter((provider) => provider.isEnabled());
}

export type { PaymentProvider, ProviderId } from "./types";
