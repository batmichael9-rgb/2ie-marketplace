"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, requireVendor } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateShareCode, slugify } from "@/lib/domain";
import { notifyUserSafely } from "@/lib/push";
import { restockOrder } from "@/lib/stock";
import { ImageUploadError, uploadProductImage, uploadShopBanner } from "@/lib/storage";
import {
  deleteProductSchema,
  payoutAccountsSchema,
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
    campus: formData.get("campus"),
    isOpen: formData.get("isOpen") === "on",
    orderCutoffTime: formData.get("orderCutoffTime"),
  });

  if (!parsed.success) {
    redirect("/espace-vendeur?erreur=boutique#boutique");
  }

  const data = parsed.data;

  // Affiche publicitaire : facultative, l'absence de fichier conserve l'actuelle.
  const bannerField = formData.get("banner");
  const banner = bannerField instanceof File && bannerField.size > 0 ? bannerField : null;
  let bannerUrl: string | null = null;
  if (banner) {
    try {
      bannerUrl = await uploadShopBanner(banner);
    } catch (error) {
      if (!(error instanceof ImageUploadError)) {
        console.error("Envoi de l'affiche boutique :", error);
      }
      redirect("/espace-vendeur?erreur=banniere#boutique");
    }
  }

  await db.vendorProfile.update({
    where: { id: vendor.id },
    data: {
      shopName: data.shopName,
      description: data.description || null,
      roomNumber: data.roomNumber || null,
      campus: data.campus,
      acceptsCashPayment: formData.get("acceptsCashPayment") === "on",
      isOpen: data.isOpen,
      orderCutoffTime: data.orderCutoffTime || null,
      ...(bannerUrl ? { bannerUrl } : {}),
    },
  });

  revalidatePath("/espace-vendeur");
  revalidatePath("/profil");
  revalidatePath("/parametres");
  revalidatePath("/");
  redirect("/espace-vendeur?boutique=maj#boutique");
}

/**
 * Comptes de réception de la part nette (reversements vendeur).
 *
 * Le numéro Orange Money est obligatoire et normalisé en +226XXXXXXXX ; il
 * conditionne la publication d'articles. Le mode préféré doit correspondre à un
 * compte renseigné.
 */
