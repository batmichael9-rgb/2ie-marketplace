"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "./theme-provider";

const OPTIONS: { value: Theme; label: string; description: string; icon: typeof Sun }[] = [
  { value: "light", label: "Clair", description: "Toujours en mode clair", icon: Sun },
  { value: "dark", label: "Sombre", description: "Toujours en mode sombre", icon: Moon },
  {
    value: "system",
    label: "Automatique",
    description: "Suit le réglage du téléphone",
    icon: Monitor,
  },
];

/** Choix clair / sombre / système, enregistré dans localStorage. */
export function ThemeChooser() {
  const { theme, setTheme } = useTheme();

  return (
    <div role="radiogroup" aria-label="Thème de l'application" className="grid gap-2 sm:grid-cols-3">
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(option.value)}
            className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
              active
                ? "border-teal-600 bg-teal-50 dark:border-teal-500 dark:bg-teal-500/10"
                : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
            }`}
          >
            <Icon
              className={`size-5 shrink-0 ${
                active ? "text-teal-700 dark:text-teal-400" : "text-slate-400"
              }`}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold dark:text-slate-100">
                {option.label}
              </span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                {option.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
