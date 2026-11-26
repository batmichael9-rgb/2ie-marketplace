import {
  PLATFORM_FEE_PERCENT,
  VENDOR_NET_PERCENT,
  computeFeeBreakdown,
  formatPercent,
  formatXof,
} from "@/lib/money";

/** Exemples concrets affichés dans l'encadré de transparence des frais. */
const EXAMPLES = [500, 1_000, 10_000, 50_000];

/**
 * Encadré de transparence des frais de service, réservé à l'Espace vendeur.
 *
 * Le vendeur doit savoir exactement ce qu'il recevra avant de publier un
 * produit. Le libellé « Frais de service & Mobile Money » rappelle que ces
 * frais couvrent les opérateurs Mobile Money et l'hébergement sécurisé.
 */
export function PlatformFeeInfo({ className = "" }: { className?: string }) {
  const feeLabel = formatPercent(PLATFORM_FEE_PERCENT);
  const netLabel = formatPercent(VENDOR_NET_PERCENT);

  return (
    <section
      className={`rounded-2xl border border-teal-200 bg-teal-50/70 p-4 text-sm text-teal-950 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-50 ${className}`}
    >
      <h2 className="text-base font-semibold">Frais de service &amp; Mobile Money : {feeLabel} %</h2>
      <p className="mt-1">
        Sur chaque vente <strong>payée en ligne</strong> (Orange Money, Moov Money, Wave ou carte
        bancaire), 2iE Market retient des frais de service de <strong>{feeLabel} %</strong>. Les{" "}
        <strong>{netLabel} % restants</strong> vous sont reversés automatiquement sur votre numéro
        Mobile Money.
      </p>
      <p className="mt-1 text-xs">
        Ces frais couvrent principalement les frais d&apos;encaissement et de transfert des
        opérateurs Mobile Money (Orange/Moov) ainsi que l&apos;hébergement sécurisé de la
        plateforme.
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-teal-200 dark:border-teal-800">
              <th className="py-1.5 pr-3 font-semibold">Prix de vente</th>
              <th className="py-1.5 pr-3 font-semibold">Frais de service {feeLabel} %</th>
              <th className="py-1.5 font-semibold">Vous recevez</th>
            </tr>
          </thead>
          <tbody>
            {EXAMPLES.map((amount) => {
              const { platformFee } = computeFeeBreakdown(amount);
              return (
                <tr key={amount} className="border-b border-teal-100 last:border-0 dark:border-teal-900">
                  <td className="py-1.5 pr-3">{formatXof(amount)}</td>
                  <td className="py-1.5 pr-3">{formatXof(platformFee)}</td>
                  <td className="py-1.5 font-semibold">{formatXof(amount - platformFee)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs">
        Vous pouvez intégrer ces {feeLabel} % directement dans le prix de vos articles si vous le
        souhaitez.
      </p>
      <p className="mt-1 text-xs">
        Le paiement à la remise sur le campus, lorsqu&apos;il est autorisé, ne supporte aucun frais
        de service : le vendeur encaisse la totalité.
      </p>
    </section>
  );
}