export async function updateVendorPayoutAccountsAction(formData: FormData) {
  const { vendor } = await requireVendor();

  const parsed = payoutAccountsSchema.safeParse({
    orangeMoneyNumber: formData.get("orangeMoneyNumber"),
    moovMoneyNumber: formData.get("moovMoneyNumber"),
    waveNumber: formData.get("waveNumber"),
    bankCardOrAccount: formData.get("bankCardOrAccount"),
    preferredPayoutMethod: formData.get("preferredPayoutMethod") || "ORANGE_MONEY",
  });

  if (!parsed.success) {
    redirect("/espace-vendeur?erreur=versement#versements");
  }

  const data = parsed.data;

  const selectedPayoutAccount =
    data.preferredPayoutMethod === "ORANGE_MONEY"
      ? data.orangeMoneyNumber
      : data.preferredPayoutMethod === "MOOV_MONEY"
        ? data.moovMoneyNumber
        : data.preferredPayoutMethod === "WAVE"
          ? data.waveNumber
          : data.bankCardOrAccount;

  if (!selectedPayoutAccount) {
    redirect("/espace-vendeur?erreur=versement-compte#versements");
  }

  await db.$transaction(async (tx) => {
    await tx.vendorProfile.update({
      where: { id: vendor.id },
      data: {
        orangeMoneyNumber: data.orangeMoneyNumber,
        moovMoneyNumber: data.moovMoneyNumber || null,
        waveNumber: data.waveNumber || null,
        bankCardOrAccount: data.bankCardOrAccount || null,
        preferredPayoutMethod: data.preferredPayoutMethod,
        // Champs historiques conservés : miroir du compte Orange Money choisi.
        momoNumber: data.orangeMoneyNumber,
        momoOperator: "ORANGE_MONEY",
      },
    });

    await tx.user.update({
      where: { id: vendor.userId },
      data: {
        mobileMoneyNumber: selectedPayoutAccount,
        mobileMoneyProvider:
          data.preferredPayoutMethod === "CARD" ? null : data.preferredPayoutMethod,
      },
    });
  });

  revalidatePath("/espace-vendeur");
  revalidatePath("/profil");
  revalidatePath("/parametres");
  revalidatePath("/");
  redirect("/espace-vendeur?versement=maj#versements");
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

  // « Enregistrer et ajouter un autre produit » : même formulaire, mais après
  // création on revient sur une fiche vierge en conservant les réglages.
  const saveAndNew = formData.get("intent") === "save-and-new";

  // Sans numéro Orange Money de réception, la part nette ne peut pas être
  // reversés : la publication d'articles reste bloquée.
  if (!vendor.orangeMoneyNumber) {
    redirect(
      productErrorUrl(
        "Renseigne d'abord ton numéro Orange Money dans « Mes comptes de versement » pour pouvoir publier un article.",
      ),
    );
  }

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
    campus: formData.get("campus"),
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

  // Photo réutilisée d'un plat précédent (ajout rapide d'un menu) : on
  // n'accepte qu'une URL publique de notre bucket Supabase.
  const existingImageUrl = String(formData.get("existingImageUrl") ?? "").trim();
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const reusableImageUrl =
    existingImageUrl &&
    supabaseUrl &&
    existingImageUrl.startsWith(`${supabaseUrl}/storage/v1/object/public/`)
      ? existingImageUrl
      : null;

  let imageUrl: string | null = reusableImageUrl;
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
    await db.$transaction([
      db.product.create({
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
      }),
      // Le campus est une information de la boutique : il est confirmé à chaque
      // publication de produit pour rester à jour côté client.
      db.vendorProfile.update({
        where: { id: vendor.id },
        data: { campus: data.campus },
      }),
    ]);
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

  if (saveAndNew) {
    // Nom, prix et description repartent à zéro ; catégorie, campus, stock,
    // retrait et photo restent ceux du plat qui vient d'être enregistré.
    const params = new URLSearchParams({
      nouveau: "1",
      categorie: data.categoryId || "",
      campus: data.campus,
      stockMode: data.stockMode,
      stockQty: String(data.stockMode === "TRACKED" ? data.stockQty : 0),
      lowStockThreshold: String(data.lowStockThreshold),
      isReservable: data.isReservable ? "1" : "",
      pickupNote: data.pickupNote || "",
      image: imageUrl ?? "",
    });
    redirect(`${NEW_PRODUCT_URL}?${params.toString()}`);
  }

  redirect("/espace-vendeur?produit=ajoute");
}

