import { ProxyAgent, fetch as undiciFetch } from "undici";
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
 * Client réseau Money Fusion (Payin acheteur + Payout vendeur).
 *
 * Tous les appels serveur passent par `FIXIE_URL` lorsque cette variable est
 * définie : Vercel sort alors par nos adresses IP fixes, préalablement
 * autorisées par Money Fusion. Aucune requête ne doit contourner ce proxy.
 *
 * Variables d'environnement :
 *   MONEYFUSION_API_URL      URL d'initialisation du Payin
 *   MONEYFUSION_PRIVATE_KEY  clé privée (Payout et authentification)
 *   FIXIE_URL                proxy HTTP sortant (facultatif en local)
 */
export const MONEYFUSION_BASE_URL = "https://pay.moneyfusion.net";

export function moneyFusionPayinUrl(): string {
  return (process.env.MONEYFUSION_API_URL ?? `${MONEYFUSION_BASE_URL}/api/v1/payin`).replace(
    /\/$/,
    "",
  );
}

function privateKey(): string {
  return process.env.MONEYFUSION_PRIVATE_KEY ?? "";
}

let cachedAgent: ProxyAgent | null = null;

/** Proxy IP fixe partagé par tous les appels sortants Money Fusion. */
function proxyDispatcher(): ProxyAgent | undefined {
  const fixieUrl = process.env.FIXIE_URL;
  if (!fixieUrl) return undefined;
  if (!cachedAgent) cachedAgent = new ProxyAgent(fixieUrl);
  return cachedAgent;
}

type MoneyFusionInit = {
  method: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
};

/**
 * Appel HTTP vers Money Fusion, obligatoirement via le proxy Fixie si défini.
 * Le corps JSON est sérialisé ici pour garder un seul point de passage.
 */
export async function moneyFusionFetch(url: string, init: MoneyFusionInit) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers ?? {}),
  };

  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (privateKey()) headers["moneyfusion-private-key"] = privateKey();

  return undiciFetch(url, {
    method: init.method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    dispatcher: proxyDispatcher(),
    cache: "no-store",
  } as Parameters<typeof undiciFetch>[1]);
}

async function readJson(response: { text(): Promise<string> }): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/** Normalise un numéro burkinabè au format international +226XXXXXXXX. */
function normalizePhone(raw: string | null | undefined): string {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("226")) digits = digits.slice(3);
  return /^\d{8}$/.test(digits) ? `+226${digits}` : digits;
}

const STATUS_MAP: Record<string, NormalizedPaymentStatus> = {
  PAID: "SUCCEEDED",
  SUCCESS: "SUCCEEDED",
  SUCCEEDED: "SUCCEEDED",
  COMPLETED: "SUCCEEDED",
  PENDING: "PENDING",
  WAITING: "PENDING",
  INITIATED: "PENDING",
  FAILURE: "FAILED",
  FAILED: "FAILED",
  ERROR: "FAILED",
  "NO PAID": "FAILED",
  EXPIRED: "EXPIRED",
  CANCELLED: "EXPIRED",
  CANCELED: "EXPIRED",
  REFUNDED: "REFUNDED",
};

function normalizeStatus(raw: unknown): NormalizedPaymentStatus {
  const key = String(raw ?? "").trim().toUpperCase();
  return STATUS_MAP[key] ?? "PENDING";
}

export interface MoneyFusionCheckoutInput {
  amountXof: number;
  description: string;
  orderId: string;
  userId: string;
  buyerName: string;
  buyerPhone: string;
  returnUrl: string;
  webhookUrl: string;
}

export interface MoneyFusionCheckoutResult {
  ok: boolean;
  token: string | null;
  url: string | null;
  message?: string;
  raw: unknown;
}

/**
 * Encaissement acheteur (Payin).
 *
 * Le prix est toujours relu en base avant l'appel : le client ne peut pas
 * imposer `totalPrice`. `personal_Info` permet de retrouver la commande au
 * webhook, `tokenPay` sert de clé d'idempotence.
 */
