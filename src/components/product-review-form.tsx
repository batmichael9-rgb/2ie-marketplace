"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Formulaire d'avis à 5 étoiles cliquables sur la fiche produit.
 *
 * Envoie la note et le commentaire à `POST /api/products/[id]/reviews`, puis
 * rafraîchit la fiche pour afficher l'avis et la nouvelle moyenne.
 */
export function ProductReviewForm({
  productId,
  initialRating = 0,
  initialComment = "",
}: {
  productId: string;
  initialRating?: number;
  initialComment?: string;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(initialRating);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState(initialComment);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const shown = hovered || rating;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    if (rating < 1) {
      setFeedback({ ok: false, message: "Choisis une note de 1 à 5 étoiles." });
      return;
    }

    setPending(true);
    setFeedback(null);

    try {
      const response = await fetch(`/api/products/${productId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string }
        | null;

      if (!response.ok || !data?.ok) {
        setFeedback({
          ok: false,
          message: data?.message ?? "L'avis n'a pas pu être publié. Réessaie.",
        });
        return;
      }

      setFeedback({ ok: true, message: "Merci, ton avis est publié !" });
      router.refresh();
    } catch {
      setFeedback({ ok: false, message: "Impossible de contacter le serveur." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
      <p className="text-sm font-semibold">
        {initialRating > 0 ? "Modifier ma note" : "Donne ta note à ce produit"}
      </p>

      <div className="flex items-center gap-1" role="radiogroup" aria-label="Note sur 5 étoiles">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={rating === star}
            aria-label={`${star} étoile${star > 1 ? "s" : ""}`}
            onClick={() => setRating(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            onFocus={() => setHovered(star)}
            onBlur={() => setHovered(0)}
            className="rounded p-0.5 text-2xl leading-none text-amber-500 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-teal-600/30"
          >
            {shown >= star ? "★" : "☆"}
          </button>
        ))}
        <span className="ml-2 text-sm text-slate-500">
          {rating > 0 ? `${rating}/5` : "Aucune note"}
        </span>
      </div>

      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        rows={3}
        maxLength={1000}
        className="input"
        placeholder="Produit conforme ? Vendeur réactif ? (visible publiquement)"
      />

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Publication…" : initialRating > 0 ? "Mettre à jour mon avis" : "Publier mon avis"}
      </button>

      {feedback ? (
        <p
          role="status"
          className={`text-sm ${feedback.ok ? "text-teal-700 dark:text-teal-400" : "text-red-700 dark:text-red-400"}`}
        >
          {feedback.message}
        </p>
      ) : null}
    </form>
  );
}
