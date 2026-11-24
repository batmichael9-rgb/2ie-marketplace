import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProvider } from "@/lib/payments";
import { applyPaymentStatus } from "@/lib/payments/apply";

/**
 * Vérification du statut d'une commande côté client.
 *
 * Le statut renvoyé ne vient jamais du navigateur : on interroge le PSP, puis on
 * applique le résultat de façon idempotente. Appeler cette route dix fois n'a
 * donc aucun effet supplémentaire.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { reference } = await params;

  const order = await db.order.findUnique({
    where: { reference },
    include: {
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      vendor: { select: { id: true } },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // IDOR : seul l'acheteur, le vendeur de la commande ou un admin peut
  // consulter son statut de paiement, même en connaissant la référence.
  const isBuyer = order.buyerId === user.id;
  const isVendor = user.vendor?.id === order.vendor.id;
  if (!isBuyer && !isVendor && user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "forbidden" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const payment = order.payments[0];

  if (payment && (payment.status === "PENDING" || payment.status === "CREATED")) {
    const provider = getProvider(payment.provider);

    if (provider?.supportsRedirect) {
      const verified = await provider.verifyPayment({
        merchantRef: payment.merchantRef,
        providerTxnId: payment.providerTxnId,
      });

      if (verified.status !== "PENDING") {
        await applyPaymentStatus(payment.merchantRef, verified.status, {
          providerTxnId: verified.providerTxnId,
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
      payments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
    },
  });

  return NextResponse.json(
    {
      orderStatus: fresh?.status,
      paymentStatus: fresh?.payments[0]?.status ?? "CREATED",
      paid: fresh?.paymentStatus === "PAID",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
