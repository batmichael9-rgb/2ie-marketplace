import { db } from "@/lib/db";
import { appUrl, payoutMethodLabel } from "@/lib/domain";
import { computeFeeBreakdown } from "@/lib/money";
import { MONEYFUSION_BASE_URL, moneyFusionFetch } from "./moneyfusion";

/**
 * Reversement vendeur (Payout) : part nette du montant payé en ligne
 * (100 - PLATFORM_FEE_PERCENT %).
 *
 * Le montant est recalculé à partir de la commande (jamais fourni par le
 * client), puis envoyé à Money Fusion. Le token du virement est conservé sur la
 * commande pour le suivi webhook et la vérification manuelle.
 *
 * Aucune étape du flux normal ne dépend d'un administrateur : le virement est
 * déclenché à la confirmation de réception (ou par l'auto-release 48 h).
 * `FAILED` + `payoutError` ne servent qu'au diagnostic et à la relance de
 * secours.
 */

const METHOD_KEYWORDS: Record<string, string[]> = {
  ORANGE_MONEY: ["orange"],
  MOOV_MONEY: ["moov"],
  WAVE: ["wave"],
  CARD: ["card", "visa", "mastercard", "bank", "rib"],
};

/** Champs qui portent directement l'identifiant attendu par /withdraw. */
const EXPLICIT_MODE_FIELDS = [
  "withdraw_mode",
  "withdrawmode",
  "withdraw-mode",
  "withdrawMode",
  "mode",
];

/** Statuts depuis lesquels un virement peut être (re)lancé. */
const CLAIMABLE_STATUSES = ["READY_FOR_PAYOUT", "FAILED"];

export interface VendorPayoutAccount {
  phone: string;
  method: string;
  label: string;
}

/** Compte de réception à utiliser selon le mode préféré du vendeur. */
export function vendorPayoutAccount(vendor: {
  orangeMoneyNumber?: string | null;
  moovMoneyNumber?: string | null;
  waveNumber?: string | null;
  bankCardOrAccount?: string | null;
  preferredPayoutMethod?: string | null;
  momoNumber?: string | null;
}): VendorPayoutAccount {
  const method = vendor.preferredPayoutMethod ?? "ORANGE_MONEY";

  const byMethod: Record<string, string | null | undefined> = {
    ORANGE_MONEY: vendor.orangeMoneyNumber || vendor.momoNumber,
    MOOV_MONEY: vendor.moovMoneyNumber,
    WAVE: vendor.waveNumber,
    CARD: vendor.bankCardOrAccount,
  };

  const phone =
    byMethod[method] ||
    vendor.orangeMoneyNumber ||
    vendor.momoNumber ||
    vendor.moovMoneyNumber ||
    vendor.waveNumber ||
    vendor.bankCardOrAccount ||
    "";

  return { phone, method, label: payoutMethodLabel(method) };
}

/**
 * Numéro attendu par Money Fusion pour `countryCode: "bf"` : 8 chiffres locaux,
 * sans espaces, tirets ni préfixe pays.
 *
 *   "+226 07 06 91 89" → "07069189"
 *   "00226 07 06 91 89" → "07069189"
 *   "07-06-91-89" → "07069189"
 */
export function normalizeBfPayoutPhone(raw: string | null | undefined): string {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("226")) digits = digits.slice(3);
  return /^\d{8}$/.test(digits) ? digits : "";
}

function decodeToken(json: any): string | null {
  const token =
    json?.tokenPay ?? json?.token ?? json?.data?.tokenPay ?? json?.data?.token ?? null;
  return token ? String(token) : null;
}

interface WithdrawMethodCandidate {
  record: Record<string, unknown>;
  /** Clé du parent quand l'API renvoie un dictionnaire mode → libellé. */
  hint: string;
}

function stringFields(record: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(record)
    .filter(([, value]) => typeof value === "string" || typeof value === "number")
    .map(([key, value]) => [key, String(value).trim()] as [string, string])
    .filter(([, value]) => value.length > 0);
}

function explicitMode(candidate: WithdrawMethodCandidate): string | null {
  const fields = stringFields(candidate.record);
  for (const name of EXPLICIT_MODE_FIELDS) {
    const match = fields.find(([key]) => key.toLowerCase() === name.toLowerCase());
    if (match) return match[1];
  }
  return null;
}

