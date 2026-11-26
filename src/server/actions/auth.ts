"use server";

import { Prisma } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { CAMPUSES, slugify, type Campus } from "@/lib/domain";
import { sendOtpEmail } from "@/lib/email";
import { OtpError, consumeOtp, issueOtp } from "@/lib/otp";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import {
  emailSchema,
  loginSchema,
  resetPasswordSchema,
  verifySignupSchema,
  vendorEmailSchema,
} from "@/lib/validators";

const SIGNUP_ERROR = "Informations incomplètes";

function safeNext(value: FormDataEntryValue | null): string | undefined {
  const next = typeof value === "string" ? value.trim() : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : undefined;
}

function signupUrl(params: {
  isVendor: boolean;
  etape?: "code";
  email?: string;
  next?: string;
  erreur?: string;
}): string {
  const query = new URLSearchParams();
  query.set("vendeur", params.isVendor ? "1" : "0");
  if (params.etape) query.set("etape", params.etape);
  if (params.email) query.set("email", params.email);
  if (params.next) query.set("suivant", params.next);
  if (params.erreur) query.set("erreur", params.erreur);
  return `/inscription?${query.toString()}`;
}

function resetUrl(params: {
  etape?: "code";
  email?: string;
  erreur?: string;
}): string {
  const query = new URLSearchParams();
  if (params.etape) query.set("etape", params.etape);
  if (params.email) query.set("email", params.email);
  if (params.erreur) query.set("erreur", params.erreur);
  const search = query.toString();
  return `/mot-de-passe-oublie${search ? `?${search}` : ""}`;
}

function emailErrorMessage(error: unknown): string {
  if (error instanceof OtpError) return error.message;
  console.error("Envoi du code OTP :", error);
  return "Impossible d'envoyer l'email de vérification pour le moment. Réessaie dans quelques minutes.";
}

/**
 * Anti-spam de l'envoi de codes : au plus 3 codes par adresse et 20 par IP sur
 * 10 minutes (le cooldown de 60 s par adresse reste appliqué par `issueOtp`).
 * Renvoie un message utilisateur si la limite est atteinte, sinon `null`.
 */
