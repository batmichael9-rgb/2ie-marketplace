import { z } from "zod";
import {
  MOBILE_MONEY_PROVIDERS,
  PAYOUT_METHODS,
  VENDOR_EMAIL_DOMAIN,
  normalizeBfPhone,
} from "@/lib/domain";

/** Opérateur Mobile Money : ORANGE_MONEY | MOOV_MONEY | WAVE. */
const mobileMoneyProvider = z
  .enum(MOBILE_MONEY_PROVIDERS, { error: "Choisis un opérateur Mobile Money." })
  .optional()
  .or(z.literal(""));

const phone = z
  .string({ error: "Indique ton numéro de téléphone." })
  .trim()
  .min(8, "Numéro de téléphone trop court (8 chiffres minimum).")
  .max(20, "Numéro de téléphone trop long (20 caractères maximum).")
  .regex(/^[0-9+\s().-]+$/, "Numéro invalide : chiffres, espaces, +, - et parenthèses uniquement.");

/** Numéro burkinabè obligatoire, normalisé en +226XXXXXXXX. */
const requiredBfPhone = z.preprocess(
  (value) => normalizeBfPhone(value == null ? "" : String(value)),
  z
    .string()
    .regex(
      /^\+226\d{8}$/,
      "Numéro invalide : utilise le format Burkina Faso +226 XX XX XX XX.",
    ),
);

/** Numéro burkinabè facultatif : vide ou normalisé en +226XXXXXXXX. */
const optionalBfPhone = z.preprocess(
  (value) => {
    const raw = value == null ? "" : String(value).trim();
    if (raw === "") return "";
    // Un numéro invalide est conservé tel quel pour que la validation échoue
    // au lieu d'être silencieusement effacé.
    return normalizeBfPhone(raw) || raw;
  },
  z
    .string()
    .refine(
      (value) => value === "" || /^\+226\d{8}$/.test(value),
      "Numéro invalide : utilise le format Burkina Faso +226 XX XX XX XX.",
    ),
);

const payoutMethod = z.enum(PAYOUT_METHODS, {
  error: "Choisis un mode de versement préféré.",
});

const password = z
  .string({ error: "Indique ton mot de passe." })
  .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
  .regex(/[A-Z]/, "Le mot de passe doit contenir au moins une lettre majuscule.")
  .regex(/[a-z]/, "Le mot de passe doit contenir au moins une lettre minuscule.")
  .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre.");

/**
 * Champ texte facultatif.
 *
 * `FormData.get()` renvoie `null` (et non `undefined`) quand le champ n'est pas
 * présent dans le formulaire (ex. créneau de retrait d'un produit non
 * réservable). Un simple `.optional()` refuserait cette valeur : on normalise
 * `null`/`undefined` en chaîne vide avant de valider.
 */
const optionalText = (max: number) =>
  z.preprocess(
    (value) => (value == null ? "" : value),
    z
      .string({ error: "Texte invalide." })
      .trim()
      .max(max, `Texte trop long (${max} caractères maximum).`),
  );

/**
 * Email d'un commerçant : obligatoirement `prenom.nom@2ie-edu.org`.
 *
 * Utilisé côté serveur au moment d'ouvrir la boutique. Le domaine est comparé
 * exactement : `@2ie.bf` et `@etu.2ie-edu.org` sont refusés. Les clients ne
 * passent jamais par ce schéma et gardent n'importe quelle adresse.
 */
const vendorEmailPattern = /^[a-zàâäçéèêëîïôöùûüÿ-]+\.[a-zàâäçéèêëîïôöùûüÿ-]+@2ie-edu\.org$/i;

export const vendorEmailSchema = z
  .string({ error: "Indique ton adresse email." })
  .trim()
  .toLowerCase()
  .email("Adresse email invalide")
  .refine((email) => vendorEmailPattern.test(email), {
    message: `Pour vendre, l'email doit se terminer par @${VENDOR_EMAIL_DOMAIN} (format requis : prenom.nom@${VENDOR_EMAIL_DOMAIN}).`,
  });

export const emailSchema = z
  .string({ error: "Indique ton adresse email." })
  .trim()
  .toLowerCase()
  .email("Adresse email invalide");

export const otpCodeSchema = z
  .string({ error: "Indique le code reçu par email." })
  .trim()
  .regex(/^\d{6}$/, "Le code doit contenir exactement 6 chiffres.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Indique ton mot de passe"),
  next: z.string().optional(),
});

/**
 * Étape 2 de l'inscription : le code OTP a été envoyé, l'utilisateur choisit
 * son mot de passe et complète son profil.
 */
export const verifySignupSchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
  firstName: z.string().trim().min(2, "Indique ton prénom (2 caractères minimum).").max(40),
  lastName: z.string().trim().min(2, "Indique ton nom (2 caractères minimum).").max(40),
  password: password,
  phone: phone.optional().or(z.literal("")),
  next: z.string().optional(),
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
  password: password,
});

export const campusSchema = z.preprocess(
  (value) => (value == null ? "" : value),
  z.enum(["Site de Ouagadougou", "Site de Kamboinsé"], {
    error: "Choisis ton campus : Site de Ouagadougou ou Site de Kamboinsé.",
  }),
);

