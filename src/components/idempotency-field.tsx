"use client";

import { useEffect, useRef } from "react";

/**
 * Champ caché portant la clé d'idempotence du tunnel de commande.
 *
 * La clé est générée une seule fois, puis conservée dans sessionStorage sous la
 * clé `idem:<scope>`. Si le client perd le réseau et renvoie le formulaire
 * (ou rafraîchit la page), c'est LA MÊME clé qui repart : le serveur retrouve
 * le paiement existant au lieu d'en créer un second.
 *
 * La clé est effacée par <ClearIdempotency /> sur la page de confirmation,
 * pour qu'une nouvelle commande du même produit reparte d'un cycle neuf.
 */
export function IdempotencyField({ scope }: { scope: string }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const storageKey = `idem:${scope}`;
    let value = window.sessionStorage.getItem(storageKey);

    if (!value) {
      value =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.sessionStorage.setItem(storageKey, value);
    }

    if (inputRef.current) inputRef.current.value = value;
  }, [scope]);

  return <input ref={inputRef} type="hidden" name="idempotencyKey" defaultValue="" />;
}
