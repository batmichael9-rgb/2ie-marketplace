import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Lien de partage court : /s/<code>
 *
 * Il est créé par le vendeur, partagé sur WhatsApp, et redirige directement vers
 * la fiche du produit. Le nombre d'ouvertures est compté pour mesurer l'efficacité
 * du partage.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const url = new URL(request.url);

  const link = await db.shareLink.findUnique({
    where: { code },
    select: { id: true, product: { select: { slug: true, isActive: true } } },
  });

  if (!link || !link.product.isActive) {
    return NextResponse.redirect(new URL("/", url));
  }

  await db.shareLink.update({
    where: { id: link.id },
    data: { opensCount: { increment: 1 } },
  });

  return NextResponse.redirect(new URL(`/p/${link.product.slug}?ref=${code}`, url));
}
