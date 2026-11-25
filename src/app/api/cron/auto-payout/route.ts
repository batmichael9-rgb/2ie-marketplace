import { NextResponse } from "next/server";
import { autoReleaseDeliveredOrders } from "@/lib/payments/auto-release";

/**
 * Cron quotidien Vercel : GET /api/cron/auto-payout
 *
 * Termine les commandes livrées depuis 48 h sans confirmation de l'acheteur et
 * déclenche les reversements de la part nette correspondants. Aucune authentification
 * administrateur : c'est le flux normal autonome.
 *
 * Si `CRON_SECRET` est défini, l'en-tête `Authorization: Bearer ...` envoyé par
 * Vercel Cron est exigé pour éviter qu'un tiers force des virements.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authorization = request.headers.get("authorization");
    if (authorization !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const result = await autoReleaseDeliveredOrders();

  return NextResponse.json(
    { ok: true, ...result },
    { headers: { "Cache-Control": "no-store" } },
  );
}
