import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

const subscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

/**
 * Enregistre l'abonnement Push de l'appareil courant pour l'utilisateur connecté.
 *
 * L'endpoint est unique : se réabonner sur le même téléphone met simplement à
 * jour les clés (et le propriétaire, si l'appareil a changé de compte).
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = subscriptionSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_subscription" }, { status: 400 });
  }

  const { endpoint, keys } = parsed.data;

  // IDOR : un endpoint déjà rattaché à un autre compte n'est jamais réassigné,
  // même si quelqu'un connaît son URL. L'ancien propriétaire doit d'abord le
  // supprimer depuis son appareil.
  const existing = await db.pushSubscription.findUnique({
    where: { endpoint },
    select: { userId: true },
  });

  if (existing && existing.userId !== user.id) {
    return NextResponse.json(
      { error: "endpoint_already_registered" },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { p256dh: keys.p256dh, auth: keys.auth },
  });

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Supprime les abonnements Push de l'utilisateur connecté (par défaut tous ses
 * appareils). Utilisé par « Réinitialiser sur cet appareil » avant de recréer
 * un abonnement propre, pour purger les endpoints morts restés en base.
 */
export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Endpoint optionnel dans le corps : sans lui, on purge tout le compte.
  let endpoint: string | null = null;
  try {
    const payload = (await request.json()) as { endpoint?: unknown };
    if (typeof payload?.endpoint === "string" && payload.endpoint.length > 0) {
      endpoint = payload.endpoint;
    }
  } catch {
    // Corps vide (fetch sans body) : suppression de tous les abonnements.
  }

  const result = await db.pushSubscription.deleteMany({
    where: endpoint ? { userId: user.id, endpoint } : { userId: user.id },
  });

  return NextResponse.json(
    { ok: true, deleted: result.count },
    { headers: { "Cache-Control": "no-store" } },
  );
}
