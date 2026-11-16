import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";

const COOKIE_NAME = "2ie_market_session";
const SESSION_DAYS = 30;

/**
 * Session applicative minimale, volontairement sans dépendance externe.
 *
 * Le cookie est un JWT HS256 en httpOnly : le navigateur ne peut pas le lire,
 * et il est invalidé dès que AUTH_SECRET change (déconnexion globale).
 *
 * Évolution prévue en production : remplacer ce module par Auth.js (Google OAuth)
 * ou par un OTP SMS. Les appelants n'utilisent que createSession / getCurrentUser,
 * la bascule ne touche donc pas les pages ni les Server Actions.
 */
function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET doit contenir au moins 32 caractères en production.");
    }
    return new TextEncoder().encode("dev-only-insecure-secret-change-me-please-32-chars");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

export async function getCurrentUser() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub) return null;

    return await db.user.findUnique({
      where: { id: payload.sub },
      include: { vendor: true },
    });
  } catch {
    return null;
  }
}

export async function requireUser(nextPath?: string) {
  const user = await getCurrentUser();
  if (!user) {
    redirect(nextPath ? `/connexion?suivant=${encodeURIComponent(nextPath)}` : "/connexion");
  }
  return user;
}

export async function requireVendor(nextPath = "/espace-vendeur") {
  const user = await requireUser(nextPath);
  if (!user.vendor) redirect("/espace-vendeur/creer");
  return { user, vendor: user.vendor };
}