async function otpRateLimitError(scope: string, email: string): Promise<string | null> {
  const byEmail = rateLimit(`otp:${scope}:email:${email}`, 3, 10 * 60_000);
  if (!byEmail.ok) {
    return `Trop de demandes de code pour cette adresse. Patiente ${Math.ceil(
      byEmail.retryAfterSeconds / 60,
    )} minute(s) avant de réessayer.`;
  }

  const ip = await getClientIp();
  const byIp = rateLimit(`otp:${scope}:ip:${ip}`, 20, 10 * 60_000);
  if (!byIp.ok) {
    return `Trop de demandes de code depuis cette connexion. Patiente ${Math.ceil(
      byIp.retryAfterSeconds / 60,
    )} minute(s) avant de réessayer.`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Inscription en deux étapes : email -> code OTP -> mot de passe + profil
// ---------------------------------------------------------------------------

/**
 * Étape 1 : valide l'email (domaine institutionnel imposé aux vendeurs),
 * génère un code à 6 chiffres valable 10 minutes et l'envoie par email.
 */
export async function requestSignupCodeAction(formData: FormData) {
  const isVendor = formData.get("isVendor") === "true";
  const next = safeNext(formData.get("next"));
  const schema = isVendor ? vendorEmailSchema : emailSchema;
  const parsed = schema.safeParse(formData.get("email"));

  if (!parsed.success) {
    redirect(
      signupUrl({
        isVendor,
        next,
        erreur: parsed.error.issues[0]?.message ?? "Adresse email invalide.",
      }),
    );
  }

  const email = parsed.data;
  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    redirect(
      signupUrl({
        isVendor,
        next,
        erreur:
          "Un compte existe déjà avec cet email. Connecte-toi ou utilise « Mot de passe oublié ? ».",
      }),
    );
  }

  const limited = await otpRateLimitError("signup", email);
  if (limited) {
    redirect(signupUrl({ isVendor, next, erreur: limited }));
  }

  const code = await issueOtp(email, "SIGNUP").catch((error) => {
    redirect(signupUrl({ isVendor, next, erreur: emailErrorMessage(error) }));
  });

  await sendOtpEmail(email, code, "SIGNUP").catch((error) => {
    redirect(signupUrl({ isVendor, next, erreur: emailErrorMessage(error) }));
  });

  redirect(signupUrl({ isVendor, etape: "code", email, next }));
}

/**
 * Étape 2 : vérifie le code OTP, crée le compte (et la boutique pour un
 * vendeur) puis ouvre la session.
 */
export async function verifySignupCodeAction(formData: FormData) {
  const isVendor = formData.get("isVendor") === "true";
  const next = safeNext(formData.get("next"));
  const rawEmail = String(formData.get("email") ?? "").trim().toLowerCase();

  const parsed = verifySignupSchema.safeParse({
    email: formData.get("email"),
    code: formData.get("code"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    password: formData.get("password"),
    phone: formData.get("phone"),
    next: formData.get("next"),
  });

  if (!parsed.success) {
    redirect(
      signupUrl({
        isVendor,
        etape: "code",
        email: rawEmail,
        next,
        erreur: parsed.error.issues[0]?.message ?? SIGNUP_ERROR,
      }),
    );
  }

  const data = parsed.data;

  if (isVendor) {
    const emailCheck = vendorEmailSchema.safeParse(data.email);
    if (!emailCheck.success) {
      redirect(
        signupUrl({
          isVendor,
          etape: "code",
          email: data.email,
          next,
          erreur: emailCheck.error.issues[0]?.message ?? "Adresse email vendeur invalide.",
        }),
      );
    }
  }

  const shopName = String(formData.get("shopName") ?? "").trim();
  if (isVendor && shopName.length < 2) {
    redirect(
      signupUrl({
        isVendor,
        etape: "code",
        email: data.email,
        next,
        erreur: "Indique le nom de ta boutique (2 caractères minimum).",
      }),
    );
  }

  const campus = String(formData.get("campus") ?? "").trim();
  if (isVendor && !CAMPUSES.includes(campus as Campus)) {
    redirect(
      signupUrl({
        isVendor,
        etape: "code",
        email: data.email,
        next,
        erreur: "Indique ton campus : Site de Ouagadougou ou Site de Kamboinsé.",
      }),
    );
  }

  // Les frais de service doivent être acceptés explicitement avant l'ouverture
  // de la boutique.
  if (isVendor && formData.get("vendorCommissionAccepted") !== "on") {
    redirect(
      signupUrl({
        isVendor,
        etape: "code",
        email: data.email,
        next,
        erreur:
          "Coche la case d'acceptation des Frais de service & Mobile Money pour ouvrir ta boutique.",
      }),
    );
  }

  const existing = await db.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });
  if (existing) {
    redirect(
      signupUrl({
        isVendor,
        erreur: "Un compte existe déjà avec cet email. Connecte-toi.",
      }),
    );
  }

  const otp = await consumeOtp(data.email, "SIGNUP", data.code);
  if (!otp.ok) {
    redirect(
      signupUrl({
        isVendor,
        etape: "code",
        email: data.email,
        next,
        erreur: otp.message,
      }),
    );
  }

  const fullName = `${data.firstName} ${data.lastName}`.replace(/\s+/g, " ").trim();
  const hashedPassword = await hash(data.password, 12);

  let userId: string;

  try {
    userId = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          fullName,
          password: hashedPassword,
          phone: data.phone || null,
          role: isVendor ? "VENDOR" : "CLIENT",
        },
      });

      if (isVendor) {
        const base = slugify(shopName) || "boutique";
        let slug = base;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const taken = await tx.vendorProfile.findUnique({
            where: { slug },
            select: { id: true },
          });
          if (!taken) break;
          slug = `${base}-${Math.floor(1000 + Math.random() * 9000)}`;
        }

        await tx.vendorProfile.create({
          data: { userId: user.id, shopName, slug, campus: isVendor ? campus : null },
        });
      }

      return user.id;
    });
  } catch (error) {
    console.error("Création du compte :", error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      redirect(
        signupUrl({
          isVendor,
          etape: "code",
          email: data.email,
          next,
          erreur:
            "Cet email ou ce numéro est déjà utilisé. Demande un nouveau code si nécessaire.",
        }),
      );
    }

    redirect(
      signupUrl({
        isVendor,
        etape: "code",
        email: data.email,
        next,
        erreur: "La création du compte a échoué. Demande un nouveau code et réessaie.",
      }),
    );
  }

  await createSession(userId);
  redirect(next ?? (isVendor ? "/espace-vendeur" : "/"));
}

