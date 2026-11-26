import { Banknote, LockKeyhole, Smartphone } from "lucide-react";

const HIGHLIGHTS = [
  {
    icon: Banknote,
    title: "Inscription gratuite",
    description:
      "Ouvre ta boutique sans frais d'inscription ni abonnement mensuel. Commence à vendre dès la validation de ton compte.",
  },
  {
    icon: LockKeyhole,
    title: "Encaissement sécurisé Mobile Money",
    description:
      "Tes clients paient en ligne avec Orange Money, Moov Money ou Wave : le paiement est vérifié automatiquement, sans manipulation d'espèces.",
  },
  {
    icon: Smartphone,
    title: "Reversement automatique",
    description:
      "Chaque vente réglée est reversée directement sur ton numéro Mobile Money enregistré, sans démarche à effectuer.",
  },
];

/**
 * Encadré public de réassurance affiché avant l'inscription vendeur.
 *
 * On y met uniquement en avant les arguments d'inscription : gratuité,
 * encaissement Mobile Money sécurisé et reversement automatique.
 */
export function VendorSignupHighlights({ className = "" }: { className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-teal-200 bg-teal-50/70 p-4 text-sm text-teal-950 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-50 ${className}`}
    >
      <h2 className="text-base font-semibold">Vends sur 2iE Market en toute sérénité</h2>
      <ul className="mt-3 space-y-3">
        {HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
          <li key={title} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white">
              <Icon className="size-4" aria-hidden />
            </span>
            <span>
              <strong className="block">{title}</strong>
              <span className="text-xs sm:text-sm">{description}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
