import { MOBILE_MONEY_LABELS, MOBILE_MONEY_PROVIDERS } from "@/lib/domain";

/**
 * Champs « Paiement & Mobile Money » partagés par Mon profil, l'Espace vendeur
 * et Paramètres : opérateur (Orange Money, Moov Money, Wave) + numéro.
 */
export function MobileMoneyFields({
  number,
  provider,
  idPrefix = "momo",
}: {
  number: string | null | undefined;
  provider: string | null | undefined;
  idPrefix?: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor={`${idPrefix}-provider`} className="label">
          Opérateur
        </label>
        <select
          id={`${idPrefix}-provider`}
          name="mobileMoneyProvider"
          className="input"
          defaultValue={provider ?? ""}
        >
          <option value="">Non précisé</option>
          {MOBILE_MONEY_PROVIDERS.map((value) => (
            <option key={value} value={value}>
              {MOBILE_MONEY_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-number`} className="label">
          Numéro Mobile Money <span className="font-normal text-slate-400">(facultatif)</span>
        </label>
        <input
          id={`${idPrefix}-number`}
          name="mobileMoneyNumber"
          type="tel"
          inputMode="tel"
          maxLength={20}
          className="input"
          defaultValue={number ?? ""}
          placeholder="+226 70 00 00 00"
          autoComplete="tel"
        />
      </div>
    </div>
  );
}