// ---------------------------------------------------------------------------
// Connexion / déconnexion
// ---------------------------------------------------------------------------

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? SIGNUP_ERROR;
    redirect(`/connexion?erreur=${encodeURIComponent(message)}`);
  }

  const { email, password, next } = parsed.data;

  const user = await db.user.findUnique({ where: { email } });

  if (!user || !user.password) {
    redirect(
      `/connexion?erreur=${encodeURIComponent(
        "Email ou mot de passe incorrect. Si tu n'as jamais défini de mot de passe, utilise « Mot de passe oublié ? ».",
      )}`,
    );
  }

  if (!(await compare(password, user.password))) {
    redirect(`/connexion?erreur=${encodeURIComponent("Email ou mot de passe incorrect.")}`);
  }

  await createSession(user.id);
  const target = safeNext(next ?? null) ?? "/";
  redirect(target);
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

// ---------------------------------------------------------------------------
// Mot de passe oublié
// ---------------------------------------------------------------------------

/**
 * Demande de réinitialisation : envoie un code si le compte existe, puis
 * affiche toujours l'étape 2 (pas d'énumération des comptes).
 */
export async function requestPasswordResetAction(formData: FormData) {
  const parsed = emailSchema.safeParse(formData.get("email"));

  if (!parsed.success) {
    redirect(
      resetUrl({
        erreur: parsed.error.issues[0]?.message ?? "Adresse email invalide.",
      }),
    );
  }

  const email = parsed.data;

  const limited = await otpRateLimitError("reset", email);
  if (limited) {
    redirect(resetUrl({ erreur: limited }));
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (user) {
    await issueOtp(email, "RESET")
      .then((code) => sendOtpEmail(email, code, "RESET"))
      .catch((error) => {
        redirect(resetUrl({ erreur: emailErrorMessage(error) }));
      });
  }

  redirect(resetUrl({ etape: "code", email }));
}

/**
 * Étape 2 : vérifie le code puis enregistre le nouveau mot de passe (bcrypt).
 * Fonctionne aussi pour les comptes historiques qui n'avaient pas de mot de
 * passe.
 */
export async function resetPasswordAction(formData: FormData) {
  const rawEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  const parsed = resetPasswordSchema.safeParse({
    email: formData.get("email"),
    code: formData.get("code"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect(
      resetUrl({
        etape: "code",
        email: rawEmail,
        erreur: parsed.error.issues[0]?.message ?? SIGNUP_ERROR,
      }),
    );
  }

  const { email, code, password } = parsed.data;

  const otp = await consumeOtp(email, "RESET", code);
  if (!otp.ok) {
    redirect(resetUrl({ etape: "code", email, erreur: otp.message }));
  }

  const hashedPassword = await hash(password, 12);
  const updated = await db.user.updateMany({
    where: { email },
    data: { password: hashedPassword },
  });

  if (updated.count === 0) {
    redirect(
      resetUrl({
        erreur: "Code invalide ou expiré. Demande un nouveau code.",
      }),
    );
  }

  redirect(
    `/connexion?message=${encodeURIComponent(
      "Mot de passe mis à jour. Connecte-toi avec ton nouveau mot de passe.",
    )}`,
  );
}
