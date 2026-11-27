"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CAMPUSES, type Campus } from "@/lib/domain";
import { mobileMoneySchema, profileSchema } from "@/lib/validators";

function profileErrorUrl(message: string): string {
  return `/profil?erreur=${encodeURIComponent(message)}`;
}

/** Libellé lisible du champ fautif, pour un message d'erreur compréhensible. */
const PROFILE_FIELD_LABELS: Record<string, string> = {
  fullName: "Nom complet",
  email: "Email",
  phone: "Téléphone",
  shopName: "Nom de la boutique",
  campus: "Campus",
  mobileMoneyNumber: "Numéro Mobile Money",
  mobileMoneyProvider: "Opérateur Mobile Money",
};

/** Message précis (« Téléphone : ... ») au lieu du générique « Invalid input ». */
function firstProfileIssue(error: { issues: { path: (string | number | symbol)[]; message: string }[] }): string {
  const issue = error.issues[0];
  if (!issue) return "Formulaire incomplet.";
  const field = issue.path.find((part): part is string => typeof part === "string") ?? "";
  const label = PROFILE_FIELD_LABELS[field];
  return label ? `${label} : ${issue.message}` : issue.message;
}

/**
 * Enregistrement de la page /profil.
 *
 * Le rôle n'est jamais modifiable depuis le formulaire : seuls le nom, l'email,
 * le téléphone et, pour un vendeur, le nom de la boutique et le campus le sont.
 */
export async function updateProfileAction(formData: FormData) {
  const user = await requireUser("/profil");

  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    shopName: formData.get("shopName"),
    campus: formData.get("campus"),
    mobileMoneyNumber: formData.get("mobileMoneyNumber"),
    mobileMoneyProvider: formData.get("mobileMoneyProvider") || undefined,
  });

  if (!parsed.success) {
    redirect(profileErrorUrl(firstProfileIssue(parsed.error)));
  }

  const data = parsed.data;
  const campus = data.campus?.trim() ?? "";
  const shopName = data.shopName?.trim() ?? "";

  if (user.vendor) {
    if (!CAMPUSES.includes(campus as Campus)) {
      redirect(profileErrorUrl("Choisis ton campus : Site de Ouagadougou ou Site de Kamboinsé."));
    }
    if (shopName.length < 2) {
      redirect(profileErrorUrl("Indique le nom de ta boutique (2 caractères minimum)."));
    }
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          fullName: data.fullName,
          email: data.email,
          phone: data.phone || null,
          mobileMoneyNumber: data.mobileMoneyNumber || null,
          mobileMoneyProvider: data.mobileMoneyProvider || null,
        },
      });

      if (user.vendor) {
        await tx.vendorProfile.update({
          where: { id: user.vendor.id },
          data: {
            shopName,
            campus,
            // Le numéro de reversement du vendeur reste stocké sur la boutique
            // (utilisé sur la fiche produit) : on le garde synchronisé.
            momoNumber: data.mobileMoneyNumber || null,
            momoOperator: data.mobileMoneyProvider || null,
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(profileErrorUrl("Cet email ou ce numéro est déjà utilisé par un autre compte."));
    }

    console.error("Mise à jour du profil :", error);
    redirect(profileErrorUrl("Le profil n'a pas pu être enregistré. Réessaie dans un instant."));
  }

  revalidatePath("/profil");
  revalidatePath("/parametres");
  revalidatePath("/");
  revalidatePath("/espace-vendeur");
  redirect("/profil?ok=1");
}

/**
 * Mise à jour du seul bloc Mobile Money (page Paramètres).
 *
 * Les vendeurs voient leur numéro de reversement synchronisé sur la boutique.
 */
export async function updateMobileMoneyAction(formData: FormData) {
  const user = await requireUser("/parametres");

  const parsed = mobileMoneySchema.safeParse({
    mobileMoneyNumber: formData.get("mobileMoneyNumber"),
    mobileMoneyProvider: formData.get("mobileMoneyProvider") || undefined,
  });

  if (!parsed.success) {
    redirect(
      `/parametres?erreur=${encodeURIComponent(
        firstProfileIssue(parsed.error),
      )}#mobile-money`,
    );
  }

  const number = parsed.data.mobileMoneyNumber || null;
  const provider = parsed.data.mobileMoneyProvider || null;

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { mobileMoneyNumber: number, mobileMoneyProvider: provider },
    });

    if (user.vendor) {
      await tx.vendorProfile.update({
        where: { id: user.vendor.id },
        data: { momoNumber: number, momoOperator: provider },
      });
    }
  });

  revalidatePath("/profil");
  revalidatePath("/parametres");
  revalidatePath("/espace-vendeur");
  redirect("/parametres?ok=momo#mobile-money");
}
