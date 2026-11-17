import { z } from "zod";
import { VENDOR_EMAIL_DOMAIN } from "@/lib/domain";

const phone = z
  .string({ error: "Indique ton numéro de téléphone." })
  .trim()
  .min(8, "Numéro de téléphone trop court (8 chiffres minimum).")
  .max(20, "Numéro de téléphone trop long (20 caractères maximum).")
  .regex(/^[0-9+\s().-]+$/, "Numéro invalide : chiffres, espaces, +, - et parenthèses uniquement.");

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
export const vendorEmailSchema = z
  .string({ error: "Indique ton adresse email." })
  .trim()
  .toLowerCase()
  .email("Adresse email invalide")
  .refine((email) => email.split("@")[1] === VENDOR_EMAIL_DOMAIN, {
    message: `Pour vendre, l'email doit se terminer par @${VENDOR_EMAIL_DOMAIN} (format requis : prenom.nom@${VENDOR_EMAIL_DOMAIN}).`,
  });

export const registerSchema = z.object({
  email: z.string().trim().email("Adresse email invalide"),
  fullName: z.string().trim().min(2, "Indique ton nom complet (2 caractères minimum)").max(80),
  password: password,
  phone: phone.optional().or(z.literal("")),
  next: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Adresse email invalide"),
  password: z.string().min(1, "Indique ton mot de passe"),
  next: z.string().optional(),
});

export const vendorRegisterSchema = z.object({
  email: vendorEmailSchema,
  fullName: z.string().trim().min(2, "Indique ton nom complet (2 caractères minimum)").max(80),
  password: password,
  phone: phone.optional().or(z.literal("")),
  shopName: z.string().trim().min(2, "Nom de boutique trop court").max(60),
  next: z.string().optional(),
});

export const vendorProfileSchema = z.object({
  shopName: z.string().trim().min(2, "Nom de boutique trop court").max(60),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  roomNumber: z.string().trim().max(30).optional().or(z.literal("")),
  momoNumber: phone.optional().or(z.literal("")),
  momoOperator: z.enum(["ORANGE_MONEY", "MOOV_MONEY"]).optional(),
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

export const reviewSchema = z.object({
  orderItemId: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const deleteProductSchema = z.object({
  productId: z.string().min(1, "Produit manquant : recharge la page."),
});

export const stockUpdateSchema = z.object({
  productId: z.string().min(1),
  stockMode: z.enum(["TRACKED", "UNLIMITED", "OUT_OF_STOCK"]),
  stockQty: z.coerce.number().int().min(0).max(100_000),
});
