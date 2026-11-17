import "server-only";

import { OTP_TTL_MINUTES, type OtpPurpose } from "@/lib/otp";

/**
 * Envoi des codes OTP par email.
 *
 * Deux fournisseurs sont supportés, sans SDK :
 *   - Resend (RESEND_API_KEY) : simple, mais l'envoi à des adresses
 *     arbitraires exige un domaine vérifié (le domaine de test ne permet
 *     d'écrire qu'au propriétaire du compte).
 *   - Brevo (BREVO_API_KEY) : l'offre gratuite autorise l'envoi à n'importe
 *     quelle adresse après vérification d'une simple adresse expéditrice.
 *
 * `EMAIL_FROM` définit l'expéditeur, au format `Nom <adresse@domaine>`.
 */
function formatPurpose(purpose: OtpPurpose): string {
  return purpose === "SIGNUP"
    ? "la vérification de ton adresse email"
    : "la réinitialisation de ton mot de passe";
}

function buildMessage(code: string, purpose: OtpPurpose) {
  const intro =
    purpose === "SIGNUP"
      ? "Bienvenue sur 2iE Market ! Voici ton code pour vérifier ton adresse email :"
      : "Tu as demandé à réinitialiser ton mot de passe 2iE Market. Voici ton code :";

  const text = [
    intro,
    "",
    code,
    "",
    `Ce code est valable ${OTP_TTL_MINUTES} minutes et ne peut être utilisé qu'une seule fois.`,
    "Si tu n'es pas à l'origine de cette demande, ignore cet email.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0f172a;">
    <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
      <div style="background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0d9488;">2iE Market</p>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${intro}</p>
        <p style="margin:0 0 20px;font-size:34px;font-weight:700;letter-spacing:.3em;color:#0f766e;text-align:center;">${code}</p>
        <p style="margin:0 0 12px;font-size:14px;line-height:1.6;">Ce code est valable <strong>${OTP_TTL_MINUTES} minutes</strong> et ne peut être utilisé qu'une seule fois.</p>
        <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">Si tu n'es pas à l'origine de cette demande, ignore cet email.</p>
      </div>
    </div>
  </body>
</html>`;

  return { html, text };
}

function parseSender(value: string): { email: string; name: string } {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    return { name: match[1] || "2iE Market", email: match[2].trim() };
  }
  return { name: "2iE Market", email: value.trim() };
}

export async function sendOtpEmail(
  email: string,
  code: string,
  purpose: OtpPurpose,
): Promise<void> {
  const subject =
    purpose === "SIGNUP"
      ? "2iE Market — ton code de vérification"
      : "2iE Market — réinitialisation de ton mot de passe";
  const { html, text } = buildMessage(code, purpose);
  const from = process.env.EMAIL_FROM?.trim() || "2iE Market <onboarding@resend.dev>";

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [email], subject, html, text }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("Resend :", response.status, await response.text());
      throw new Error("L'envoi de l'email de vérification a échoué.");
    }
    return;
  }

  const brevoKey = process.env.BREVO_API_KEY?.trim();
  if (brevoKey) {
    const sender = parseSender(from);
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoKey,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender,
        to: [{ email }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("Brevo :", response.status, await response.text());
      throw new Error("L'envoi de l'email de vérification a échoué.");
    }
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[dev] Aucun service email configuré. Code ${purpose} pour ${email} : ${code}`,
    );
    return;
  }

  throw new Error(
    "Aucun service email n'est configuré (RESEND_API_KEY ou BREVO_API_KEY).",
  );
}
