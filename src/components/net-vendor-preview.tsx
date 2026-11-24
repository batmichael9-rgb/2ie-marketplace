"use client";

import { useState } from "react";
import { formatXof } from "@/lib/money";

/**
 * Champ Prix avec simulateur en direct du net vendeur.
 *
 * Le prix saisi est le prix payé par l'acheteur. La commission de 5 % est
 * retenue sur la part vendeur : on affiche donc immédiatement le net (95 %) et
 * la commission, pour que le vendeur ajuste son prix en connaissance de cause.
 */
export function NetVendorPreview({
  defaultValue,
  id = "priceXof",
}: {
  defaultValue?: number;
  id?: string;
}) {
  const [value, setValue] = useState(defaultValue ? String(defaultValue) : "");

  const price = Number.parseInt(value, 10);
  const valid = Number.isFinite(price) && price > 0;
  const platformFee = valid ? Math.round(price * 0.05) : 0;
  const vendorNet = valid ? price - platformFee : 0;

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
          ? `Net vendeur (95 %) : ${formatXof(vendorNet)} (commission 5 % : ${formatXof(platformFee)})`
          : "Net vendeur (95 %) : — FCFA (commission 5 % : — FCFA)"}
      </p>
    </div>
  );
}
