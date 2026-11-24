"use client";

import { useEffect, useState } from "react";
import { CAMPUSES } from "@/lib/domain";

const STORAGE_KEY = "2ie-market-campus";

/**
 * Campus par défaut de l'accueil. Enregistré dans localStorage et lu par le
 * catalogue pour pré-filtrer les produits sans toucher au compte.
 */
export function CampusPreference() {
  const [campus, setCampus] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setCampus(window.localStorage.getItem(STORAGE_KEY) ?? "");
  }, []);

  function update(value: string) {
    setCampus(value);
    if (value) {
      window.localStorage.setItem(STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setSaved(true);
  }

  return (
    <div className="space-y-2">
      <label htmlFor="campus-preference" className="label">
        Campus par défaut
      </label>
      <select
        id="campus-preference"
        value={campus}
        onChange={(event) => update(event.target.value)}
        className="input"
      >
        <option value="">Tous les campus</option>
        {CAMPUSES.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Utilisé pour pré-filtrer le catalogue dès l&apos;ouverture de l&apos;accueil.
        {saved ? " Préférence enregistrée." : ""}
      </p>
    </div>
  );
}
