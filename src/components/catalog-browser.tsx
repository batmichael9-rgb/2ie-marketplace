"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, LayoutGrid, Search, X } from "lucide-react";
import { CATEGORIES, type CatalogCategory } from "@/lib/categories";
import { CAMPUSES, CAMPUS_LABELS, matchesSearchQuery } from "@/lib/domain";
import { formatXof } from "@/lib/money";
import { ProductCard, type ProductCardData } from "./product-card";
import { ShopCard, type ShopCardData } from "./shop-card";

export type CatalogCard = ProductCardData & {
  searchText: string;
  categorySlug: string | null;
};

type AiSearchResponse = {
  analysis: {
    keywords: string[];
    maxPrice: number | null;
    onlyOpen: boolean;
    summary: string;
    categories: string[];
    source: "gemini" | "local";
  };
  products: ProductCardData[];
  relaxedPrice: boolean;
};

type SearchTab = "ai" | "products" | "shops";

type AiFilters = {
  openOnly: boolean;
  inStock: boolean;
  maxPrice: number | null;
  reservableOnly: boolean;
  bestRated: boolean;
};

const EMPTY_AI_FILTERS: AiFilters = {
  openOnly: false,
  inStock: false,
  maxPrice: null,
  reservableOnly: false,
  bestRated: false,
};

const AI_FILTER_PILLS: { id: keyof AiFilters; label: string }[] = [
  { id: "openOnly", label: "🟢 Boutique ouverte" },
  { id: "inStock", label: "✅ En stock" },
  { id: "maxPrice", label: "💰 Moins de 1 500 FCFA" },
  { id: "reservableOnly", label: "📅 Réservable" },
  { id: "bestRated", label: "⭐ Mieux notés" },
];

