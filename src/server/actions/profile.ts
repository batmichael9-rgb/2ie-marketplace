"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CAMPUSES, type Campus } from "@/lib/domain";
import { profileSchema } from "@/lib/validators";

function profileErrorUrl(message: string): string {
  return `/profil?erreur=${encodeURIComponent(message)}`;
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
  });

  if (!parsed.success) {
    redirect(profileErrorUrl(parsed.error.issues[0]?.message ?? "Formulaire incomplet"));
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
        },
      });

      if (user.vendor) {
        await tx.vendorProfile.update({
          where: { id: user.vendor.id },
          data: { shopName, campus },
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
  revalidatePath("/");
  revalidatePath("/espace-vendeur");
  redirect("/profil?ok=1");
}
