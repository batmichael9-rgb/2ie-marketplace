"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { reviewSchema } from "@/lib/validators";

const REVIEWABLE_STATUSES = ["PAID", "VENDOR_CONFIRMED", "READY_FOR_PICKUP", "COMPLETED"];

export async function createReviewAction(formData: FormData) {
  const user = await requireUser();

  const parsed = reviewSchema.safeParse({
    orderItemId: formData.get("orderItemId"),
    rating: formData.get("rating"),
    comment: formData.get("comment"),
  });

  if (!parsed.success) redirect("/");

  // L'avis est rattaché à une ligne de commande précise : impossible de noter
  // un produit qu'on n'a pas acheté, ni de noter deux fois le même achat.
  const item = await db.orderItem.findFirst({
    where: {
      id: parsed.data.orderItemId,
      review: null,
      order: { buyerId: user.id, status: { in: REVIEWABLE_STATUSES } },
    },
    include: { product: { select: { id: true, slug: true, vendorId: true } } },
  });

  if (!item) redirect("/");

  try {
    await db.review.create({
      data: {
        productId: item.product.id,
        orderItemId: item.id,
        buyerId: user.id,
        rating: parsed.data.rating,
        comment: parsed.data.comment || null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(`/p/${item.product.slug}`);
    }
    throw error;
  }

  const ratings = await db.review.findMany({
    where: { product: { vendorId: item.product.vendorId }, isVisible: true },
    select: { rating: true },
  });

  await db.vendorProfile.update({
    where: { id: item.product.vendorId },
    data: {
      ratingCount: ratings.length,
      ratingAvg:
        ratings.length > 0
          ? ratings.reduce((sum, review) => sum + review.rating, 0) / ratings.length
          : 0,
    },
  });

  revalidatePath(`/p/${item.product.slug}`);
  revalidatePath("/");
  redirect(`/p/${item.product.slug}?avis=publie`);
}
