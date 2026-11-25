/**
 * Contrat commun à tous les fournisseurs de paiement.
 *
 * Ajouter un nouveau PSP (LigdiCash, FedaPay, Orange Money direct...) consiste
 * à écrire un objet qui implémente cette interface et à l'enregistrer dans
 * src/lib/payments/index.ts. Ni le schéma de base, ni le tunnel de commande,
 * ni la page de suivi ne changent.
 */

export type ProviderId = "CASH" | "MONEYFUSION";

export type NormalizedPaymentStatus =
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED"
  | "REFUNDED";

export interface CreateIntentInput {
  /** Référence marchande unique et déterministe, envoyée au PSP. */
  merchantRef: string;
  /** Clé d'idempotence générée côté client et conservée jusqu'à la fin du tunnel. */
  idempotencyKey: string;
  amountXof: number;
  description: string;
  orderReference: string;
  /** Identifiant interne de la commande (transmis au PSP pour le suivi). */
  orderId: string;
  /** Identifiant de l'acheteur (transmis au PSP pour le suivi). */
  userId: string;
  buyer: {
    name: string;
    phone: string;
    email?: string | null;
  };
  returnUrl: string;
  notifyUrl: string;
  metadata?: Record<string, string | number>;
}

export interface CreateIntentResult {
  status: NormalizedPaymentStatus;
  providerTxnId?: string | null;
  checkoutUrl?: string | null;
  notifyToken?: string | null;
  message?: string;
  raw: unknown;
}

export interface VerifyPaymentInput {
  merchantRef: string;
  providerTxnId?: string | null;
}

export interface VerifyPaymentResult {
  status: NormalizedPaymentStatus;
  providerTxnId?: string | null;
  amountXof?: number | null;
  raw: unknown;
}

export interface ParsedWebhook {
  /** Référence marchande ou token permettant de retrouver le paiement local. */
  merchantRef: string;
  /** Identifiant unique de l'événement côté PSP (anti-rejeu). */
  providerEventId: string;
  eventType?: string;
  /** Jeton à comparer avec celui stocké à l'initialisation, si le PSP en fournit un. */
  notifyToken?: string | null;
  raw: unknown;
}

export interface PaymentProvider {
  readonly id: ProviderId;
  readonly label: string;
  readonly description: string;
  /** true si le client doit être redirigé vers une page du PSP. */
  readonly supportsRedirect: boolean;
  /** Un PSP sans clés configurées n'apparaît pas dans le tunnel de commande. */
  isEnabled(): boolean;
  createIntent(input: CreateIntentInput): Promise<CreateIntentResult>;
  /** Interroge le PSP et renvoie le statut canonique (jamais celui du webhook). */
  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;
  /** Extrait les champs utiles d'une notification entrante. */
  parseWebhook(rawBody: string): ParsedWebhook | null;
}