export const vendorProfileSchema = z.object({
  shopName: z.string().trim().min(2, "Nom de boutique trop court").max(60),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  roomNumber: z.string().trim().max(30).optional().or(z.literal("")),
  momoNumber: phone.optional().or(z.literal("")),
  momoOperator: mobileMoneyProvider,
  campus: campusSchema,
});

/** Formulaire « Mes comptes de versement » (réception des 95 % vendeur). */
export const payoutAccountsSchema = z.object({
  orangeMoneyNumber: requiredBfPhone,
  moovMoneyNumber: optionalBfPhone,
  waveNumber: optionalBfPhone,
  bankCardOrAccount: optionalText(80),
  preferredPayoutMethod: payoutMethod.default("ORANGE_MONEY"),
});

/** Formulaire de la page /profil : compte client, complété par la boutique si vendeur. */
export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Indique ton nom complet (2 caractères minimum).").max(80),
  email: emailSchema,
  phone: phone.optional().or(z.literal("")),
  shopName: z.string().trim().max(60).optional().or(z.literal("")),
  campus: z.string().optional().or(z.literal("")),
  mobileMoneyNumber: phone.optional().or(z.literal("")),
  mobileMoneyProvider: mobileMoneyProvider,
});

/** Bloc Mobile Money seul (page Paramètres, Mon profil, Espace vendeur). */
export const mobileMoneySchema = z.object({
  mobileMoneyNumber: phone.optional().or(z.literal("")),
  mobileMoneyProvider: mobileMoneyProvider,
});

export const productSchema = z.object({
  name: z.string().trim().min(2, "Nom du produit trop court").max(100),
  description: z.string().trim().min(10, "Décris le produit en quelques mots").max(2000),
  priceXof: z.coerce
    .number()
    .int("Le prix doit être un entier (le FCFA n'a pas de centimes)")
    .min(25, "Prix minimum : 25 FCFA")
    .max(10_000_000),
  categoryId: z.string().optional().or(z.literal("")),
  stockMode: z.enum(["TRACKED", "UNLIMITED", "OUT_OF_STOCK"]),
  stockQty: z.coerce.number().int().min(0).max(100_000).default(0),
  lowStockThreshold: z.coerce.number().int().min(0).max(1000).default(3),
  isReservable: z.boolean().default(false),
  pickupNote: optionalText(200),
  campus: campusSchema,
});

export const checkoutSchema = z.object({
  productId: z.string({ error: "Produit manquant : recharge la page." }).min(1, "Produit manquant : recharge la page."),
  quantity: z.coerce
    .number({ error: "Choisis une quantité." })
    .int("La quantité doit être un nombre entier.")
    .min(1, "Choisis au moins 1 article.")
    .max(50, "Maximum 50 articles par commande."),
  provider: z
    .string({ error: "Choisis un moyen de paiement." })
    .min(1, "Choisis un moyen de paiement."),
  operator: z
    .enum(["ORANGE_MONEY", "MOOV_MONEY", "WAVE", "CARD"], {
      error: "Choisis ton moyen de paiement : Orange Money, Moov Money, Wave ou carte bancaire.",
    })
    .default("ORANGE_MONEY"),
  buyerName: z
    .string({ error: "Indique ton nom complet." })
    .trim()
    .min(2, "Indique ton nom complet (2 caractères minimum).")
    .max(80, "Nom trop long (80 caractères maximum)."),
  buyerPhone: phone,
  buyerRoom: optionalText(30),
  pickupSlot: optionalText(60),
  note: optionalText(300),
  shareCode: optionalText(20),
  idempotencyKey: z
    .string({ error: "Clé d'idempotence manquante : recharge la page." })
    .trim()
    .min(16, "Clé d'idempotence manquante : recharge la page.")
    .max(80, "Clé d'idempotence invalide : recharge la page."),
});

export const messageSchema = z.object({
  conversationId: z.string().trim().min(1, "Conversation introuvable."),
  content: z
    .string({ error: "Écris un message avant d'envoyer." })
    .trim()
    .min(1, "Écris un message avant d'envoyer.")
    .max(2000, "Message trop long (2000 caractères maximum)."),
});

export const reviewSchema = z.object({
  orderItemId: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().or(z.literal("")),
});

/** Avis libre depuis la fiche produit : note 1 à 5 + commentaire facultatif. */
export const productReviewSchema = z.object({
  rating: z.coerce
    .number({ error: "Choisis une note de 1 à 5 étoiles." })
    .int()
    .min(1, "Choisis une note de 1 à 5 étoiles.")
    .max(5, "La note maximale est de 5 étoiles."),
  comment: z.string().trim().max(1000, "Commentaire trop long (1000 caractères maximum).").optional().or(z.literal("")),
});

export const deleteProductSchema = z.object({
  productId: z.string().min(1, "Produit manquant : recharge la page."),
});

export const stockUpdateSchema = z.object({
  productId: z.string().min(1),
  stockMode: z.enum(["TRACKED", "UNLIMITED", "OUT_OF_STOCK"]),
  stockQty: z.coerce.number().int().min(0).max(100_000),
});
