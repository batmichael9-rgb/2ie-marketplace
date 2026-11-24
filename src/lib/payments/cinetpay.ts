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
 * Intégration CinetPay API v1 (https://api.cinetpay.net).
 *
 * Authentification : POST /v1/oauth/login avec api_key + api_password renvoie
 * un access_token, passé ensuite en `Authorization: Bearer <token>`.
 *
 * Endpoints utilisés :
 *  - POST /v1/payment                  initialisation du paiement web ;
 *  - GET  /v1/payment/{identifier}     statut canonique (merchant_transaction_id,
 *                                      transaction_id ou payment_token).
 *
 * Règle de sécurité inchangée : le webhook n'est qu'un signal. Le statut vient
 * toujours de la réinterrogation de l'API, jamais du corps de la notification.
 */
const DEFAULT_API_URL = "https://api.cinetpay.net";

function apiUrl(): string {
  return (process.env.CINETPAY_API_URL ?? DEFAULT_API_URL).replace(/\/$/, "");
}

function config() {
  return {
    apiKey: process.env.CINETPAY_API_KEY ?? "",
    apiPassword: process.env.CINETPAY_API_PASSWORD ?? "",
  };
}

/** Découpe un nom complet en prénom / nom attendus par l'API v1. */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "Client";
  const last = parts.slice(1).join(" ") || first;

  const ensureLength = (value: string) =>
    value.length >= 2 ? value : `${value}X`.slice(0, 255);

  return {
    firstName: ensureLength(first).slice(0, 80),
    lastName: ensureLength(last).slice(0, 80),
  };
}

/** Normalise un numéro burkinabè au format international +226XXXXXXXX. */
function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("226")) return `+${digits}`;
  if (digits.length === 8) return `+226${digits}`;
  return digits ? `+${digits}` : "";
}

/**
 * Lit un corps de webhook CinetPay : JSON en v1, formulaire encodé accepté par
 * tolérance. Renvoie null si le corps n'est pas exploitable.
 */
export function parseCinetpayWebhookBody(rawBody: string): Record<string, unknown> | null {
  try {
    const json = JSON.parse(rawBody);
    if (json && typeof json === "object") {
      const record = json as Record<string, unknown>;
      // Certaines notifications encapsulent le contenu dans `data`.
      if (record.data && typeof record.data === "object" && !Array.isArray(record.data)) {
        return { ...(record.data as Record<string, unknown>), ...record };
      }
      return record;
    }
  } catch {
    // Pas du JSON : on tente le formulaire encodé.
  }

  try {
    const params = new URLSearchParams(rawBody);
    const entries = Object.fromEntries(params.entries());
    return Object.keys(entries).length > 0 ? entries : null;
  } catch {
    return null;
  }
}

const STATUS_MAP: Record<string, NormalizedPaymentStatus> = {
  SUCCESS: "SUCCEEDED",
  ACCEPTED: "SUCCEEDED",
  PAID: "SUCCEEDED",
  FAILED: "FAILED",
  REFUSED: "FAILED",
  EXPIRED: "EXPIRED",
  CANCELED: "EXPIRED",
  CANCELLED: "EXPIRED",
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

type JsonResult = { ok: boolean; json: any };

async function requestJson(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; token?: string },
): Promise<JsonResult> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.token) headers.Authorization = `Bearer ${init.token}`;

  const response = await fetch(`${apiUrl()}${path}`, {
    method: init.method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: response.ok, json } as JsonResult;
}

type TokenResult = { token: string | null; error?: string; raw?: unknown };

