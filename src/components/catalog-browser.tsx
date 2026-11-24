"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, LayoutGrid, Search, X } from "lucide-react";
import { CATEGORIES, type CatalogCategory } from "@/lib/categories";
import { CAMPUSES, CAMPUS_LABELS, matchesSearchQuery } from "@/lib/domain";
import { ProductCard, type ProductCardData } from "./product-card";

export type CatalogCard = ProductCardData & {
  searchText: string;
  categorySlug: string | null;
};

const CAMPUS_SHORT_LABELS: Record<string, string> = {
  [CAMPUSES[0]]: "Ouagadougou",
  [CAMPUSES[1]]: "Kamboinsé",
};

export function CatalogBrowser({
  initialQuery,
  initialCategory,
  initialCampus,
  cards,
  children,
}: {
  initialQuery: string;
  initialCategory?: string;
  initialCampus?: string;
  cards: CatalogCard[];
  children: ReactNode;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<string | null>(initialCategory ?? null);
  const [campus, setCampus] = useState<string | null>(
    initialCampus && CAMPUSES.includes(initialCampus as (typeof CAMPUSES)[number])
      ? initialCampus
      : null,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Campus par défaut choisi dans Paramètres (le paramètre d'URL reste prioritaire).
  useEffect(() => {
    if (initialCampus) return;
    try {
      const stored = window.localStorage.getItem("2ie-market-campus");
      if (stored && CAMPUSES.includes(stored as (typeof CAMPUSES)[number])) setCampus(stored);
    } catch {
      // localStorage indisponible (navigation privée stricte) : sans effet.
    }
  }, [initialCampus]);

  // Le catalogue est déjà en mémoire : chaque filtre s'applique sans aller-retour
  // réseau, donc les résultats apparaissent dès la première lettre.
  const results = useMemo(
    () =>
      cards.filter((card) => {
        if (category && card.categorySlug !== category) return false;
        if (campus && card.vendor.campus !== campus) return false;
        return matchesSearchQuery(card.searchText, query);
      }),
    [cards, category, campus, query],
  );

  const trimmedQuery = query.trim();
  const activeCategory = category ? CATEGORIES.find((item) => item.slug === category) : null;
  const hasFilters = Boolean(trimmedQuery || category || campus);

  function resetFilters() {
    setQuery("");
    setCategory(null);
    setCampus(null);
  }

  function selectCategory(next: string | null) {
    setCategory((current) => (current === next ? null : next));
    setDrawerOpen(false);
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-teal-800 via-teal-700 to-emerald-600 px-5 py-7 text-white">
        {children}

        <div className="mt-4">
          <div className="relative w-full">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              type="text"
              enterKeyHint="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un produit, une marque, un service…"
              aria-label="Rechercher un produit"
              autoComplete="off"
              className="w-full rounded-xl border-0 bg-white/95 py-2.5 pl-11 pr-10 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-white/60"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Effacer la recherche"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-teal-100">
            Campus
          </span>
          <button
            type="button"
            onClick={() => setCampus(null)}
            className={`badge border px-3 py-1.5 transition-colors ${
              campus === null
                ? "border-white bg-white text-teal-800"
                : "border-white/40 text-white hover:bg-white/10"
            }`}
          >
            Les deux
          </button>
          {CAMPUSES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setCampus((current) => (current === value ? null : value))}
              className={`badge border px-3 py-1.5 transition-colors ${
                campus === value
                  ? "border-white bg-white text-teal-800"
                  : "border-white/40 text-white hover:bg-white/10"
              }`}
            >
              {CAMPUS_SHORT_LABELS[value] ?? CAMPUS_LABELS[value]}
            </button>
          ))}

          {hasFilters ? (
            <button
              type="button"
              onClick={resetFilters}
              className="ml-auto text-xs font-semibold text-teal-100 underline-offset-2 hover:text-white hover:underline"
            >
              Réinitialiser
            </button>
          ) : null}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        {/* Barre latérale verticale défilante : toutes les catégories (desktop). */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <CategoryList
              active={category}
              onSelect={selectCategory}
              heading="Toutes les catégories"
            />
          </div>
        </aside>

        <div className="space-y-5">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="btn-secondary w-full justify-between lg:hidden"
          >
            <span className="flex items-center gap-2">
              <LayoutGrid className="size-4" aria-hidden />
              Toutes les catégories
            </span>
            <ChevronRight className="size-4" aria-hidden />
          </button>

          <section className="card p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-bold dark:text-slate-100">Catégories pour vous</h2>
              {activeCategory ? (
                <button
                  type="button"
                  onClick={() => setCategory(null)}
                  className="text-xs font-semibold text-teal-700 hover:underline"
                >
                  Tout afficher
                </button>
              ) : null}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
              {CATEGORIES.map((item) => {
                const Icon = item.icon;
                const active = category === item.slug;
                return (
                  <button
                    key={item.slug}
                    type="button"
                    onClick={() => selectCategory(item.slug)}
                    aria-pressed={active}
                    title={item.name}
                    className={`group flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2 text-center transition-colors ${
                      active
                        ? "bg-teal-50 dark:bg-teal-500/15"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span
                      className={`grid size-12 place-items-center rounded-full border transition-colors ${
                        active
                          ? "border-teal-600 bg-teal-700 text-white"
                          : "border-slate-200 bg-stone-50 text-teal-800 group-hover:border-teal-300 dark:border-slate-700 dark:bg-slate-800 dark:text-teal-300"
                      }`}
                    >
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span
                      className={`line-clamp-2 text-[11px] font-medium leading-tight ${
                        active
                          ? "text-teal-900 dark:text-teal-200"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {item.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold dark:text-slate-100">
                {activeCategory ? activeCategory.name : "Produits du campus"}
                <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                  {results.length} produit{results.length > 1 ? "s" : ""}
                </span>
              </h2>
              {trimmedQuery ? (
                <p className="text-xs text-slate-500" aria-live="polite">
                  Résultats pour « {trimmedQuery} »
                </p>
              ) : null}
            </div>

            {results.length === 0 ? (
              <div className="card p-10 text-center">
                <p className="text-lg font-semibold">Aucun produit trouvé</p>
                <p className="mt-1 text-sm text-slate-600">
                  {hasFilters
                    ? "Essaie une autre catégorie, un autre campus ou un autre mot-clé."
                    : "Le catalogue est vide. Lance `npm run db:seed` pour charger les données de démonstration."}
                </p>
                {hasFilters ? (
                  <button type="button" onClick={resetFilters} className="btn-secondary mt-4">
                    Réinitialiser les filtres
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {results.map((card) => (
                  <ProductCard key={card.slug} product={card} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Tiroir mobile « Toutes les catégories ». */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fermer les catégories"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 cursor-default bg-slate-900/40"
          />
          <div className="absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <p className="font-bold dark:text-slate-100">Toutes les catégories</p>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Fermer"
                className="btn-ghost !p-2"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <CategoryList active={category} onSelect={selectCategory} />
            </div>
          </div>
        </div>
      ) : null}

      <p className="text-center text-xs text-slate-400">
        Besoin d&apos;un produit absent du catalogue ?{" "}
        <Link href="/messages" className="font-semibold text-teal-700 hover:underline">
          Écris à un vendeur
        </Link>
        .
      </p>
    </div>
  );
}

function CategoryList({
  active,
  onSelect,
  heading,
}: {
  active: string | null;
  onSelect: (slug: string | null) => void;
  heading?: string;
}) {
  return (
    <div>
      {heading ? (
        <p className="px-2 py-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          {heading}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={active === null}
        className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm font-medium transition-colors ${
          active === null
            ? "bg-teal-700 text-white"
            : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
        }`}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/15">
          <LayoutGrid className="size-4" aria-hidden />
        </span>
        Tout le catalogue
      </button>

      <ul className="mt-1 space-y-0.5">
        {CATEGORIES.map((item: CatalogCategory) => {
          const Icon = item.icon;
          const isActive = active === item.slug;
          return (
            <li key={item.slug}>
              <button
                type="button"
                onClick={() => onSelect(item.slug)}
                aria-pressed={isActive}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-[13px] font-medium leading-tight transition-colors ${
                  isActive
                    ? "bg-teal-50 text-teal-900 dark:bg-teal-500/15 dark:text-teal-200"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <Icon
                  className={`size-4 shrink-0 ${isActive ? "text-teal-700" : "text-slate-400"}`}
                  aria-hidden
                />
                <span className="line-clamp-2">{item.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
