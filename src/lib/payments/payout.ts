import { db } from "@/lib/db";
import { appUrl, payoutMethodLabel } from "@/lib/domain";
import { MONEYFUSION_BASE_URL, moneyFusionFetch } from "./moneyfusion";

/**
 * Reversement vendeur (Payout) : 95 % nets du montant payé en ligne.
 *
 * Le montant est recalculé à partir de la commande (jamais fourni par le
 * client), puis envoyé à Money Fusion. Le token du virement est conservé sur la
 * commande pour le suivi webhook et la vérification manuelle.
 */

const FALLBACK_MODES: Record<string, string> = {
  ORANGE_MONEY: "orange-money-bf",
  MOOV_MONEY: "moov-bf",
  WAVE: "wave-bf",
  CARD: "card-bf",
};

const METHOD_KEYWORDS: Record<string, string[]> = {
  ORANGE_MONEY: ["orange"],
  MOOV_MONEY: ["moov"],
  WAVE: ["wave"],
  CARD: ["card", "visa", "mastercard", "bank", "rib"],
};

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

function decodeToken(json: any): string | null {
  const token =
    json?.tokenPay ?? json?.token ?? json?.data?.tokenPay ?? json?.data?.token ?? null;
  return token ? String(token) : null;
}

function extractMethods(json: any): Array<Record<string, unknown>> {
  const candidates = [
    json,
    json?.data,
    json?.methods,
    json?.data?.methods,
    json?.withdraw_methods,
    json?.data?.withdraw_methods,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(
        (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object",
      );
    }
  }
  return [];
}

/** Choisit l'identifiant de retrait correspondant au mode préféré du vendeur. */
function resolveWithdrawMode(methods: Array<Record<string, unknown>>, method: string): string {
  const keywords = METHOD_KEYWORDS[method] ?? METHOD_KEYWORDS.ORANGE_MONEY;
  const match = methods.find((candidate) => {
    const haystack = [
      candidate.code,
      candidate.slug,
      candidate.id,
      candidate.name,
      candidate.label,
      candidate.countryCode,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return keywords.some((keyword) => haystack.includes(keyword));
  });

  if (match) {
    const value = match.code ?? match.slug ?? match.id ?? match.name;
    if (value) return String(value);
  }

  return FALLBACK_MODES[method] ?? FALLBACK_MODES.ORANGE_MONEY;
}

export interface PayoutResult {
  ok: boolean;
  token: string | null;
  message?: string;
  raw: unknown;
}

/**
 * Déclenche le virement des 95 % nets au vendeur pour une commande payée en
 * ligne. Idempotent : une commande déjà reversée (ou en cours) n'est pas
 * renvoyée une seconde fois.
 */
export async function triggerVendorPayout(orderId: string): Promise<PayoutResult> {
  if (!process.env.MONEYFUSION_PRIVATE_KEY) {
    return {
      ok: false,
      token: null,
      message: "Le service de reversement n'est pas configuré.",
      raw: { error: "missing_private_key" },
    };
  }

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

  if (order.payoutStatus === "PAID_OUT") {
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

  if (order.paymentStatus !== "PAID" || order.payoutStatus !== "READY_FOR_PAYOUT") {
    return {
      ok: false,
      token: null,
      message: "Cette commande n'est pas prête à être reversée.",
      raw: null,
    };
  }

  const account = vendorPayoutAccount(order.vendor);
  if (!account.phone) {
    return {
      ok: false,
      token: null,
      message: `Aucun compte ${account.label} renseigné par le vendeur.`,
      raw: null,
    };
  }

  const amount = Math.floor(
    order.vendorNetAmount || Math.max(0, (order.grossAmount || order.totalXof) - order.platformFee),
  );

  if (amount <= 0) {
    return { ok: false, token: null, message: "Montant net vendeur nul.", raw: null };
  }

  // Méthodes de retrait disponibles au Burkina Faso ("bf") : elles changent
  // côté opérateur, d'où l'interrogation dynamique avant chaque virement.
  let methods: Array<Record<string, unknown>> = [];
  try {
    const response = await moneyFusionFetch(
      `${MONEYFUSION_BASE_URL}/api/v1/withdraw/methods?country=bf`,
      { method: "GET" },
    );
    const json = await response.json().catch(() => null);
    methods = extractMethods(json);
  } catch (error) {
    console.error("Méthodes de retrait Money Fusion :", error);
  }

  const withdrawMode = resolveWithdrawMode(methods, account.method);

  try {
    const response = await moneyFusionFetch(`${MONEYFUSION_BASE_URL}/api/v1/withdraw`, {
      method: "POST",
      body: {
        countryCode: "bf",
        phone: account.phone,
        amount,
        withdraw_mode: withdrawMode,
        webhook_url: `${appUrl()}/api/payouts/webhook`,
      },
    });
    const json: any = await response.json().catch(() => ({}));
    const token = decodeToken(json);

    if (!response.ok || !token) {
      return {
        ok: false,
        token: null,
        message: json?.message ?? json?.error ?? "Le reversement n'a pas pu être déclenché.",
        raw: json,
      };
    }

    await db.order.update({
      where: { id: order.id },
      data: { payoutToken: token, payoutStatus: "PROCESSING" },
    });

    return { ok: true, token, raw: json };
  } catch (error) {
    return {
      ok: false,
      token: null,
      message: "Impossible de joindre le service de reversement.",
      raw: { error: error instanceof Error ? error.message : String(error) },
    };
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
