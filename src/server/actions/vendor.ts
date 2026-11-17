"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, requireVendor } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateShareCode, slugify } from "@/lib/domain";
import { restockOrder } from "@/lib/stock";
import { ImageUploadError, uploadProductImage } from "@/lib/storage";
import {
  deleteProductSchema,
  productSchema,
  stockUpdateSchema,
  vendorProfileSchema,
} from "@/lib/validators";

// ---------------------------------------------------------------------------
// Boutique
// ---------------------------------------------------------------------------

/**
 * Modification des informations de la boutique depuis le tableau de bord.
 *
 * Le slug reste volontairement inchangé : il sert d'identifiant public stable
 * (liens partagés, favoris) et changer un nom ne doit pas casser une URL.
 */
export async function updateVendorProfileAction(formData: FormData) {
  const { vendor } = await requireVendor();

  const parsed = vendorProfileSchema.safeParse({
    shopName: formData.get("shopName"),
    description: formData.get("description"),
    roomNumber: formData.get("roomNumber"),
    momoNumber: formData.get("momoNumber"),
    momoOperator: formData.get("momoOperator") || undefined,
  });

  if (!parsed.success) {
    redirect("/espace-vendeur?erreur=boutique#boutique");
  }

  const data = parsed.data;

  await db.vendorProfile.update({
    where: { id: vendor.id },
    data: {
      shopName: data.shopName,
      description: data.description || null,
      roomNumber: data.roomNumber || null,
      momoNumber: data.momoNumber || null,
      momoOperator: data.momoOperator ?? null,
    },
  });

  revalidatePath("/espace-vendeur");
  revalidatePath("/");
  redirect("/espace-vendeur?boutique=maj#boutique");
}

// ---------------------------------------------------------------------------
// Produits
// ---------------------------------------------------------------------------

const NEW_PRODUCT_URL = "/espace-vendeur/produits/nouveau";

function productErrorUrl(message: string): string {
  return `${NEW_PRODUCT_URL}?erreur=${encodeURIComponent(message)}`;
}

export async function createProductAction(formData: FormData) {
  const { vendor } = await requireVendor("/espace-vendeur/produits/nouveau");

  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    priceXof: formData.get("priceXof"),
    categoryId: formData.get("categoryId"),
    stockMode: formData.get("stockMode"),
    stockQty: formData.get("stockQty") ?? 0,
    lowStockThreshold: formData.get("lowStockThreshold") ?? 3,
    isReservable: formData.get("isReservable") === "on",
    pickupNote: formData.get("pickupNote"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Formulaire incomplet";
    redirect(`/espace-vendeur/produits/nouveau?erreur=${encodeURIComponent(message)}`);
  }

  const data = parsed.data;
  const base = slugify(data.name) || "produit";
  let slug = base;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const exists = await db.product.findUnique({ where: { slug }, select: { id: true } });
    if (!exists) break;
    slug = `${base}-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  const imageField = formData.get("image");
  const image = imageField instanceof File && imageField.size > 0 ? imageField : null;

  let imageUrl: string | null = null;
  if (image) {
    try {
      imageUrl = await uploadProductImage(image);
    } catch (error) {
      if (!(error instanceof ImageUploadError)) {
        console.error("Upload de la photo produit :", error);
      }
      redirect(
        productErrorUrl(
          error instanceof ImageUploadError
            ? error.message
            : "La photo n'a pas pu être envoyée. Vérifie ta connexion et réessaie.",
        ),
      );
    }
  }

  try {
    await db.product.create({
      data: {
        vendorId: vendor.id,
        categoryId: data.categoryId || null,
        name: data.name,
        slug,
        description: data.description,
        priceXof: data.priceXof,
        stockMode: data.stockMode,
        stockQty: data.stockMode === "TRACKED" ? data.stockQty : 0,
        lowStockThreshold: data.lowStockThreshold,
        isReservable: data.isReservable,
        pickupNote: data.pickupNote || null,
        images: imageUrl ? { create: [{ url: imageUrl, position: 0 }] } : undefined,
      },
    });
  } catch (error) {
    console.error("Création du produit :", error);
    redirect(
      productErrorUrl(
        "La publication du produit a échoué. Vérifie les informations saisies et réessaie.",
      ),
    );
  }

  revalidatePath("/");
  revalidatePath("/espace-vendeur");
  redirect("/espace-vendeur?produit=ajoute");
}

export async function updateStockAction(formData: FormData) {
  const { vendor } = await requireVendor();

  const parsed = stockUpdateSchema.safeParse({
    productId: formData.get("productId"),
    stockMode: formData.get("stockMode"),
    stockQty: formData.get("stockQty") ?? 0,
  });

  if (!parsed.success) redirect("/espace-vendeur?erreur=stock");

  const product = await db.product.findFirst({
    where: { id: parsed.data.productId, vendorId: vendor.id },
    select: { id: true, stockQty: true, stockMode: true },
  });

  if (!product) redirect("/espace-vendeur?erreur=produit");

  const nextQty = parsed.data.stockMode === "TRACKED" ? parsed.data.stockQty : 0;
  const delta = nextQty - product.stockQty;

  await db.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: product.id },
      data: { stockMode: parsed.data.stockMode, stockQty: nextQty },
    });

    if (delta !== 0 && product.stockMode === "TRACKED") {
      await tx.stockMovement.create({
        data: {
          productId: product.id,
          delta,
          reason: delta > 0 ? "RESTOCK" : "MANUAL_ADJUST",
        },
      });
    }
  });

  revalidatePath("/espace-vendeur");
  revalidatePath("/");
  redirect("/espace-vendeur?stock=maj");
}

export async function deleteProductAction(formData: FormData) {
  const { vendor } = await requireVendor();

  const parsed = deleteProductSchema.safeParse({ productId: formData.get("productId") });
  if (!parsed.success) redirect("/espace-vendeur?erreur=produit");

  const product = await db.product.findFirst({
    where: { id: parsed.data.productId, vendorId: vendor.id },
    select: { id: true, _count: { select: { orderItems: true } } },
  });

  if (!product) redirect("/espace-vendeur?erreur=produit");

  // Un produit déjà vendu ne peut pas être supprimé sans casser l'historique
  // des commandes : le vendeur le retire du catalogue en le passant en rupture.
  if (product._count.orderItems > 0) {
    redirect("/espace-vendeur?erreur=produit-commandes#produits");
  }

  // Images, liens de partage, avis et mouvements de stock sont supprimés en
  // cascade par la base (onDelete: Cascade sur les relations du produit).
  await db.product.delete({ where: { id: product.id } });

  revalidatePath("/");
  revalidatePath("/espace-vendeur");
  redirect("/espace-vendeur?produit=supprime#produits");
}

// ---------------------------------------------------------------------------
// Liens de partage
// ---------------------------------------------------------------------------

export async function createShareLinkAction(formData: FormData) {
  const { vendor } = await requireVendor();
  const productId = String(formData.get("productId") ?? "");

  const product = await db.product.findFirst({
    where: { id: productId, vendorId: vendor.id },
    select: { id: true },
  });

  if (!product) redirect("/espace-vendeur?erreur=produit");

  let code = generateShareCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const exists = await db.shareLink.findUnique({ where: { code }, select: { id: true } });
    if (!exists) break;
    code = generateShareCode();
  }

  await db.shareLink.create({
    data: { code, productId: product.id, vendorId: vendor.id },
  });

  revalidatePath("/espace-vendeur");
  redirect(`/espace-vendeur?partage=${code}#produits`);
}

