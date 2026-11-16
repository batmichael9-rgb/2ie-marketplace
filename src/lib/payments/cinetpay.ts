import type {
  CreateIntentInput,
  CreateIntentResult,
  NormalizedPaymentStatus,
  ParsedWebhook,
  PaymentProvider,
  VerifyPaymentInput,
  VerifyPaymentResult,
} from "./types";

/**
 * Intégration CinetPay (checkout hébergé, Orange Money / Moov Money Burkina).
 *
 * Point clé : on ne débloque jamais une commande à partir du contenu du webhook.
 * Le webhook sert uniquement de signal ; le statut canonique est obtenu en
 * réinterrogeant /v2/payment/check. Un webhook forgé ne peut donc rien valider.
 *
 * La documentation CinetPay a évolué plusieurs fois (v1 `cpm_*`, v2
 * `merchant_transaction_id`). Le parseur accepte les deux formes ; à valider en
 * sandbox avant la mise en production, avec le compte marchand réel.
 */
const DEFAULT_API_URL = "https://api-checkout.cinetpay.com/v2";

function apiUrl(): string {
  return (process.env.CINETPAY_API_URL ?? DEFAULT_API_URL).replace(/\/$/, "");
}

function config() {
  return {
    apikey: process.env.CINETPAY_API_KEY ?? "",
    siteId: process.env.CINETPAY_SITE_ID ?? "",
  };
}

const STATUS_MAP: Record<string, NormalizedPaymentStatus> = {
  ACCEPTED: "SUCCEEDED",
  SUCCESS: "SUCCEEDED",
  PAID: "SUCCEEDED",
  REFUSED: "FAILED",
  FAILED: "FAILED",
  CANCELED: "EXPIRED",
  CANCELLED: "EXPIRED",
  EXPIRED: "EXPIRED",
  REFUNDED: "REFUNDED",
  PENDING: "PENDING",
  INITIATED: "PENDING",
  WAITING_FOR_CUSTOMER: "PENDING",
  WAITING_FOR_PAYMENT: "PENDING",
};

function normalizeStatus(raw: unknown): NormalizedPaymentStatus {
  const key = String(raw ?? "").toUpperCase();
  return STATUS_MAP[key] ?? "PENDING";
}

async function postJson(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${apiUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: response.ok, json } as { ok: boolean; json: any };
}

export const cinetpayProvider: PaymentProvider = {
  id: "CINETPAY",
  label: "Orange Money / Moov Money",
  description:
    "Paiement Mobile Money sécurisé. Tu recevras une demande de confirmation sur ton téléphone.",
  supportsRedirect: true,

  isEnabled() {
    const { apikey, siteId } = config();
    return Boolean(apikey && siteId);
  },

  async createIntent(input: CreateIntentInput): Promise<CreateIntentResult> {
    const { apikey, siteId } = config();

    try {
      const { json } = await postJson("/payment", {
        apikey,
        site_id: siteId,
        // transaction_id fait office de référence marchande : rejouer la même
        // requête avec cette valeur ne crée pas de second paiement chez CinetPay.
        transaction_id: input.merchantRef,
        amount: input.amountXof,
        currency: "XOF",
        description: input.description.slice(0, 100),
        notify_url: input.notifyUrl,
        return_url: input.returnUrl,
        channels: "MOBILE_MONEY",
        lang: "fr",
        customer_name: input.buyer.name.slice(0, 60),
        customer_phone_number: input.buyer.phone,
        customer_email: input.buyer.email ?? "client@2ie.bf",
        metadata: JSON.stringify({ order: input.orderReference, ...input.metadata }),
      });

      const code = String(json?.code ?? "");
      if (code !== "201" || !json?.data?.payment_url) {
        return {
          status: "FAILED",
          message:
            json?.message ??
            "Le paiement Mobile Money n'a pas pu être initialisé. Réessaie dans un instant.",
          raw: json,
        };
      }

      return {
        status: "PENDING",
        checkoutUrl: json.data.payment_url as string,
        providerTxnId: json.data.payment_token ? String(json.data.payment_token) : null,
        notifyToken: json.data.payment_token ? String(json.data.payment_token) : null,
        raw: json,
      };
    } catch (error) {
      return {
        status: "FAILED",
        message: "Impossible de joindre CinetPay. Ta commande n'a pas été débitée.",
        raw: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const { apikey, siteId } = config();

    try {
      const { json } = await postJson("/payment/check", {
        apikey,
        site_id: siteId,
        transaction_id: input.merchantRef,
      });

      return {
        status: normalizeStatus(json?.data?.status),
        providerTxnId: json?.data?.operator_id ?? input.providerTxnId ?? null,
        amountXof: Number(json?.data?.amount ?? 0) || null,
        raw: json,
      };
    } catch (error) {
      return {
        status: "PENDING",
        raw: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },

  parseWebhook(rawBody: string): ParsedWebhook | null {
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (!body || typeof body !== "object") return null;

    const merchantRef =
      body.merchant_transaction_id ?? body.transaction_id ?? body.cpm_trans_id ?? null;
    if (!merchantRef) return null;

    return {
      merchantRef: String(merchantRef),
      providerEventId: String(body.transaction_id ?? body.cpm_trans_id ?? merchantRef),
      eventType: body.cpm_result ? `cpm_result:${body.cpm_result}` : "payment.notification",
      notifyToken: body.notify_token ? String(body.notify_token) : null,
      raw: body,
    };
  },
};
