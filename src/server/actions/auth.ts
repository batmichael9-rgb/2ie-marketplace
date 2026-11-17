"use server";

import { Prisma } from "@prisma/client";
import { hash, compare } from "bcryptjs";
import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { loginSchema, registerSchema, vendorRegisterSchema } from "@/lib/validators";

export async function registerAction(formData: FormData) {
  const isVendor = formData.get("isVendor") === "true";
  const parsed = isVendor ? vendorRegisterSchema.safeParse({ email: formData.get("email"), fullName: formData.get("fullName"), password: formData.get("password"), phone: formData.get("phone"), shopName: formData.get("shopName"), next: formData.get("next") }) : registerSchema.safeParse({ email: formData.get("email"), fullName: formData.get("fullName"), password: formData.get("password"), phone: formData.get("phone"), next: formData.get("next") });
  if (!parsed.success) redirect(`/inscription?erreur=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Informations incomplètes")}&vendeur=${isVendor ? "1" : "0"}`);
  const { email, fullName, password, phone, next } = parsed.data;
  const shopName = isVendor && "shopName" in parsed.data ? parsed.data.shopName : undefined;
  if (await db.user.findUnique({ where: { email } })) redirect(`/inscription?erreur=${encodeURIComponent("Un compte existe déjà avec cet email.")}&vendeur=${isVendor ? "1" : "0"}`);
  try {
    const user = await db.user.create({ data: { email, fullName, password: await hash(password, 12), phone: phone || null, role: isVendor ? "VENDOR" : "CLIENT" } });
    if (isVendor && shopName) {
      const baseSlug = shopName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "").slice(0, 60) || "boutique";
      let finalSlug = baseSlug;
      for (let attempt = 0; attempt < 5; attempt++) { if (!(await db.vendorProfile.findUnique({ where: { slug: finalSlug }, select: { id: true } }))) break; finalSlug = `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`; }
      await db.vendorProfile.create({ data: { userId: user.id, shopName, slug: finalSlug } });
    }
    await createSession(user.id);
    redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") redirect(`/inscription?erreur=${encodeURIComponent("Cet email ou ce numéro est déjà utilisé.")}&vendeur=${isVendor ? "1" : "0"}`);
    throw error;
  }
}

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password"), next: formData.get("next") });
  if (!parsed.success) redirect(`/connexion?erreur=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Informations incomplètes")}`);
  const { email, password, next } = parsed.data;
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.password || !(await compare(password, user.password))) redirect(`/connexion?erreur=${encodeURIComponent("Email ou mot de passe incorrect. Ce compte doit peut-être être réinscrit.")}`);
  await createSession(user.id);
  redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logoutAction() { await destroySession(); redirect("/"); }
