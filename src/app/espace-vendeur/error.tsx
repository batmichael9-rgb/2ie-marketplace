"use client";

import Link from "next/link";

/**
 * Filet de sécurité de l'espace vendeur : une erreur Prisma ou réseau affiche
 * un message lisible au lieu de la page d'erreur générique de Next.js.
 */
export default function VendorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="rounded-2xl border border-red-100 bg-red-50 px-6 py-8">
        <h1 className="text-lg font-semibold text-red-900">
          Cette page n&apos;a pas pu être chargée
        </h1>
        <p className="mt-2 text-sm text-red-800">
          Une erreur est survenue pendant le chargement de ton espace vendeur.
          Réessaie : si le problème persiste, vérifie ta connexion puis
          reconnecte-toi.
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs text-red-700/70">Référence : {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={reset}
            className="w-full rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800"
          >
            Réessayer
          </button>
          <Link
            href="/espace-vendeur"
            className="text-sm font-medium text-red-800 underline underline-offset-4"
          >
            Retour à mon espace vendeur
          </Link>
        </div>
      </div>
    </div>
  );
}
