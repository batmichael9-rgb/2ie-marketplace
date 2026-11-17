import "server-only";

import { randomUUID } from "node:crypto";

/** Taille maximale d'une photo produit (doit rester <= bodySizeLimit des Server Actions). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Erreur dont le message est sûr à afficher tel quel au vendeur.
 */
export class ImageUploadError extends Error {}

/**
 * Envoie la photo d'un produit dans un bucket public Supabase Storage.
 *
 * Vercel ne permet pas d'écrire dans `public/` : le fichier est donc stocké
 * hors de l'application et servi par l'URL publique de Supabase. Le nom fourni
 * par le navigateur est ignoré : l'extension est déduite du type MIME et le
 * fichier est renommé avec un UUID.
 *
 * Variables d'environnement : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et,
 * facultativement, SUPABASE_STORAGE_BUCKET (par défaut « products »).
 */
export async function uploadProductImage(file: File): Promise<string> {
  const extension = IMAGE_EXTENSIONS[file.type];
  if (!extension) {
    throw new ImageUploadError(
      "Format d'image non pris en charge : choisis un JPG, PNG, WebP ou GIF.",
    );
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageUploadError(
      "Photo trop lourde : 5 Mo maximum. Compresse-la ou choisis-en une autre.",
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant : upload impossible.");
    throw new ImageUploadError(
      "L'envoi de photos n'est pas encore configuré. Contacte l'administrateur de la marketplace.",
    );
  }

  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "products";
  const objectPath = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
  const body = Buffer.from(await file.arrayBuffer());
  const endpoint = `${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`;

  const upload = () =>
    fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": file.type,
        "x-upsert": "true",
      },
      body,
      cache: "no-store",
    });

  let response = await upload();

  // Premier envoi : le bucket peut ne pas exister encore. On le crée en public
  // (les photos produits doivent être accessibles sans authentification) puis
  // on réessaie une seule fois.
  if (response.status === 400 || response.status === 404) {
    const detail = await response.clone().text();
    if (/bucket/i.test(detail)) {
      const created = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: bucket,
          name: bucket,
          public: true,
          file_size_limit: MAX_IMAGE_BYTES,
        }),
        cache: "no-store",
      });

      if (!created.ok) {
        console.error(
          `Création du bucket Supabase « ${bucket} » : HTTP ${created.status} —`,
          (await created.text()) || "(réponse vide)",
        );
      }

      response = await upload();
    }
  }

  if (!response.ok) {
    const detail = (await response.text()).trim();
    console.error(
      `Supabase Storage : POST ${endpoint} → HTTP ${response.status} —`,
      detail || "(réponse vide)",
    );
    throw new ImageUploadError(
      `Supabase Storage a refusé la photo (HTTP ${response.status}) : ${
        detail || "réponse vide"
      }`,
    );
  }

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;
}
