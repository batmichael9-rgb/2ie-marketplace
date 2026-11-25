import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyPaymentStatus } from "@/lib/payments/apply";
import { checkPaymentStatus } from "@/lib/payments/moneyfusion";

/**
 * Statut d'un paiement en ligne — GET /api/payments/status
 *
 * Accepte `?token=` (token Payin) ou `?reference=` (référence de commande).
 * Le statut est toujours réinterrogé côté serveur : le navigateur ne peut pas
 * déclarer un paiement comme réussi. L'application reste idempotente.
 */
function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const reference = url.searchParams.get("reference");

  if (!token && !reference) {
    return json({ error: "missing_parameter" }, 400);
  }

  const order = token
    ? await db.order.findFirst({
        where: { tokenPay: token },
        include: {
          payments: { orderBy: { createdAt: "desc" }, take: 1 },
          vendor: { select: { id: true } },
        },
      })
    : await db.order.findUnique({
        where: { reference: reference as string },
        include: {
          payments: { orderBy: { createdAt: "desc" }, take: 1 },
          vendor: { select: { id: true } },
        },
      });

  if (!order) return json({ error: "not_found" }, 404);

  // IDOR : seul l'acheteur, le vendeur ou un administrateur peut consulter.
  const isBuyer = order.buyerId === user.id;
  const isVendor = user.vendor?.id === order.vendor.id;
  if (!isBuyer && !isVendor && user.role !== "ADMIN") {
    return json({ error: "forbidden" }, 403);
  }

  const payment = order.payments[0];

  if (payment && (payment.status === "PENDING" || payment.status === "CREATED")) {
    const paymentToken = token ?? payment.providerTxnId ?? order.tokenPay;
    if (paymentToken) {
      const verified = await checkPaymentStatus(paymentToken);
      if (verified.status !== "PENDING") {
        await applyPaymentStatus(payment.merchantRef, verified.status, {
          providerTxnId: paymentToken,
          raw: verified.raw,
        });
      }
    }
  }

  const fresh = await db.order.findUnique({
    where: { id: order.id },
    select: {
      status: true,
      paymentStatus: true,
      payoutStatus: true,
      payments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
    },
  });

  return json({
    orderStatus: fresh?.status,
    paymentStatus: fresh?.payments[0]?.status ?? "CREATED",
    payoutStatus: fresh?.payoutStatus,
    paid: fresh?.paymentStatus === "PAID",
  });
}
