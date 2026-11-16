"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { matchesSearchQuery } from "@/lib/domain";
import { ProductCard, type ProductCardData } from "./product-card";

export type CatalogCard = ProductCardData & { searchText: string };

type Category = { id: string; slug: string; name: string; icon: string | null };

export function CatalogBrowser({
  initialQuery,
  cards,
  categories,
  activeCategory,
  children,
}: {
  initialQuery: string;
  cards: CatalogCard[];
  categories: Category[];
  activeCategory?: string;
  children: ReactNode;
}) {
  // Le catalogue est déjà en mémoire : chaque frappe refiltre la liste sans
  // aller-retour réseau, donc les résultats apparaissent dès la première lettre.
  const [query, setQuery] = useState(initialQuery);

  const results = useMemo(
    () => cards.filter((card) => matchesSearchQuery(card.searchText, query)),
    [cards, query],
  );

  const trimmedQuery = query.trim();

  function hrefFor(slug?: string) {
    const params = new URLSearchParams();
    if (trimmedQuery) params.set("q", trimmedQuery);
    if (slug) params.set("categorie", slug);
    const search = params.toString();
    return search ? `/?${search}` : "/";
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-teal-800 via-teal-700 to-emerald-600 px-5 py-7 text-white">
        {children}

        <div className="mt-4 flex gap-2">
          <div className="relative w-full">
            <input
              type="text"
              enterKeyHint="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un produit..."
              aria-label="Rechercher un produit"
              autoComplete="off"
              className="w-full rounded-xl border-0 bg-white/95 px-3.5 py-2.5 pr-10 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-white/60"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Effacer la recherche"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-sm text-slate-500 hover:bg-slate-200 hover:text-slate-800"
              >
                ✕
              </button>
            ) : null}
          </div>
        </div>

        {trimmedQuery ? (
          <p className="mt-2 text-xs text-teal-100" aria-live="polite">
            {results.length === 0
              ? "Aucun produit ne correspond à ta recherche."
              : `${results.length} produit${results.length > 1 ? "s" : ""} trouvé${
                  results.length > 1 ? "s" : ""
                }`}
          </p>
        ) : null}
      </section>

      <section className="flex gap-2 overflow-x-auto pb-1">
        <Link
          href={hrefFor()}
          scroll={false}
          className={`badge shrink-0 border px-3 py-1.5 ${
            !activeCategory
              ? "border-teal-700 bg-teal-700 text-white"
              : "border-slate-200 bg-white text-slate-700"
          }`}
        >
          Tout
        </Link>
        {categories.map((category) => {
          const active = activeCategory === category.slug;
          return (
            <Link
              key={category.id}
              href={hrefFor(category.slug)}
              scroll={false}
              className={`badge shrink-0 border px-3 py-1.5 ${
                active
                  ? "border-teal-700 bg-teal-700 text-white"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <span aria-hidden>{category.icon ?? "•"}</span> {category.name}
            </Link>
          );
        })}
      </section>

      {results.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-lg font-semibold">Aucun produit trouvé</p>
          <p className="mt-1 text-sm text-slate-600">
            {trimmedQuery
              ? `Aucun résultat pour « ${trimmedQuery} ». Essaie un autre mot-clé.`
              : "Le catalogue est vide. Lance `npm run db:seed` pour charger les données de démonstration."}
          </p>
          {trimmedQuery ? (
            <button type="button" onClick={() => setQuery("")} className="btn-secondary mt-4">
              Effacer la recherche
            </button>
          ) : null}
        </div>
      ) : (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {results.map((card) => (
            <ProductCard key={card.slug} product={card} />
          ))}
        </section>
      )}
    </div>
  );
}