// ---------------------------------------------------------------------------
// Commandes et réservations
// ---------------------------------------------------------------------------

export async function updateOrderAction(formData: FormData) {
  const { vendor } = await requireVendor();
  const orderId = String(formData.get("orderId") ?? "");
  const intent = String(formData.get("intent") ?? "");

  const order = await db.order.findFirst({
    where: { id: orderId, vendorId: vendor.id },
    include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  if (!order) redirect("/espace-vendeur?erreur=commande");

  const payment = order.payments[0];
  const isCash = !payment || payment.provider === "CASH";

  if (intent === "CONFIRM") {
    await db.order.updateMany({
      where: { id: order.id, status: { in: ["AWAITING_PAYMENT", "PAID"] } },
      data: { status: "VENDOR_CONFIRMED", confirmedAt: new Date() },
    });
  }

  if (intent === "DELIVER") {
    // Une commande Mobile Money non confirmée par le PSP ne peut pas être
    // marquée livrée : on évite qu'un vendeur « encaisse » un paiement fantôme.
    if (!isCash && order.paymentStatus !== "PAID") {
      redirect("/espace-vendeur?erreur=paiement-non-confirme");
    }

    await db.$transaction(async (tx) => {
      const guard = await tx.order.updateMany({
        where: { id: order.id, status: { notIn: ["COMPLETED", "CANCELLED", "EXPIRED"] } },
        data: {
          status: "COMPLETED",
          paymentStatus: "PAID",
          completedAt: new Date(),
        },
      });

      if (guard.count > 0 && payment && payment.status !== "SUCCEEDED") {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: "SUCCEEDED", confirmedAt: new Date() },
        });
      }
    });
  }

  if (intent === "CANCEL") {
    if (order.paymentStatus === "PAID" && !isCash) {
      redirect("/espace-vendeur?erreur=remboursement-requis");
    }

    await db.$transaction(async (tx) => {
      const guard = await tx.order.updateMany({
        where: { id: order.id, status: { notIn: ["COMPLETED", "CANCELLED"] } },
        data: { status: "CANCELLED", paymentStatus: "FAILED" },
      });

      if (guard.count === 0) return;

      if (payment && payment.status !== "SUCCEEDED") {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: "EXPIRED", lastError: "Annulée par le vendeur" },
        });
      }

      await restockOrder(tx, order.id);
    });
  }

  revalidatePath("/espace-vendeur");
  revalidatePath("/");
  redirect("/espace-vendeur?commande=maj");
}