/** OAuth v1 : un Bearer token est obtenu avant chaque appel API. */
async function getAccessToken(): Promise<TokenResult> {
  const { apiKey, apiPassword } = config();

  if (!apiKey || !apiPassword) {
    return { token: null, error: "CinetPay n'est pas configuré." };
  }

  try {
    const { ok, json } = await requestJson("/v1/oauth/login", {
      method: "POST",
      body: { api_key: apiKey, api_password: apiPassword },
    });

    const token = json?.access_token ?? json?.data?.access_token ?? json?.token ?? null;
    if (!ok || !token) {
      return {
        token: null,
        error: json?.message ?? json?.error ?? "Authentification CinetPay refusée.",
        raw: json,
      };
    }

    return { token: String(token), raw: json };
  } catch (error) {
    return {
      token: null,
      error: "Impossible de joindre CinetPay.",
      raw: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}

export const cinetpayProvider: PaymentProvider = {
  id: "CINETPAY",
  label: "Paiement en ligne (Orange Money, Moov Money, Carte bancaire)",
  description:
    "Paiement sécurisé via CinetPay : Orange Money, Moov Money ou carte bancaire, au choix sur le guichet CinetPay. Tu recevras une demande de confirmation sur ton téléphone.",
  supportsRedirect: true,

  isEnabled() {
    const { apiKey, apiPassword } = config();
    return Boolean(apiKey && apiPassword);
  },

  async createIntent(input: CreateIntentInput): Promise<CreateIntentResult> {
    const auth = await getAccessToken();
    if (!auth.token) {
      return {
        status: "FAILED",
        message: "Le paiement en ligne est momentanément indisponible. Ta commande n'a pas été débitée.",
        raw: auth.raw ?? { error: auth.error },
      };
    }

    const { firstName, lastName } = splitName(input.buyer.name);

    try {
      const { ok, json } = await requestJson("/v1/payment", {
        method: "POST",
        token: auth.token,
        body: {
          currency: "XOF",
          merchant_transaction_id: input.merchantRef,
          amount: input.amountXof,
          success_url: input.returnUrl,
          failed_url: `${input.returnUrl}?echec=1`,
          notify_url: input.notifyUrl,
          lang: "fr",
          designation: input.description.slice(0, 100),
          client_first_name: firstName,
          client_last_name: lastName,
          client_phone_number: normalizePhone(input.buyer.phone),
          client_email: input.buyer.email ?? "client@2iemarket.bf",
          // false : l'acheteur choisit Orange Money, Moov ou carte sur le
          // guichet CinetPay, sans imposer payment_method ni otp_code.
          direct_pay: false,
        },
      });

      const code = Number(json?.code);
      if (!ok || ![200, 201].includes(code) || !json?.payment_url) {
        return {
          status: "FAILED",
          message:
            json?.message ??
            "Le paiement n'a pas pu être initialisé. Réessaie dans un instant.",
          raw: json,
        };
      }

      return {
        status: "PENDING",
        checkoutUrl: String(json.payment_url),
        providerTxnId: json.transaction_id ? String(json.transaction_id) : null,
        notifyToken: json.notify_token ? String(json.notify_token) : null,
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
    const auth = await getAccessToken();
    if (!auth.token) {
      return { status: "PENDING", raw: { error: auth.error } };
    }

    // Le statut peut être interrogé par merchant_transaction_id, transaction_id
    // ou payment_token : la référence marchande est toujours connue.
    const identifier = input.providerTxnId || input.merchantRef;

    try {
      const { ok, json } = await requestJson(
        `/v1/payment/${encodeURIComponent(identifier)}`,
        { method: "GET", token: auth.token },
      );

      if (!ok) {
        return { status: "PENDING", raw: json };
      }

      const amount = Number(json?.amount ?? json?.data?.amount);

      return {
        status: normalizeStatus(json?.status ?? json?.data?.status),
        providerTxnId: json?.transaction_id
          ? String(json.transaction_id)
          : (input.providerTxnId ?? null),
        amountXof: Number.isFinite(amount) && amount > 0 ? amount : null,
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
    const body = parseCinetpayWebhookBody(rawBody);
    if (!body) return null;

    const merchantRef =
      body.merchant_transaction_id ?? body.transaction_id ?? body.cpm_trans_id ?? null;
    if (!merchantRef) return null;

    return {
      merchantRef: String(merchantRef),
      providerEventId: String(
        body.transaction_id ?? body.notify_token ?? merchantRef,
      ),
      eventType: "payment.notification",
      notifyToken: body.notify_token ? String(body.notify_token) : null,
      raw: body,
    };
  },
};
