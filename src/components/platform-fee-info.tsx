import { formatXof } from "@/lib/money";

/** Exemples concrets affichés dans l'encadré de transparence de la commission. */
const EXAMPLES = [500, 1_000, 10_000, 50_000];

/**
 * Encadré de transparence de la commission plateforme de 5 %.
 *
 * Affiché avant l'inscription vendeur et dans l'Espace vendeur : le vendeur
 * doit savoir exactement ce qu'il recevra avant de publier un produit.
 */
export function PlatformFeeInfo({ className = "" }: { className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-teal-200 bg-teal-50/70 p-4 text-sm text-teal-950 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-50 ${className}`}
    >
      <h2 className="text-base font-semibold">Commission plateforme de 5 %</h2>
      <p className="mt-1">
        Sur chaque vente <strong>payée en ligne</strong> (Orange Money, Moov Money, Wave ou
        carte bancaire), 2iE Market retient une commission de <strong>5 %</strong>. Les{" "}
        <strong>95 % restants</strong> vous sont reversés sur votre numéro Mobile Money.
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-teal-200 dark:border-teal-800">
              <th className="py-1.5 pr-3 font-semibold">Prix de vente</th>
              <th className="py-1.5 pr-3 font-semibold">Commission 5 %</th>
              <th className="py-1.5 font-semibold">Vous recevez</th>
            </tr>
          </thead>
          <tbody>
            {EXAMPLES.map((amount) => {
              const fee = Math.round(amount * 0.05);
              return (
                <tr key={amount} className="border-b border-teal-100 last:border-0 dark:border-teal-900">
                  <td className="py-1.5 pr-3">{formatXof(amount)}</td>
                  <td className="py-1.5 pr-3">{formatXof(fee)}</td>
                  <td className="py-1.5 font-semibold">{formatXof(amount - fee)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs">
        Vous pouvez intégrer ces 5 % directement dans le prix de vos articles si vous le
        souhaitez.
      </p>
      <p className="mt-1 text-xs">
        Le paiement à la remise sur le campus, lorsqu&apos;il est autorisé, ne supporte aucune
        commission : le vendeur encaisse la totalité.
      </p>
    </section>
  );
}
