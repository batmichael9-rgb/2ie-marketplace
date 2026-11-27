import { timingSafeEqual } from "node:crypto";

/**
 * Authentification des webhooks Money Fusion (Payin et Payout).
 *
 * Money Fusion n'appose pas de signature cryptographique : le secret partagé
 * `MONEYFUSION_WEBHOOK_SECRET` est la seule preuve que l'appel vient du PSP.
 *
 * Règles, identiques pour tous les endpoints :
 *  - en production, le secret est obligatoire : s'il est absent, la route
 *    refuse l'appel (503) au lieu de l'accepter silencieusement ;
 *  - le secret est comparé en temps constant, dans `x-webhook-secret` ou en
 *    `Authorization: Bearer ...` ;
 *  - en développement uniquement, l'absence de secret n'est pas bloquante,
 *    car la vérification serveur du statut reste la preuve de paiement.
 */
export type WebhookAuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

function safeEqual(candidate: string, secret: string): boolean {
  const left = Buffer.from(candidate, "utf8");
  const right = Buffer.from(secret, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyWebhookSecret(request: Request): WebhookAuthResult {
  const secret = process.env.MONEYFUSION_WEBHOOK_SECRET?.trim();

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "MONEYFUSION_WEBHOOK_SECRET manquant : webhook Money Fusion refusé en production.",
      );
      return { ok: false, status: 503, error: "webhook_not_configured" };
    }
    return { ok: true };
  }

  const header = request.headers.get("x-webhook-secret") ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

  if ((header && safeEqual(header, secret)) || (bearer && safeEqual(bearer, secret))) {
    return { ok: true };
  }

  return { ok: false, status: 401, error: "invalid_signature" };
}
