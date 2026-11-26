"use client";

import { useEffect, useState } from "react";
import { ShareMenu } from "@/components/share-menu";
import { buildShopShareMessage } from "@/lib/share";

/**
 * Partage de la vitrine publique d'une boutique.
 *
 * Aucun appel au partage natif de l'OS : un menu propre propose WhatsApp ou la
 * copie du lien. L'URL absolue est reconstruite côté navigateur (ou à partir de
 * NEXT_PUBLIC_APP_URL) pour toujours pointer vers le bon domaine.
 */
export function ShareShopButton({
  slug,
  shopName,
  description,
  className = "btn bg-white text-teal-800 hover:bg-teal-50",
}: {
  slug: string;
  shopName: string;
  description?: string | null;
  className?: string;
}) {
  const [origin, setOrigin] = useState<string | null>(null);

  useEffect(() => {
    const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
    setOrigin(configured || window.location.origin);
  }, []);

  const base = origin ?? process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? "";
  const url = `${base}/boutique/${slug}`;

  return (
    <ShareMenu
      label="Partager ma boutique"
      url={url}
      message={buildShopShareMessage({ shopName, description, url })}
      className={className}
    />
  );
}
