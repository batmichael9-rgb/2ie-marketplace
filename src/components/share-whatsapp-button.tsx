"use client";

import { useEffect, useState } from "react";
import { ShareMenu } from "@/components/share-menu";
import { buildProductShareMessage } from "@/lib/share";

/**
 * Partage d'un produit : menu maison (WhatsApp ou copie du lien), sans partage
 * natif de l'OS. L'URL absolue vient de NEXT_PUBLIC_APP_URL si défini, sinon de
 * window.location.origin : le lien ne pointe jamais vers localhost en prod.
 */
export function ShareWhatsAppButton({
  slug,
  name,
  priceXof,
  shopName,
  className = "btn-secondary w-full",
  label = "Partager le produit",
}: {
  slug: string;
  name: string;
  priceXof: number;
  shopName: string;
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

  return (
    <ShareMenu
      label={label}
      url={productUrl}
      message={buildProductShareMessage({ name, priceXof, shopName, url: productUrl })}
      className={className}
    />
  );
}