export async function updateProductAction(formData: FormData) {
  const user = await requireUser();
  const productId = String(formData.get("productId") ?? "");
  const editUrl = `/espace-vendeur/produits/${productId}/modifier`;

  if (!productId) redirect("/espace-vendeur?erreur=produit");

  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, vendorId: true },
  });

  // Sécurité côté serveur : seul le propriétaire du produit (ou un admin) peut
  // modifier la fiche, quel que soit le formulaire envoyé.
  const isOwner = Boolean(user.vendor && product && product.vendorId === user.vendor.id);
  if (!product || (!isOwner && user.role !== "ADMIN")) {
    redirect("/espace-vendeur?erreur=produit");
  }

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
    campus: formData.get("campus"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Formulaire incomplet";
    redirect(`${editUrl}?erreur=${encodeURIComponent(message)}`);
  }

  const data = parsed.data;
  const imageField = formData.get("image");
  const image = imageField instanceof File && imageField.size > 0 ? imageField : null;

  // Aucune nouvelle photo choisie : l'URL actuelle du produit est conservée.
  let imageUrl: string | null = null;
  if (image) {
    try {
      imageUrl = await uploadProductImage(image);
    } catch (error) {
      if (!(error instanceof ImageUploadError)) {
        console.error("Upload de la photo produit (modification) :", error);
      }
      redirect(
        `${editUrl}?erreur=${encodeURIComponent(
          error instanceof ImageUploadError
            ? error.message
            : "La photo n'a pas pu être envoyée. Vérifie ta connexion et réessaie.",
        )}`,
      );
    }
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: product.id },
        data: {
          name: data.name,
          description: data.description,
          priceXof: data.priceXof,
          categoryId: data.categoryId || null,
          stockMode: data.stockMode,
          stockQty: data.stockMode === "TRACKED" ? data.stockQty : 0,
          lowStockThreshold: data.lowStockThreshold,
          isReservable: data.isReservable,
          pickupNote: data.pickupNote || null,
          ...(imageUrl
            ? {
                images: {
                  deleteMany: {},
                  create: [{ url: imageUrl, position: 0 }],
                },
              }
            : {}),
        },
      });

      await tx.vendorProfile.update({
        where: { id: product.vendorId },
        data: { campus: data.campus },
      });
    });
  } catch (error) {
    console.error("Modification du produit :", error);
    redirect(
      `${editUrl}?erreur=${encodeURIComponent(
        "L'enregistrement a échoué. Vérifie les informations saisies et réessaie.",
      )}`,
    );
  }

  revalidatePath("/");
  revalidatePath("/espace-vendeur");
  redirect("/espace-vendeur?produit=maj#produits");
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

  // Sert à n'envoyer la notification Push au client que si le statut a
  // réellement changé (un second clic sur « Confirmer » ne renotifie pas).
  let changed = false;

  if (intent === "CONFIRM") {
    const guard = await db.order.updateMany({
      where: { id: order.id, status: { in: ["AWAITING_PAYMENT", "PAID"] } },
      data: { status: "VENDOR_CONFIRMED", confirmedAt: new Date() },
    });
    changed = guard.count > 0;
  }

  if (intent === "DELIVER") {
    // Une commande Mobile Money non confirmée par le PSP ne peut pas être
    // marquée livrée : on évite qu'un vendeur « encaisse » un paiement fantôme.
    if (!isCash && order.paymentStatus !== "PAID") {
      redirect("/espace-vendeur?erreur=paiement-non-confirme");
    }

    const now = new Date();

    await db.$transaction(async (tx) => {
      // Paiement en ligne : « Livrée » attend la confirmation de réception par
      // l'acheteur (ou l'auto-release 48 h). C'est cette confirmation qui
      // déclenche le reversement de la part nette, jamais le vendeur seul.
      // Paiement à la remise : la livraison vaut encaissement et clôture.
      const guard = await tx.order.updateMany({
        where: {
          id: order.id,
          status: { notIn: ["COMPLETED", "DELIVERED", "CANCELLED", "EXPIRED", "REFUNDED"] },
        },
        data: isCash
          ? {
              status: "COMPLETED",
              paymentStatus: "PAID",
              completedAt: now,
              deliveredAt: now,
            }
          : {
              status: "DELIVERED",
              deliveredAt: now,
            },
      });

      if (guard.count === 0) return;

      changed = true;

      if (isCash && payment && payment.status !== "SUCCEEDED") {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: "SUCCEEDED", confirmedAt: now },
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

      changed = true;

      if (payment && payment.status !== "SUCCEEDED") {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: "EXPIRED", lastError: "Annulée par le vendeur" },
        });
      }

      await restockOrder(tx, order.id);
    });
  }

  // Notification Push du client : il suit sa commande depuis son téléphone.
  if (changed) {
    const messages: Record<string, string> = {
      CONFIRM: "confirmée par le vendeur",
      DELIVER: isCash
        ? "livrée et clôturée"
        : "livrée : confirme la réception pour clôturer la commande",
      CANCEL: "annulée par le vendeur",
    };

    await notifyUserSafely(order.buyerId, {
      title: "📦 Ta commande a été mise à jour",
      body: `Commande ${order.reference} : ${messages[intent] ?? "statut modifié"}.`,
      url: "/mes-commandes",
      tag: `order-${order.id}`,
    });
  }

  revalidatePath("/espace-vendeur");
  revalidatePath("/");
  redirect("/espace-vendeur?commande=maj");
}
