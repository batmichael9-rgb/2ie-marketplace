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

type AiSearchResponse = {
  answer: string;
  keywords: string[];
  categories: string[];
  products: ProductCardData[];
  source: "gemini" | "local";
};

const CAMPUS_COOKIE = "2ie-market-campus";

function writeCampusCookie(value: string | null) {
  try {
    document.cookie = value
      ? `${CAMPUS_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
      : `${CAMPUS_COOKIE}=; path=/; max-age=0; samesite=lax`;
  } catch {
    // Cookies indisponibles : le filtrage local reste fonctionnel.
  }
}

const CAMPUS_SHORT_LABELS: Record<string, string> = {
  [CAMPUSES[0]]: "Ouagadougou",
  [CAMPUSES[1]]: "Kamboinsé",
};

export function CatalogBrowser({
  initialQuery,
  initialCategory,
  initialCampus,
  cards,
  recommended = [],
  recommendedPersonalized = false,
  children,
}: {
  initialQuery: string;
  initialCategory?: string;
  initialCampus?: string;
  cards: CatalogCard[];
  recommended?: ProductCardData[];
  recommendedPersonalized?: boolean;
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

  // Recherche intelligente : le mode est explicite pour ne pas envoyer chaque
  // frappe à l'API. Les résultats classés et la phrase de l'assistant arrivent
  // après un court debounce.
  const [aiMode, setAiMode] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiSearchResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const trimmedQuery = query.trim();

  // Campus par défaut choisi dans Paramètres (le paramètre d'URL reste prioritaire).
  useEffect(() => {
    if (initialCampus) {
      writeCampusCookie(initialCampus);
      return;
    }
    try {
      const stored = window.localStorage.getItem(CAMPUS_COOKIE);
      if (stored && CAMPUSES.includes(stored as (typeof CAMPUSES)[number])) {
        setCampus(stored);
        // Le cookie permet au serveur de personnaliser la rangée « Recommandé ».
        writeCampusCookie(stored);
      }
    } catch {
      // localStorage indisponible (navigation privée stricte) : sans effet.
    }
  }, [initialCampus]);

  useEffect(() => {
    if (!aiMode || trimmedQuery.length < 3) {
      setAiResult(null);
      setAiError(null);
      setAiLoading(false);
      return;
    }

    const controller = new AbortController();
    setAiLoading(true);

    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/ai/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmedQuery }),
          signal: controller.signal,
        });
        const data = (await response.json()) as AiSearchResponse & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Recherche indisponible.");

        setAiResult(data);
        setAiError(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        setAiResult(null);
        setAiError(
          error instanceof Error
            ? error.message
            : "La recherche intelligente est momentanément indisponible.",
        );
      } finally {
        if (!controller.signal.aborted) setAiLoading(false);
      }
    }, 550);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [aiMode, trimmedQuery]);

  const aiProducts = (aiResult?.products ?? []).filter(
    (product) => !campus || product.vendor.campus === campus,
  );

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

  const activeCategory = category ? CATEGORIES.find((item) => item.slug === category) : null;
  const hasFilters = Boolean(trimmedQuery || category || campus);

  function setCampusFilter(next: string | null) {
    setCampus(next);
    writeCampusCookie(next);
  }

  function resetFilters() {
    setQuery("");
    setCategory(null);
    setCampusFilter(null);
  }

  function selectCategory(next: string | null) {
    setCategory((current) => (current === next ? null : next));
    setDrawerOpen(false);
  }

  return (
    <div className="space-y-5">
      <section className="w-full overflow-hidden rounded-3xl bg-gradient-to-br from-teal-800 via-teal-700 to-emerald-600 px-5 py-7 text-white">
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
              placeholder={
                aiMode
                  ? "Ex. : de quoi réviser la nuit, pc pour autocad…"
                  : "Rechercher un produit, une marque, un service…"
              }
              aria-label={aiMode ? "Décrire une recherche intelligente" : "Rechercher un produit"}
              autoComplete="off"
              className="w-full rounded-xl border-0 bg-white/95 py-2.5 pl-11 pr-10 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-white/60"
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
            onClick={() => setCampusFilter(null)}
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
              onClick={() => setCampusFilter(campus === value ? null : value)}
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

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAiMode((current) => !current)}
            aria-pressed={aiMode}
            className={`badge border px-3 py-1.5 font-semibold transition-colors ${
              aiMode
                ? "border-white bg-white text-teal-800"
                : "border-amber-200/60 bg-amber-300/15 text-amber-50 hover:bg-amber-300/25"
            }`}
          >
            ✨ Recherche IA{aiMode ? " · activée" : ""}
          </button>
          <span className="text-xs text-teal-100">
            {aiMode
              ? "Décris ton besoin en une phrase, l'assistant traduit en produits."
              : "Ex. « de quoi réviser la nuit », « pc pour autocad »."}
          </span>
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

          <div className="w-full max-w-full overflow-x-auto">
            <nav
              aria-label="Filtrer par catégorie"
              className="no-scrollbar flex w-max min-w-full gap-2 py-2"
            >
            <button
              type="button"
              onClick={() => setCategory(null)}
              aria-pressed={category === null}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                category === null
                  ? "bg-teal-700 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-teal-500/40 dark:hover:text-teal-300"
              }`}
            >
              <LayoutGrid className="size-4" aria-hidden />
              Tout
            </button>

            {CATEGORIES.map((item) => {
              const Icon = item.icon;
              const active = category === item.slug;
              return (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => setCategory(item.slug)}
                  aria-pressed={active}
                  title={item.name}
                  className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-teal-700 text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-teal-500/40 dark:hover:text-teal-300"
                  }`}
                >
                  <Icon className="size-4" aria-hidden />
                  {item.name}
                </button>
              );
            })}
            </nav>
          </div>

          {!aiMode && recommended.length > 0 ? (
            <section aria-labelledby="recommended-heading">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2
                  id="recommended-heading"
                  className="text-base font-bold dark:text-slate-100"
                >
                  ✨ Recommandé pour vous
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {recommendedPersonalized
                    ? "D'après tes recherches et ton campus"
                    : "Les mieux notés et les plus récents du campus"}
                </p>
              </div>
              <div className="flex snap-x gap-3 overflow-x-auto pb-2">
                {recommended.map((product) => (
                  <div
                    key={product.id}
                    className="w-40 shrink-0 snap-start sm:w-44"
                  >
                    <ProductCard product={product} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {aiMode ? (
            <section className="card p-4" aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold dark:text-slate-100">
                  ✨ Assistant 2iE
                </h2>
                {aiResult ? (
                  <span className="badge bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">
                    {aiResult.source === "gemini" ? "Gemini" : "Moteur local gratuit"}
                  </span>
                ) : null}
              </div>

              {trimmedQuery.length < 3 ? (
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                  Décris ce qu’il te faut comme à un ami : « de quoi réviser la nuit », « pc
                  pour autocad », « manger vite entre deux cours »…
                </p>
              ) : aiLoading ? (
                <p className="mt-3 animate-pulse text-sm text-slate-600 dark:text-slate-300">
                  ✨ L’assistant parcourt le catalogue du campus…
                </p>
              ) : aiError ? (
                <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
                  {aiError}
                </p>
              ) : aiResult ? (
                <>
                  <p className="mt-3 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900 dark:bg-teal-500/10 dark:text-teal-200">
                    {aiResult.answer}
                  </p>

                  {aiResult.keywords.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Mots-clés :
                      </span>
                      {aiResult.keywords.slice(0, 10).map((keyword) => (
                        <button
                          key={keyword}
                          type="button"
                          onClick={() => setQuery(keyword)}
                          className="badge bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          {keyword}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {aiResult.categories.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Catégories :
                      </span>
                      {aiResult.categories.map((slug) => (
                        <span
                          key={slug}
                          className="badge bg-teal-50 text-teal-800 dark:bg-teal-500/10 dark:text-teal-300"
                        >
                          {CATEGORIES.find((item) => item.slug === slug)?.name ?? slug}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                    {aiProducts.length} article{aiProducts.length > 1 ? "s" : ""} classé
                    {aiProducts.length > 1 ? "s" : ""} par pertinence
                  </p>

                  {aiProducts.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                      Aucun article disponible ne correspond pour l’instant. Essaie avec un
                      autre campus ou reformule ta demande.
                    </p>
                  ) : (
                    <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {aiProducts.map((product) => (
                        <ProductCard key={product.id} product={product} />
                      ))}
                    </div>
                  )}
                </>
              ) : null}

              <button
                type="button"
                onClick={() => setAiMode(false)}
                className="mt-4 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
              >
                ← Revenir au catalogue classique
              </button>
            </section>
          ) : (
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
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {results.map((card) => (
                    <ProductCard key={card.slug} product={card} />
                  ))}
                </div>
              )}
            </section>
          )}
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
