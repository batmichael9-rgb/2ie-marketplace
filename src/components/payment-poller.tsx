"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Interroge le serveur tant que le paiement est en attente.
 *
 * C'est le filet de sécurité côté client : si le webhook du PSP n'arrive jamais
 * (coupure réseau, notification perdue), ce polling déclenche la vérification
 * directe auprès du PSP et met la page à jour.
 */
export function PaymentPoller({ reference }: { reference: string }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;

    const tick = async () => {
      try {
        const response = await fetch(`/api/payments/${reference}/status`, {
          cache: "no-store",
        });
        if (!response.ok) return;

        const data = (await response.json()) as { paymentStatus?: string };
        if (stopped) return;

        if (data.paymentStatus && data.paymentStatus !== "PENDING" && data.paymentStatus !== "CREATED") {
          stopped = true;
          setChecking(false);
          router.refresh();
        }
      } catch {
        if (!stopped) setMessage("Connexion instable — nouvelle tentative dans quelques secondes…");
      }
    };

    const interval = setInterval(tick, 5_000);
    tick();

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [reference, router]);

  if (!checking) return null;

  return (
    <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p className="font-medium">Vérification du paiement en cours…</p>
      <p className="mt-0.5 text-xs">
        Tu peux fermer cette page : ta commande sera mise à jour automatiquement dès confirmation
        par l&apos;opérateur.
      </p>
      {message ? <p className="mt-1 text-xs text-amber-800">{message}</p> : null}
    </div>
  );
}
