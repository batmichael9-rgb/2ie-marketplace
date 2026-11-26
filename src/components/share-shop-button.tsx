"use client";

import { useEffect, useState } from "react";

/**
 * Partage de la vitrine publique d'une boutique.
 *
 * Ouvre le partage natif du téléphone (WhatsApp, Messages...) quand il existe,
 * sinon copie le lien dans le presse-papiers. L'URL absolue est reconstruite
 * côté navigateur : le lien partagé pointe toujours vers le bon domaine.
 */
export function ShareShopButton({
  slug,
  shopName,
  className = "btn bg-white text-teal-800 hover:bg-teal-50",
}: {
  slug: string;
  shopName: string;
  className?: string;
}) {
  const [origin, setOrigin] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
    setOrigin(configured || window.location.origin);
  }, []);

  const base = origin ?? process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? "";
  const url = `${base}/boutique/${slug}`;
  const message = `Découvre ${shopName} sur 2iE Market : ${url}`;

  async function handleShare() {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `${shopName} — 2iE Market`, text: message, url });
        return;
      } catch (error) {
        // Partage annulé par l'utilisateur : on ne bascule pas sur un copier.
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Presse-papiers indisponible (contexte non sécurisé) : l'utilisateur
      // peut toujours utiliser le lien WhatsApp ci-dessous.
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-1">
      <button type="button" onClick={handleShare} className={className}>
        {copied ? "Lien copié ✓" : "Partager ma boutique"}
      </button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(message)}`}
        target="_blank"
        rel="noreferrer"
        className="text-center text-xs text-teal-100 underline hover:text-white"
      >
        ou envoyer sur WhatsApp
      </a>
    </div>
  );
}
