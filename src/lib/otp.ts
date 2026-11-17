import "server-only";

import { randomInt } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { db } from "@/lib/db";

/** Durée de vie d'un code OTP. */
export const OTP_TTL_MINUTES = 10;

/** Nombre de saisies erronées autorisées avant de devoir redemander un code. */
const MAX_ATTEMPTS = 5;

/** Délai minimal entre deux demandes de code pour une même adresse. */
const RESEND_COOLDOWN_SECONDS = 60;

export type OtpPurpose = "SIGNUP" | "RESET";

/** Erreur dont le message peut être affiché à l'utilisateur. */
export class OtpError extends Error {}

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * Génère un code à 6 chiffres, stocke son hash bcrypt et invalide les codes
 * précédents pour la même adresse et le même usage.
 *
 * Le code en clair n'est jamais stocké : il n'existe que le temps de l'envoi
 * de l'email.
 */
export async function issueOtp(email: string, purpose: OtpPurpose): Promise<string> {
  const latest = await db.otpCode.findFirst({
    where: { email, purpose },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (
    latest &&
    Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000
  ) {
    throw new OtpError(
      "Patiente une minute avant de demander un nouveau code de vérification.",
    );
  }

  const code = generateCode();
  const codeHash = await hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await db.$transaction([
    db.otpCode.deleteMany({ where: { email, purpose } }),
    db.otpCode.create({ data: { email, purpose, codeHash, expiresAt } }),
  ]);

  return code;
}

/**
 * Vérifie un code OTP puis le marque comme consommé.
 *
 * Renvoie `ok: false` avec un message utilisateur en cas de code absent,
 * expiré, déjà utilisé, trop de tentatives ou incorrect.
 */
export async function consumeOtp(
  email: string,
  purpose: OtpPurpose,
  code: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const record = await db.otpCode.findFirst({
    where: { email, purpose },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    return {
      ok: false,
      message: "Aucun code actif pour cette adresse. Demande un nouveau code.",
    };
  }

  if (record.consumedAt) {
    return {
      ok: false,
      message: "Ce code a déjà été utilisé. Demande un nouveau code.",
    };
  }

  if (record.expiresAt.getTime() < Date.now()) {
    return { ok: false, message: "Ce code a expiré. Demande un nouveau code." };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    return {
      ok: false,
      message: "Trop de tentatives. Demande un nouveau code de vérification.",
    };
  }

  if (!(await compare(code, record.codeHash))) {
    await db.otpCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    return {
      ok: false,
      message: "Code incorrect. Vérifie les 6 chiffres reçus par email.",
    };
  }

  // `updateMany` conditionnel : deux requêtes simultanées ne peuvent pas
  // consommer le même code.
  const claimed = await db.otpCode.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  if (claimed.count === 0) {
    return {
      ok: false,
      message: "Ce code a déjà été utilisé. Demande un nouveau code.",
    };
  }

  return { ok: true };
}
