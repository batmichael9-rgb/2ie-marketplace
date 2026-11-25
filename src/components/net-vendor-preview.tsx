"use client";

import { useState } from "react";
import { formatPercent, formatXof } from "@/lib/money";

/**
 * Champ Prix avec simulateur en direct du net vendeur.
 *
 * Le prix saisi est le prix payé par l'acheteur. La commission configurée est
 * retenue sur la part vendeur : on affiche donc immédiatement le net et la
 * commission, pour que le vendeur ajuste son prix en connaissance de cause.
 */
export function NetVendorPreview({
  defaultValue,
  feePercent,
  id = "priceXof",
}: {
  defaultValue?: number;
  feePercent: number;
  id?: string;
}) {
  const [value, setValue] = useState(defaultValue ? String(defaultValue) : "");

  const price = Number.parseInt(value, 10);
  const valid = Number.isFinite(price) && price > 0;
  const platformFee = valid ? Math.round(price * (feePercent / 100)) : 0;
  const vendorNet = valid ? price - platformFee : 0;
  const feeLabel = formatPercent(feePercent);
  const netLabel = formatPercent(100 - feePercent);

  return (
    <div>
      <label className="label" htmlFor={id}>
        Prix (FCFA)
      </label>
      <input
        id={id}
        name="priceXof"
        className="input"
        type="number"
        inputMode="numeric"
        min={25}
        max={10_000_000}
        step={25}
        placeholder="1500"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        required
      />
      <p className="mt-1 text-xs text-slate-500">Entier, sans centimes.</p>
      <p
        className="mt-1.5 rounded-lg bg-teal-50 px-2 py-1.5 text-xs font-medium text-teal-900"
        aria-live="polite"
      >
        {valid
          ? `Net vendeur (${netLabel} %) : ${formatXof(vendorNet)} (commission ${feeLabel} % : ${formatXof(platformFee)})`
          : `Net vendeur (${netLabel} %) : — FCFA (commission ${feeLabel} % : — FCFA)`}
      </p>
    </div>
  );
}