/**
 * Parcourt toute la réponse JSON, y compris les listes et dictionnaires
 * imbriqués, pour ne dépendre ni d'une clé d'enveloppe ni d'un libellé fixe.
 */
function collectMethodCandidates(
  value: unknown,
  depth = 0,
  hint = "",
  out: WithdrawMethodCandidate[] = [],
): WithdrawMethodCandidate[] {
  if (depth > 6 || value == null) return out;

  if (Array.isArray(value)) {
    for (const item of value) collectMethodCandidates(item, depth + 1, hint, out);
    return out;
  }

  if (typeof value !== "object") return out;

  const record = value as Record<string, unknown>;
  const entries = Object.entries(record);
  const primitiveEntries = entries.filter(
    ([, child]) => child == null || typeof child !== "object",
  );

  if (primitiveEntries.length > 0) {
    // Dictionnaire { "moov-bf": "Moov Money", "orange-bf": "Orange Money" }.
    const looksLikeMap = primitiveEntries.every(([key]) =>
      /orange|moov|wave|card|visa|mastercard|bank|rib|(^|[-_])bf($|[-_])/i.test(key),
    );
    if (looksLikeMap) {
      for (const [key, child] of primitiveEntries) {
        out.push({ record: { withdraw_mode: key, name: child }, hint: key });
      }
    }
  }

  const recognized = entries.some(([key]) =>
    /mode|code|slug|method|name|key|id|operator|provider|network/i.test(key),
  );
  // Un objet sans champ reconnu reste exploitable si son parent est une clé
  // d'opérateur (ex. { "orange": { "label": ... } }).
  const parentHint = hint && /orange|moov|wave|card|visa|mastercard|bank|bf/i.test(hint);
  if (recognized || (parentHint && primitiveEntries.length > 0)) {
    out.push({ record, hint });
  }

  for (const [key, child] of entries) {
    if (child && typeof child === "object") {
      collectMethodCandidates(child, depth + 1, key, out);
    }
  }

  return out;
}

function scoreModeValue(value: string, keywords: string[]): number {
  const lower = value.toLowerCase();
  const keyword = keywords.find((item) => lower.includes(item));
  if (!keyword) return 0;

  let score = 50;
  if (new RegExp(`(^|[^a-z])${keyword}($|[^a-z])`).test(lower)) score += 15;
  if (/(^|[-_\s])bf($|[-_\s])/.test(lower)) score += 10;
  if (lower.includes("-") || lower.includes("_")) score += 5;
  if (lower.includes("money")) score += 2;
  return score;
}

/**
 * Choisit l'identifiant de retrait correspondant au mode préféré du vendeur.
 * Les champs `withdraw_mode` sont prioritaires ; sinon tous les champs texte
 * retournés sont comparés (code, slug, method, name, id, operator, etc.).
 */
function resolveWithdrawMode(candidates: WithdrawMethodCandidate[], method: string): string | null {
  const keywords = METHOD_KEYWORDS[method] ?? METHOD_KEYWORDS.ORANGE_MONEY;
  let best: { value: string; score: number } | null = null;

  for (const candidate of candidates) {
    const explicit = explicitMode(candidate);
    if (explicit && scoreModeValue(explicit, keywords) > 0) {
      return explicit;
    }

    const values = [
      ...(candidate.hint ? [candidate.hint] : []),
      ...stringFields(candidate.record).map(([, value]) => value),
    ];
    for (const value of values) {
      const score = scoreModeValue(value, keywords);
      if (score > (best?.score ?? 0)) best = { value, score };
    }
  }

  return best?.value ?? null;
}

/** Conserve la cause technique exacte, lisible depuis le tableau de bord. */
function errorDetail(message: string, raw?: unknown): string {
  let detail = "";
  if (raw != null) {
    try {
      detail = typeof raw === "string" ? raw : JSON.stringify(raw);
    } catch {
      detail = String(raw);
    }
  }
  return detail && detail !== "{}" ? `${message} — ${detail}` : message;
}

