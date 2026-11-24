import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { productReviewSchema } from "@/lib/validators";

const noStore = { "Cache-Control": "no-store" };

/**
 * Avis produit (étoiles 1 à 5) publiés depuis la fiche détail.
 *
 * L'acheteur doit être connecté et ne peut pas noter son propre produit. Un
 * avis par client et par produit (`@@unique([buyerId, productId])`) : un second
 * envoi met à jour la note et le commentaire au lieu d'en créer un autre.
 * `orderItemId` reste renseigné pour les avis issus d'un achat vérifié, et vaut
 * `null` pour un avis libre.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", message: "Connecte-toi pour noter ce produit." },
      { status: 401, headers: noStore },
    );
  }

  const product = await db.product.findUnique({
    where: { id },
    select: { id: true, slug: true, vendorId: true, vendor: { select: { userId: true } } },
  });

  if (!product) {
    return NextResponse.json(
      { ok: false, error: "not_found", message: "Produit introuvable." },
      { status: 404, headers: noStore },
    );
  }

  if (product.vendor.userId === user.id) {
    return NextResponse.json(
      { ok: false, error: "own_product", message: "Tu ne peux pas noter ton propre produit." },
      { status: 403, headers: noStore },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", message: "Requête invalide." },
      { status: 400, headers: noStore },
    );
  }

  const parsed = productReviewSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_review",
        message: parsed.error.issues[0]?.message ?? "Note invalide.",
      },
      { status: 400, headers: noStore },
    );
  }

  const rating = parsed.data.rating;
  const comment = parsed.data.comment || null;

  const review = await db.review.upsert({
    where: { buyerId_productId: { buyerId: user.id, productId: product.id } },
    create: {
      productId: product.id,
      buyerId: user.id,
      rating,
      comment,
      orderItemId: null,
    },
    update: { rating, comment, isVisible: true },
    select: { id: true, rating: true, comment: true, createdAt: true },
  });

  // Note globale de la boutique : recalculée à chaque avis pour que la fiche
  // vendeur reste cohérente avec les avis affichés.
  const ratings = await db.review.findMany({
    where: { product: { vendorId: product.vendorId }, isVisible: true },
    select: { rating: true },
  });

  await db.vendorProfile.update({
    where: { id: product.vendorId },
    data: {
      ratingCount: ratings.length,
      ratingAvg:
        ratings.length > 0
          ? ratings.reduce((sum, item) => sum + item.rating, 0) / ratings.length
          : 0,
    },
  });

  revalidatePath(`/p/${product.slug}`);
  revalidatePath("/");

  return NextResponse.json(
    {
      ok: true,
      review: { ...review, createdAt: review.createdAt.toISOString() },
      rating: {
        count: ratings.length,
        average:
          ratings.length > 0
            ? ratings.reduce((sum, item) => sum + item.rating, 0) / ratings.length
            : 0,
      },
    },
    { headers: noStore },
  );
}

/** Liste publique des avis visibles (utilisée par la fiche produit). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const reviews = await db.review.findMany({
    where: { productId: id, isVisible: true },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      rating: true,
      comment: true,
      createdAt: true,
      orderItemId: true,
      buyer: { select: { fullName: true } },
    },
  });

  const count = reviews.length;
  const average = count > 0 ? reviews.reduce((sum, item) => sum + item.rating, 0) / count : 0;

  return NextResponse.json(
    {
      ok: true,
      rating: { average, count },
      reviews: reviews.map((review) => ({
        ...review,
        createdAt: review.createdAt.toISOString(),
      })),
    },
    { headers: noStore },
  );
}
