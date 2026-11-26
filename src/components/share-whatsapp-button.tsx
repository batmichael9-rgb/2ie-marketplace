"use client";

import { useEffect, useState } from "react";
import { formatXof } from "@/lib/money";

/**
 * Bouton de partage WhatsApp d'un produit.
 *
 * L'URL absolue est construite côté navigateur à partir de
 * NEXT_PUBLIC_APP_URL (si défini) ou de window.location.origin : le lien ne
 * peut donc jamais pointer vers http://localhost:3000 en production. Le texte
 * n'est inclus qu'une seule fois dans le message partagé.
 */
export function ShareWhatsAppButton({
  slug,
  name,
  priceXof,
  className = "btn-secondary w-full",
  label = "Partager sur WhatsApp",
}: {
  slug: string;
  name: string;
  priceXof: number;
  className?: string;
  label?: string;
}) {
  const [origin, setOrigin] = useState<string | null>(null);

  useEffect(() => {
    const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
    setOrigin(configured || window.location.origin);
  }, []);

  const base = origin ?? process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? "";
  // On partage la fiche produit (et non le tunnel de commande) : c'est elle qui
  // porte l'aperçu riche Open Graph affiché par WhatsApp.
  const productUrl = `${base}/p/${slug}`;
  const message = `${name} — ${formatXof(priceXof)} sur 2iE Market : ${productUrl}`;

  return (
    <a
      href={`https://wa.me/?text=${encodeURIComponent(message)}`}
      target="_blank"
      rel="noreferrer"
      className={className}
    >
      {label}
    </a>
  );
}
