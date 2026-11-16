"use client";

import { useEffect } from "react";

/** Efface la clé d'idempotence d'un tunnel de commande terminé. */
export function ClearIdempotency({ scope }: { scope: string }) {
  useEffect(() => {
    window.sessionStorage.removeItem(`idem:${scope}`);
  }, [scope]);

  return null;
}