export async function createMoneyFusionCheckout(
  input: MoneyFusionCheckoutInput,
): Promise<MoneyFusionCheckoutResult> {
  if (!privateKey()) {
    return {
      ok: false,
      token: null,
      url: null,
      message: "Le paiement en ligne est momentanément indisponible.",
      raw: { error: "missing_private_key" },
    };
  }

  const body = {
    totalPrice: input.amountXof,
    article: [{ [input.description.slice(0, 100)]: input.amountXof }],
    numeroSend: normalizePhone(input.buyerPhone),
    nomclient: input.buyerName,
    personal_Info: [{ userId: input.userId, orderId: input.orderId }],
    return_url: input.returnUrl,
    webhook_url: input.webhookUrl,
  };

  try {
    const response = await moneyFusionFetch(moneyFusionPayinUrl(), {
      method: "POST",
      body,
    });
    const json = await readJson(response);

    const token =
      json?.tokenPay ?? json?.token ?? json?.data?.tokenPay ?? json?.data?.token ?? null;
    const url = json?.url ?? json?.data?.url ?? json?.payment_url ?? json?.data?.payment_url ?? null;

    if (!response.ok || !token || !url) {
      return {
        ok: false,
        token: token ? String(token) : null,
        url: url ? String(url) : null,
        message:
          json?.message ??
          json?.error ??
          "Le paiement n'a pas pu être initialisé. Réessaie dans un instant.",
        raw: json,
      };
    }

    return { ok: true, token: String(token), url: String(url), raw: json };
  } catch (error) {
    return {
      ok: false,
      token: null,
      url: null,
      message: "Le service de paiement est momentanément indisponible. Aucun débit n'a eu lieu.",
      raw: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}

export interface MoneyFusionStatus {
  status: NormalizedPaymentStatus;
  amountXof: number | null;
  raw: unknown;
}

/** Statut canonique d'un Payin, interrogé côté serveur (jamais le navigateur). */
export async function checkPaymentStatus(token: string): Promise<MoneyFusionStatus> {
  if (!token) return { status: "PENDING", amountXof: null, raw: { error: "missing_token" } };

  try {
    const response = await moneyFusionFetch(
      `${MONEYFUSION_BASE_URL}/paiementNotif/${encodeURIComponent(token)}`,
      { method: "GET" },
    );
    const json = await readJson(response);
    const rawStatus =
      json?.statut ??
      json?.status ??
      json?.data?.statut ??
      json?.data?.status ??
      json?.payment_status;
    const amount = Number(
      json?.montant ?? json?.amount ?? json?.totalPrice ?? json?.data?.montant ?? json?.data?.amount,
    );

    if (!response.ok) {
      return { status: "PENDING", amountXof: null, raw: json };
    }

    return {
      status: normalizeStatus(rawStatus),
      amountXof: Number.isFinite(amount) && amount > 0 ? amount : null,
      raw: json,
    };
  } catch (error) {
    return {
      status: "PENDING",
      amountXof: null,
      raw: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}

/** Lit un corps de webhook Money Fusion (JSON, éventuellement encapsulé). */
export function parseMoneyFusionWebhookBody(
  rawBody: string,
): Record<string, unknown> | null {
  try {
    const json = JSON.parse(rawBody);
    if (!json || typeof json !== "object" || Array.isArray(json)) return null;
    const record = json as Record<string, unknown>;
    if (record.data && typeof record.data === "object" && !Array.isArray(record.data)) {
      return { ...(record.data as Record<string, unknown>), ...record };
    }
    return record;
  } catch {
    return null;
  }
}

function webhookToken(body: Record<string, unknown>): string | null {
  const value =
    body.tokenPay ?? body.token_pay ?? body.token ?? body.payment_token ?? body.transaction_id;
  return value ? String(value) : null;
}

export const moneyfusionProvider: PaymentProvider = {
  id: "MONEYFUSION",
  label: "Paiement en ligne sécurisé",
  description:
    "Orange Money, Moov Money, Wave ou carte bancaire Visa / Mastercard. Tu recevras une demande de confirmation sur ton téléphone.",
  supportsRedirect: true,

  isEnabled() {
    return Boolean(privateKey());
  },

  async createIntent(input: CreateIntentInput): Promise<CreateIntentResult> {
    const checkout = await createMoneyFusionCheckout({
      amountXof: input.amountXof,
      description: input.description,
      orderId: input.orderId,
      userId: input.userId,
      buyerName: input.buyer.name,
      buyerPhone: input.buyer.phone,
      returnUrl: `${input.returnUrl}`,
      webhookUrl: input.notifyUrl,
    });

    if (!checkout.ok || !checkout.url) {
      return {
        status: "FAILED",
        message:
          checkout.message ??
          "Le paiement n'a pas pu être initialisé. Réessaie dans un instant.",
        raw: checkout.raw,
      };
    }

    return {
      status: "PENDING",
      checkoutUrl: checkout.url,
      providerTxnId: checkout.token,
      notifyToken: checkout.token,
      raw: checkout.raw,
    };
  },

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const token = input.providerTxnId || input.merchantRef;
    const status = await checkPaymentStatus(token);
    return {
      status: status.status,
      providerTxnId: input.providerTxnId ?? null,
      amountXof: status.amountXof,
      raw: status.raw,
    };
  },

  parseWebhook(rawBody: string): ParsedWebhook | null {
    const body = parseMoneyFusionWebhookBody(rawBody);
    if (!body) return null;

    const token = webhookToken(body);
    const personalInfo = Array.isArray(body.personal_Info) ? body.personal_Info[0] : null;
    const orderId =
      personalInfo && typeof personalInfo === "object"
        ? (personalInfo as Record<string, unknown>).orderId
        : null;

    if (!token && !orderId) return null;

    const event = body.event ? String(body.event) : null;
    const reference = String(token ?? orderId);

    return {
      merchantRef: reference,
      providerEventId: `${reference}:${event ?? body.statut ?? "notification"}`,
      eventType: event ?? "payin.notification",
      notifyToken: token,
      raw: body,
    };
  },
};