const SEARCH_TABS: { id: SearchTab; label: string }[] = [
  { id: "ai", label: "✨ Mode IA" },
  { id: "products", label: "Produits" },
  { id: "shops", label: "Boutiques" },
];

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
  shops = [],
  recommended = [],
  recommendedPersonalized = false,
  children,
}: {
  initialQuery: string;
  initialCategory?: string;
  initialCampus?: string;
  cards: CatalogCard[];
  shops?: ShopCardData[];
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

  // Trois onglets de navigation : IA, produits et boutiques du campus.
  const [tab, setTab] = useState<SearchTab>("products");

  // Deep Search : l'analyse d'intention part après un court debounce pour ne
  // pas envoyer chaque frappe à l'API.
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiSearchResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiFilters, setAiFilters] = useState<AiFilters>(EMPTY_AI_FILTERS);
  const [detailsOpen, setDetailsOpen] = useState(false);

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
    if (tab !== "ai" || trimmedQuery.length < 3) {
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
          body: JSON.stringify({ query: trimmedQuery, filters: aiFilters }),
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
  }, [tab, trimmedQuery, aiFilters]);

  const aiProducts = (aiResult?.products ?? []).filter(
    (product) => !campus || product.vendor.campus === campus,
  );

  // L'annuaire des boutiques vit en mémoire : recherche et campus instantanés.
  const shopResults = useMemo(
    () =>
      shops.filter((shop) => {
        if (campus && shop.campus !== campus) return false;
        return matchesSearchQuery(
          `${shop.shopName} ${shop.description ?? ""} ${shop.roomNumber ?? ""}`,
          query,
        );
      }),
    [shops, campus, query],
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

  // Les pilules sont cumulables ; celle du budget bascule entre 1 500 FCFA et
  // aucun prix maximum. Chaque changement relance Deep Search côté serveur.
  function toggleAiFilter(id: keyof AiFilters) {
    setAiFilters((current) =>
      id === "maxPrice"
        ? { ...current, maxPrice: current.maxPrice === null ? 1_500 : null }
        : { ...current, [id]: !current[id] },
    );
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-5">
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
                tab === "ai"
                  ? "Décris ce qu'il te faut : « chawarma à moins de 1500f »…"
                  : tab === "shops"
                    ? "Rechercher une boutique, un vendeur…"
                    : "Rechercher un produit, une marque, un service…"
              }
              aria-label={
                tab === "ai"
                  ? "Décrire une recherche intelligente"
                  : tab === "shops"
                    ? "Rechercher une boutique"
                    : "Rechercher un produit"
              }
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

        <div
          role="tablist"
          aria-label="Type de recherche"
          className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-white/15 p-1"
        >
          {SEARCH_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`rounded-xl px-2 py-2 text-xs font-semibold transition-colors sm:text-sm ${
                tab === item.id
                  ? "bg-white text-teal-800 shadow-sm"
                  : "text-white/85 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <div
        className={`grid w-full min-w-0 gap-5 ${
          tab === "products" ? "lg:grid-cols-[250px_minmax(0,1fr)]" : ""
        }`}
      >
        {/* Barre latérale verticale défilante : toutes les catégories (desktop). */}
        {tab === "products" ? (
          <aside className="hidden lg:block">
            <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <CategoryList
                active={category}
                onSelect={selectCategory}
                heading="Toutes les catégories"
              />
            </div>
          </aside>
        ) : null}

        <div className="w-full min-w-0 space-y-5">
          {tab === "products" ? (
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
          ) : null}

          {tab === "products" && recommended.length > 0 ? (
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
              <div className="flex w-full min-w-0 gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
                {recommended.map((product) => (
                  <div
                    key={product.id}
                    className="w-[46vw] sm:w-56 shrink-0 snap-start"
                  >
                    <ProductCard product={product} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {tab === "ai" ? (
            <section aria-live="polite" className="space-y-4">
              {trimmedQuery.length < 3 ? (
                <div className="card p-5">
                  <h2 className="text-base font-bold dark:text-slate-100">✨ Mode IA</h2>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    Décris ce qu’il te faut comme à un ami : « chawarma à moins de 1500f »,
                    « de quoi réviser la nuit », « pc pour autocad », « manger vite ce midi »…
                    L’IA extrait les mots-clés, ton budget et les boutiques ouvertes.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {["chawarma à moins de 1500f", "stylo bic", "chargeur disponible", "de quoi réviser la nuit"].map(
                      (example) => (
                        <button
                          key={example}
                          type="button"
                          onClick={() => setQuery(example)}
                          className="badge bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          {example}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              ) : aiLoading ? (
                <div className="card p-5">
                  <p className="animate-pulse text-sm text-slate-600 dark:text-slate-300">
                    ✨ Deep Search analyse ta demande et parcourt le catalogue du campus…
                  </p>
                </div>
              ) : aiError ? (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
                  {aiError}
                </p>
              ) : aiResult ? (
                <>
                  <div className="overflow-hidden rounded-2xl border border-teal-200 dark:border-teal-900">
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-teal-700 to-emerald-600 px-4 py-3 text-white">
                      <h2 className="text-base font-bold">✨ Résultats de Deep Search</h2>
                      <div className="flex items-center gap-2">
                        <span className="badge bg-white/20 text-white">
                          {aiResult.analysis.source === "gemini"
                            ? "Gemini"
                            : "Repli local"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setDetailsOpen((current) => !current)}
                          aria-expanded={detailsOpen}
                          aria-controls="deep-search-details"
                          className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25"
                        >
                          Détails <span aria-hidden>{detailsOpen ? "⌃" : "⌄"}</span>
                        </button>
                      </div>
                    </div>

                    {detailsOpen ? (
                      <div
                        id="deep-search-details"
                        className="space-y-2 bg-teal-50/70 px-4 py-3 text-sm text-teal-950 dark:bg-teal-950/40 dark:text-teal-50"
                      >
                        <p>{aiResult.analysis.summary}</p>
                        {aiResult.analysis.keywords.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-semibold opacity-70">Mots-clés :</span>
                            {aiResult.analysis.keywords.slice(0, 10).map((keyword) => (
                              <span
                                key={keyword}
                                className="badge bg-white/70 text-teal-900 dark:bg-teal-500/10 dark:text-teal-200"
                              >
                                {keyword}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <p className="text-xs">
                          Budget détecté :{" "}
                          <strong>
                            {aiResult.analysis.maxPrice
                              ? formatXof(aiResult.analysis.maxPrice)
                              : "aucun budget précisé"}
                          </strong>
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="card flex flex-wrap items-center gap-2 p-3">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Filtrer par :
                    </span>
                    {AI_FILTER_PILLS.map((pill) => {
                      const active = Boolean(aiFilters[pill.id]);
                      return (
                        <button
                          key={pill.id}
                          type="button"
                          onClick={() => toggleAiFilter(pill.id)}
                          aria-pressed={active}
                          className={`badge border px-3 py-1.5 transition-colors ${
                            active
                              ? "border-teal-700 bg-teal-700 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          }`}
                        >
                          {pill.label}
                        </button>
                      );
                    })}
                  </div>

                  {aiResult.relaxedPrice ? (
                    <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                      Aucun article dans ce budget — voici les alternatives les plus proches
                      du catalogue.
                    </p>
                  ) : null}

                  <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-base font-bold dark:text-slate-100">
                        {aiProducts.length} article{aiProducts.length > 1 ? "s" : ""}
                        <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                          {aiFilters.bestRated ? "mieux notés" : "classés par pertinence"}
                        </span>
                      </p>
                      {Object.values(aiFilters).some(Boolean) ? (
                        <button
                          type="button"
                          onClick={() => setAiFilters(EMPTY_AI_FILTERS)}
                          className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
                        >
                          Effacer les filtres
                        </button>
                      ) : null}
                    </div>

                    {aiProducts.length === 0 ? (
                      <div className="card p-8 text-center">
                        <p className="font-semibold">Aucun article trouvé</p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          Reformule ta demande, change de campus ou retire un filtre.
                        </p>
                        {Object.values(aiFilters).some(Boolean) ? (
                          <button
                            type="button"
                            onClick={() => setAiFilters(EMPTY_AI_FILTERS)}
                            className="btn-secondary mt-4"
                          >
                            Effacer les filtres
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                        {aiProducts.map((product) => (
                          <div key={product.id} className="min-w-0">
                            <ProductCard product={product} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </section>
          ) : tab === "shops" ? (
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold dark:text-slate-100">
                  Boutiques du campus
                  <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                    {shopResults.length} boutique{shopResults.length > 1 ? "s" : ""}
                  </span>
                </h2>
                {trimmedQuery ? (
                  <p className="text-xs text-slate-500">Boutiques pour « {trimmedQuery} »</p>
                ) : null}
              </div>

              {shopResults.length === 0 ? (
                <div className="card p-10 text-center">
                  <p className="text-lg font-semibold">Aucune boutique trouvée</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Essaie un autre nom ou change de campus.
                  </p>
                </div>
              ) : (
                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                  {shopResults.map((shop) => (
                    <div key={shop.slug} className="min-w-0">
                      <ShopCard shop={shop} />
                    </div>
                  ))}
                </div>
              )}
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
                      : "Les premières boutiques du campus arrivent très bientôt !"}
                  </p>
                  {hasFilters ? (
                    <button type="button" onClick={resetFilters} className="btn-secondary mt-4">
                      Réinitialiser les filtres
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                  {results.map((card) => (
                    <div key={card.slug} className="min-w-0">
                      <ProductCard product={card} />
                    </div>
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
