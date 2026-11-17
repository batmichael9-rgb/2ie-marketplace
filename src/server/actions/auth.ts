"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { hash, compare } from "bcryptjs";
import { createSession, destroySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { loginSchema, registerSchema, vendorRegisterSchema } from "@/lib/validators";

/**
 * Inscription client ou vendeur
 */
export async function registerAction(formData: FormData) {
  const isVendor = formData.get("isVendor") === "true";
  
  const parsed = isVendor 
    ? vendorRegisterSchema.safeParse({
        email: formData.get("email"),
        fullName: formData.get("fullName"),
        password: formData.get("password"),
        phone: formData.get("phone"),
        shopName: formData.get("shopName"),
        next: formData.get("next"),
      })
    : registerSchema.safeParse({
        email: formData.get("email"),
        fullName: formData.get("fullName"),
        password: formData.get("password"),
        phone: formData.get("phone"),
        next: formData.get("next"),
      });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Informations incomplètes";
    redirect(`/inscription?erreur=${encodeURIComponent(message)}&vendeur=${isVendor ? "1" : "0"}`);
  }

  const { email, fullName, password, phone, next } = parsed.data;
  const shopName =
    isVendor && "shopName" in parsed.data ? String(parsed.data.shopName) : undefined;

  // Vérifier si l'utilisateur existe déjà
  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) {
    redirect(`/inscription?erreur=${encodeURIComponent("Un compte existe déjà avec cet email.")}&vendeur=${isVendor ? "1" : "0"}`);
  }

  let userId: string;

  try {
    const hashedPassword = await hash(password, 12);
    
    const user = await db.user.create({
      data: {
        email,
        fullName,
        password: hashedPassword,
        phone: phone || null,
        role: isVendor ? "VENDOR" : "CLIENT",
      },
    });
    
    userId = user.id;

    // Si vendeur, créer automatiquement le profil vendeur
    if (isVendor && shopName) {
      const slug = shopName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "")
        .slice(0, 60) || "boutique";

      let finalSlug = slug;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const exists = await db.vendorProfile.findUnique({ 
          where: { slug: finalSlug }, 
          select: { id: true } 
        });
        if (!exists) break;
        finalSlug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
      }

      await db.vendorProfile.create({
        data: {
          userId: user.id,
          shopName,
          slug: finalSlug,
        },
      });
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(
        `/inscription?erreur=${encodeURIComponent(
          "Cet email ou ce numéro est déjà utilisé.",
        )}&vendeur=${isVendor ? "1" : "0"}`,
      );
    }
    throw error;
  }

  await createSession(userId);
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  redirect(target);
}

/**
 * Connexion par email et mot de passe
 */
export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Informations incomplètes";
    redirect(`/connexion?erreur=${encodeURIComponent(message)}`);
  }

  const { email, password, next } = parsed.data;

  const user = await db.user.findUnique({ where: { email } });
  
  if (!user || !user.password) {
    redirect(
      `/connexion?erreur=${encodeURIComponent(
        "Email ou mot de passe incorrect. Ce compte doit peut-être être réinscrit.",
      )}`,
    );
  }

  const isValidPassword = await compare(password, user.password);
  
  if (!isValidPassword) {
    redirect(`/connexion?erreur=${encodeURIComponent("Email ou mot de passe incorrect.")}`);
  }

  await createSession(user.id);
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  redirect(target);
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}
