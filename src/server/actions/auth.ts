"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { createSession, destroySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { loginSchema } from "@/lib/validators";

/**
 * Connexion par email (mode MVP, sans mot de passe).
 *
 * À remplacer par Auth.js (Google OAuth) ou un OTP SMS avant l'ouverture
 * publique : n'importe qui connaissant une adresse email pourrait entrer.
 * La signature de cette action ne changera pas.
 */
export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    next: formData.get("next"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Informations incomplètes";
    redirect(`/connexion?erreur=${encodeURIComponent(message)}`);
  }

  const { email, fullName, phone, next } = parsed.data;
  let userId: string;

  try {
    const user = await db.user.upsert({
      where: { email },
      update: { fullName, ...(phone ? { phone } : {}) },
      create: { email, fullName, phone: phone || null, role: "CLIENT" },
    });
    userId = user.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(
        `/connexion?erreur=${encodeURIComponent(
          "Ce numéro de téléphone est déjà rattaché à un autre compte.",
        )}`,
      );
    }
    throw error;
  }

  await createSession(userId);
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  redirect(target);
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}
