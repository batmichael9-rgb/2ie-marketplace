import { cashProvider } from "./cash";
import { cinetpayProvider } from "./cinetpay";
import type { PaymentProvider, ProviderId } from "./types";

export const providers: Record<ProviderId, PaymentProvider> = {
  CASH: cashProvider,
  CINETPAY: cinetpayProvider,
  // Emplacements réservés : il suffit d'implémenter PaymentProvider puis de
  // remplacer la valeur ci-dessous. Aucun autre fichier ne change.
  LIGDICASH: cinetpayProvider,
  FEDAPAY: cinetpayProvider,
};

export function getProvider(id: string): PaymentProvider | null {
  return (providers as Record<string, PaymentProvider>)[id] ?? null;
}

/** Fournisseurs proposés au client dans le tunnel de commande. */
export function availableProviders(): PaymentProvider[] {
  return [cashProvider, cinetpayProvider].filter((provider) => provider.isEnabled());
}

export type { PaymentProvider, ProviderId } from "./types";