/** Marque le virement en échec et expose le message pour diagnostic. */
async function failPayout(orderId: string, message: string, raw?: unknown): Promise<void> {
  const payoutError = errorDetail(message, raw);
  console.error(`Reversement vendeur ${orderId} :`, payoutError);
  await db.order
    .update({
      where: { id: orderId },
      data: { payoutStatus: "FAILED", payoutError },
    })
    .catch((error) => {
      console.error("Impossible d'enregistrer l'échec du reversement :", error);
    });
}

export interface PayoutResult {
  ok: boolean;
  token: string | null;
  message?: string;
  raw: unknown;
}

/**
 * Déclenche le virement de la part nette au vendeur pour une commande payée en
 * ligne. Idempotent et sûr en concurrence : la commande est réservée
 * (`PROCESSING`) atomiquement avant l'appel réseau, donc deux confirmations
 * simultanées ne peuvent pas envoyer deux virements.
 */
export async function triggerVendorPayout(orderId: string): Promise<PayoutResult> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      vendor: {
        select: {
          id: true,
          orangeMoneyNumber: true,
          moovMoneyNumber: true,
          waveNumber: true,
          bankCardOrAccount: true,
          preferredPayoutMethod: true,
          momoNumber: true,
        },
      },
    },
  });

  if (!order) {
    return { ok: false, token: null, message: "Commande introuvable.", raw: null };
  }

  if (order.payoutStatus === "PAID") {
    return { ok: true, token: order.payoutToken, message: "Commande déjà reversée.", raw: null };
  }

  if (order.payoutStatus === "PROCESSING") {
    return {
      ok: true,
      token: order.payoutToken,
      message: "Un reversement est déjà en cours pour cette commande.",
      raw: null,
    };
  }

  if (order.paymentStatus !== "PAID" || !CLAIMABLE_STATUSES.includes(order.payoutStatus)) {
    return {
      ok: false,
      token: null,
      message: "Cette commande n'est pas prête à être reversée.",
      raw: null,
    };
  }

  if (!process.env.MONEYFUSION_PRIVATE_KEY) {
    await failPayout(order.id, "Le service de reversement n'est pas configuré.", {
      error: "missing_private_key",
    });
    return {
      ok: false,
      token: null,
      message: "Le service de reversement n'est pas configuré.",
      raw: { error: "missing_private_key" },
    };
  }

  const account = vendorPayoutAccount(order.vendor);
  if (!account.phone) {
    await failPayout(order.id, `Aucun compte ${account.label} renseigné par le vendeur.`);
    return {
      ok: false,
      token: null,
      message: `Aucun compte ${account.label} renseigné par le vendeur.`,
      raw: null,
    };
  }

  // Money Fusion attend un numéro local à 8 chiffres pour le Burkina Faso.
  const payoutPhone =
    account.method === "CARD" ? account.phone.trim() : normalizeBfPayoutPhone(account.phone);
  if (!payoutPhone) {
    const message = `Numéro ${account.label} invalide : format Burkina Faso à 8 chiffres attendu.`;
    await failPayout(order.id, message, { phone: account.phone });
    return { ok: false, token: null, message, raw: { phone: account.phone } };
  }

  // Le net enregistré à la commande prime (taux historique) ; sinon on applique
  // le taux courant : 100 - PLATFORM_FEE_PERCENT %.
  const gross = order.grossAmount || order.totalXof;
  const amount = Math.floor(
    order.vendorNetAmount || computeFeeBreakdown(gross).vendorNetAmount,
  );

  if (amount <= 0) {
    await failPayout(order.id, "Montant net vendeur nul.");
    return { ok: false, token: null, message: "Montant net vendeur nul.", raw: null };
  }

  // Verrou atomique : un seul appelant peut passer de READY/FAILED à PROCESSING.
  const claim = await db.order.updateMany({
    where: { id: order.id, payoutStatus: { in: CLAIMABLE_STATUSES } },
    data: { payoutStatus: "PROCESSING", payoutError: null },
  });

  if (claim.count === 0) {
    const latest = await db.order.findUnique({
      where: { id: order.id },
      select: { payoutStatus: true, payoutToken: true },
    });
    if (latest?.payoutStatus === "PAID") {
      return { ok: true, token: latest.payoutToken, message: "Commande déjà reversée.", raw: null };
    }
    return {
      ok: true,
      token: latest?.payoutToken ?? null,
      message: "Un reversement est déjà en cours pour cette commande.",
      raw: null,
    };
  }

  // Méthodes de retrait disponibles au Burkina Faso ("bf") : elles changent
  // côté opérateur, d'où l'interrogation dynamique avant chaque virement.
  let methodsResponse: unknown = null;
  let methodsError: unknown = null;
  let candidates: WithdrawMethodCandidate[] = [];
  try {
    const response = await moneyFusionFetch(
      `${MONEYFUSION_BASE_URL}/api/v1/withdraw/methods?country=bf`,
      { method: "GET" },
    );
    methodsResponse = await response.json().catch(() => null);
    candidates = collectMethodCandidates(methodsResponse);

    if ((methodsResponse as any)?.statut === false) {
      console.error("Méthodes de retrait Money Fusion refusées :", methodsResponse);
    }
  } catch (error) {
    methodsError = error instanceof Error ? error.message : String(error);
    console.error("Méthodes de retrait Money Fusion :", error);
  }

  const withdrawMode = resolveWithdrawMode(candidates, account.method);

  if (!withdrawMode) {
    const message = `Aucun mode de retrait ${account.label} détecté pour le Burkina Faso.`;
    const diagnostic = {
      operator: account.method,
      withdraw_mode: null,
      phone: payoutPhone,
      amount,
      withdraw_methods_response: methodsResponse,
      withdraw_methods_error: methodsError,
    };
    await failPayout(order.id, message, diagnostic);
    return { ok: false, token: null, message, raw: diagnostic };
  }

  try {
    const response = await moneyFusionFetch(`${MONEYFUSION_BASE_URL}/api/v1/withdraw`, {
      method: "POST",
      body: {
        countryCode: "bf",
        phone: payoutPhone,
        amount,
        withdraw_mode: withdrawMode,
        webhook_url: `${appUrl()}/api/payouts/webhook`,
      },
    });
    const json: any = await response.json().catch(() => ({}));
    const token = decodeToken(json);

    if (!response.ok || json?.statut === false || !token) {
      const message =
        (json?.statut === false ? json?.message ?? json?.error : null) ??
        json?.message ??
        json?.error ??
        "Le reversement n'a pas pu être déclenché.";
      const diagnostic = {
        operator: account.method,
        withdraw_mode: withdrawMode,
        phone: payoutPhone,
        amount,
        withdraw_methods_response: methodsResponse,
        withdraw_methods_error: methodsError,
        withdraw_response: json,
      };
      await failPayout(order.id, String(message), diagnostic);
      return { ok: false, token: null, message: String(message), raw: diagnostic };
    }

    await db.order.update({
      where: { id: order.id },
      data: { payoutToken: token, payoutStatus: "PROCESSING", payoutError: null },
    });

    return { ok: true, token, raw: json };
  } catch (error) {
    const message = "Impossible de joindre le service de reversement.";
    const diagnostic = {
      operator: account.method,
      withdraw_mode: withdrawMode,
      phone: payoutPhone,
      amount,
      withdraw_methods_response: methodsResponse,
      error: error instanceof Error ? error.message : String(error),
    };
    await failPayout(order.id, message, diagnostic);
    return { ok: false, token: null, message, raw: diagnostic };
  }
}

export interface PayoutStatus {
  status: "PENDING" | "PAID" | "CANCELLED";
  raw: unknown;
}

/** Statut canonique d'un virement vendeur (jamais celui du seul webhook). */
export async function checkPayoutStatus(token: string): Promise<PayoutStatus> {
  if (!token) return { status: "PENDING", raw: { error: "missing_token" } };

  try {
    const response = await moneyFusionFetch(
      `${MONEYFUSION_BASE_URL}/api/v1/payout/check-status/${encodeURIComponent(token)}`,
      { method: "GET" },
    );
    const json: any = await response.json().catch(() => ({}));
    const raw = String(json?.statut ?? json?.status ?? json?.data?.statut ?? "").toLowerCase();

    if (["completed", "paid", "success", "succeeded"].includes(raw)) {
      return { status: "PAID", raw: json };
    }
    if (["cancelled", "canceled", "failed", "failure", "rejected"].includes(raw)) {
      return { status: "CANCELLED", raw: json };
    }
    return { status: "PENDING", raw: json };
  } catch (error) {
    return {
      status: "PENDING",
      raw: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}
