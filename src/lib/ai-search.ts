import "server-only";

import type { ProductCardData } from "@/components/product-card";
import { CATEGORIES } from "@/lib/categories";
import { db } from "@/lib/db";
import { matchesSearchQuery, normalizeSearchText } from "@/lib/domain";

export type AiSearchSource = "gemini" | "local";

/** Filtres cumulables de la rangée « Filtrer par : ». */
export type AiSearchFilters = {
  openOnly?: boolean;
  inStock?: boolean;
  maxPrice?: number | null;
  reservableOnly?: boolean;
  bestRated?: boolean;
};

/** Ce que l'IA (ou le repli local) a compris de la demande. */
export type AiSearchAnalysis = {
  keywords: string[];
  maxPrice: number | null;
  onlyOpen: boolean;
  summary: string;
  categories: string[];
  source: AiSearchSource;
};

export type AiSearchOutcome = {
  analysis: AiSearchAnalysis;
  products: ProductCardData[];
  /** Vrai quand le budget strict n'a rien donné et a été relâché. */
  relaxedPrice: boolean;
};

type AnalysisResult = {
  keywords: string[];
  categories: string[];
  maxPrice: number | null;
  onlyOpen: boolean;
  summary: string | null;
  source: AiSearchSource;
};

const CATEGORY_SLUGS = new Set(CATEGORIES.map((category) => category.slug));
const CATEGORY_NAMES = new Map(CATEGORIES.map((category) => [category.slug, category.name]));

/**
 * Dictionnaire d'expansion sémantique « vie de campus ».
 *
 * Il rend la recherche IA utile même sans clé Gemini : « de quoi réviser la
 * nuit » comprend lampe, café, cahier, etc. Les motifs sont écrits sans accent
 * car la requête est normalisée avant comparaison.
 */
const LOCAL_RULES: { pattern: RegExp; keywords: string[]; categories: string[] }[] = [
  {
    pattern: /\b(revis|revision|examen|devoir|etudi|apprendre|nuit|tard|veille|memoire|these)/,
    keywords: ["lampe", "éclairage", "café", "thé", "cahier", "livre", "bureau", "ordinateur"],
    categories: ["lumiere-eclairage", "boissons-snacks", "materiel-scolaire-livres"],
  },
  {
    pattern: /\b(mang|faim|affam|repas|nourriture|dejeuner|diner|gouter|snack|cantine|boire|soif|vite|entre deux cours)/,
    keywords: ["nourriture", "repas", "boissons", "snacks", "eau", "jus", "sandwich"],
    categories: ["nourriture-repas", "boissons-snacks"],
  },
  {
    pattern: /\b(autocad|cao|dao|pc|ordinateur|portable|laptop|cod|programm|informatique|logiciel|ram|clavier|souris|imprim|scanner)/,
    keywords: ["ordinateur", "informatique", "pc", "clavier", "souris", "logiciel", "autocad", "ram"],
    categories: ["informatique-ordinateurs", "electronique-grand-public"],
  },
  {
    pattern: /\b(telephone|tel|batterie|chargeur|cable|powerbank|ecouteur|casque|smartphone|android|iphone|recharge)/,
    keywords: ["téléphone", "chargeur", "câble", "batterie", "powerbank", "écouteurs"],
    categories: ["telephones-accessoires", "electronique-grand-public"],
  },
  {
    pattern: /\b(chaussure|basket|sneaker|sandale|sac|sport|foot|course|gym|muscu)/,
    keywords: ["chaussures", "baskets", "sac", "sport", "football", "tapis"],
    categories: ["chaussures-sacs", "sports-loisirs", "vetements-sport-plein-air"],
  },
  {
    pattern: /\b(beaute|parfum|creme|savon|cosmetique|soin|maquillage|cheveux)/,
    keywords: ["beauté", "parfum", "crème", "savon", "cosmétique"],
    categories: ["beaute-parfums", "produits-beaute"],
  },
  {
    pattern: /\b(habit|vetement|t-shirt|chemise|pantalon|robe|mode|imperméable|veste)/,
    keywords: ["vêtements", "t-shirt", "chemise", "pantalon", "robe", "veste"],
    categories: ["mode-vetements", "vetements-accessoires"],
  },
  {
    pattern: /\b(chambre|lit|matelas|meuble|chaise|bureau|ventilo|ventilateur|chauffe|cuisine|assiette|marmite)/,
    keywords: ["chambre", "lit", "matelas", "ventilateur", "meuble", "cuisine"],
    categories: ["meubles", "electromenager", "maison-jardin"],
  },
  {
    pattern: /\b(panneau|solaire|onduleur|electric|lampe|eclairage|lumiere|batterie|generateur)/,
    keywords: ["solaire", "panneau", "onduleur", "lampe", "éclairage", "batterie"],
    categories: ["energies-renouvelables", "lumiere-eclairage", "equipements-fournitures-electriques"],
  },
  {
    pattern: /\b(ciment|construction|outil|bricolage|quincaillerie|peinture|maçon|macon|plomberie)/,
    keywords: ["ciment", "construction", "outil", "quincaillerie", "peinture"],
    categories: ["construction-immobilier", "bricolage-quincaillerie", "machines-batiment-construction"],
  },
  {
    pattern: /\b(livre|cahier|stylo|calculatrice|fourniture|photocopie|classeur|agenda)/,
    keywords: ["livre", "cahier", "stylo", "calculatrice", "fourniture"],
    categories: ["materiel-scolaire-livres"],
  },
  {
    pattern: /\b(moto|velo|voiture|transport|piece|pneu|essence|carburant)/,
    keywords: ["moto", "vélo", "voiture", "pièce", "pneu"],
    categories: ["vehicules-transport", "pieces-accessoires-vehicules"],
  },
];

/**
 * Variantes orthographiques et synonymes courants sur le campus, utilisés par
 * le repli local : « chawarma » doit retrouver « shawarma », « bic » un stylo.
 */
const SYNONYMS: Record<string, string[]> = {
  shawarma: ["shawarma", "chawarma", "chawarma poulet"],
  chawarma: ["shawarma", "chawarma"],
  bic: ["bic", "stylo", "stylo bille"],
  stylo: ["stylo", "bic", "stylo bille"],
  tel: ["téléphone", "portable", "smartphone"],
  telephone: ["téléphone", "portable", "smartphone"],
  portable: ["ordinateur portable", "pc portable", "laptop", "téléphone"],
  pc: ["ordinateur", "pc", "laptop"],
  ordi: ["ordinateur", "pc", "laptop"],
  clé: ["clé usb", "cle usb", "usb"],
  cle: ["clé usb", "cle usb", "usb"],
  écouteurs: ["écouteurs", "casque", "airpods"],
  ecouteurs: ["écouteurs", "casque", "airpods"],
  bouffe: ["nourriture", "repas", "snack"],
  bouffer: ["nourriture", "repas", "snack"],
  flotte: ["eau", "boisson"],
  recharge: ["recharge", "crédit téléphonique", "forfait"],
  cahier: ["cahier", "carnet", "bloc notes"],
  savon: ["savon", "détergent", "lessive"],
};

// Mots vides français : inutiles comme mots-clés produits, ils polluaient le
// score (« de quoi réviser la nuit » ajoutait « quoi »).
const STOPWORDS = new Set([
  "les", "des", "une", "pour", "avec", "sans", "dans", "sur", "sous",
  "entre", "quoi", "que", "qui", "comment", "mon", "mes", "ton", "tes",
  "cet", "cette", "elle", "nous", "vous", "ils", "aux", "et", "ou", "en",
  "est", "sont", "plus", "moins", "besoin", "cherche", "recherche", "trouver",
  "acheter", "avoir", "faire", "the", "and",
]);

function toPrice(raw: string | undefined): number | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const amount = Number.parseInt(digits, 10);
  // Un budget réaliste sur le campus : on ignore les valeurs aberrantes.
  if (!Number.isFinite(amount) || amount < 25 || amount > 10_000_000) return null;
  return amount;
}

/** Extrait un budget du type « 1500f », « moins de 2 000 FCFA », « budget 5.000 ». */
function extractMaxPrice(query: string): number | null {
  const normalized = normalizeSearchText(query);

  const explicit = normalized.match(
    /(?:moins de|maximum|max|budget(?: de)?|sous|pas plus de|<=?)\s*([0-9][0-9\s.,]*)\s*(?:f|fcfa|cfa|francs?)?\b/,
  );
  const withCurrency = normalized.match(/([0-9][0-9\s.,]*)\s*(?:f\b|fcfa|cfa|francs?)/);
  const trailingF = normalized.match(/(?:^|\s)([0-9]{2,7})\s*f\b/);

  return (
    toPrice(explicit?.[1]) ??
    toPrice(withCurrency?.[1]) ??
    toPrice(trailingF?.[1]) ??
    null
  );
}

function detectOpenIntent(query: string): boolean {
  return /\b(disponible|maintenant|tout de suite|ouvert|ouverte|rapidement|vite|aujourd hui|aujourdhui|ce soir|immediat)/.test(
    normalizeSearchText(query),
  );
}

function localSummary(
  query: string,
  categories: string[],
  maxPrice: number | null,
  onlyOpen: boolean,
): string {
  const names = categories
    .map((slug) => CATEGORY_NAMES.get(slug))
    .filter((name): name is string => Boolean(name))
    .slice(0, 2);

  let summary = `J'ai compris : « ${query.trim()} »`;
  if (maxPrice) summary += `, avec un budget maximum de ${maxPrice} FCFA`;
  if (onlyOpen) summary += ", uniquement dans les boutiques ouvertes";
  if (names.length > 0) summary += ` — pistes : ${names.join(" et ")}`;
  return `${summary}.`;
}

function localAnalysis(query: string): AnalysisResult {
  const normalized = normalizeSearchText(query);
  const keywords = new Set<string>();
  const categories = new Set<string>();

  for (const rule of LOCAL_RULES) {
    if (!rule.pattern.test(normalized)) continue;
    for (const keyword of rule.keywords) keywords.add(keyword);
    for (const category of rule.categories) {
      if (CATEGORY_SLUGS.has(category)) categories.add(category);
    }
  }

  // Les mots saisis servent aussi de mots-clés : « caracolo » doit continuer à
  // fonctionner même s'il n'est pas dans le dictionnaire.
  for (const word of normalized.split(/[^a-z0-9]+/)) {
    if (word.length >= 3 && !STOPWORDS.has(word) && !/^\d+$/.test(word)) {
      keywords.add(word);
      for (const synonym of SYNONYMS[word] ?? []) keywords.add(synonym);
    }
  }

  const maxPrice = extractMaxPrice(query);
  const onlyOpen = detectOpenIntent(query);

  return {
    keywords: [...keywords].slice(0, 20),
    categories: [...categories].slice(0, 4),
    maxPrice,
    onlyOpen,
    summary: localSummary(query, [...categories], maxPrice, onlyOpen),
    source: "local",
  };
}

const GEMINI_TIMEOUT_MS = 3_000;

async function geminiAnalysis(query: string): Promise<AnalysisResult | null> {
  const apiKey =
    process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return null;

  const systemPrompt = [
    "Tu es le moteur de recherche du marketplace de l'Institut 2iE au Burkina Faso.",
    "À partir d'une demande en français, renvoie une analyse structurée pour la recherche.",
    `Catégories autorisées (slugs exacts) : ${[...CATEGORY_SLUGS].join(", ")}.`,
    "Réponds uniquement en JSON valide, sans texte autour, avec la forme :",
    '{"keywords": ["..."], "maxPrice": 1500, "onlyOpen": false, "summary": "une phrase courte", "categories": ["slug"]}.',
    "keywords : noms d'objets ou d'aliments vendables + synonymes et variantes orthographiques locales (shawarma/chawarma, bic/stylo).",
    "maxPrice : budget maximum en FCFA si la demande en mentionne un, sinon null.",
    "onlyOpen : true seulement si la personne veut quelque chose de disponible immédiatement.",
    "summary : une phrase de 20 mots maximum qui résume ce que tu as compris.",
  ].join(" ");

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: query }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 300,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")) as {
      keywords?: unknown;
      categories?: unknown;
      maxPrice?: unknown;
      onlyOpen?: unknown;
      summary?: unknown;
    };

    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 20)
      : [];

    const categories = Array.isArray(parsed.categories)
      ? parsed.categories
          .filter((value): value is string => typeof value === "string" && CATEGORY_SLUGS.has(value))
          .slice(0, 4)
      : [];

    const maxPrice =
      typeof parsed.maxPrice === "number" && Number.isFinite(parsed.maxPrice)
        ? toPrice(String(Math.round(parsed.maxPrice)))
        : typeof parsed.maxPrice === "string"
          ? toPrice(parsed.maxPrice)
          : null;

    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim().length > 0
        ? parsed.summary.trim().slice(0, 240)
        : null;

    if (keywords.length === 0 && categories.length === 0) return null;

    return {
      keywords,
      categories,
      maxPrice,
      onlyOpen: parsed.onlyOpen === true,
      summary,
      source: "gemini",
    };
  } catch (error) {
    // Quota dépassé, panne réseau, timeout 3 s ou JSON invalide : repli local.
    console.warn("Analyse Gemini indisponible, repli local", error);
    return null;
  }
}

type SearchProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceXof: number;
  stockMode: string;
  stockQty: number;
  lowStockThreshold: number;
  isReservable: boolean;
  createdAt: Date;
  images: { url: string }[];
  category: { name: string; slug: string } | null;
  vendor: {
    shopName: string;
    slug: string;
    roomNumber: string | null;
    campus: string | null;
    isOpen: boolean;
  };
  reviews: { rating: number }[];
};

function toCard(product: SearchProduct): ProductCardData {
  const average =
    product.reviews.length > 0
      ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviews.length
      : 0;

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    priceXof: product.priceXof,
    stockMode: product.stockMode,
    stockQty: product.stockQty,
    lowStockThreshold: product.lowStockThreshold,
    isReservable: product.isReservable,
    images: product.images,
    vendor: product.vendor,
    rating: { average, count: product.reviews.length },
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scoreProduct(
  product: SearchProduct,
  keywords: string[],
  categories: string[],
): { score: number; rating: number; matched: boolean } {
  const name = normalizeSearchText(product.name);
  const description = normalizeSearchText(product.description);
  const categoryName = normalizeSearchText(product.category?.name ?? "");
  const categorySlug = product.category?.slug ?? "";
  const haystack = `${name} ${description} ${categoryName}`;

  // Le score de pertinence textuelle est séparé de la note/fraîcheur : sans
  // correspondance de mot-clé, un produit ne doit pas être recommandé juste
  // parce qu'il est récent (sinon toute la catégorie remonte).
  let relevance = 0;

  for (const keyword of keywords) {
    const term = normalizeSearchText(keyword);
    if (!term) continue;

    // Pour les mots courts (« eau »), une inclusion nue ferait correspondre
    // « tableau » : on exige un mot entier. Les expressions de plusieurs mots
    // restent cherchées en inclusion.
    const singleWord = !term.includes(" ");
    const wordBoundary = new RegExp(`(^|[^a-z0-9])${escapeRegex(term)}([^a-z0-9]|$)`);
    const inName = singleWord ? wordBoundary.test(name) : name.includes(term);
    const inCategory = singleWord ? wordBoundary.test(categoryName) : categoryName.includes(term);
    const inDescription = singleWord
      ? wordBoundary.test(description)
      : description.includes(term);

    if (inName) relevance += 4;
    else if (inCategory) relevance += 2.5;
    else if (inDescription) relevance += 1.5;
    else if (term.length >= 4 && matchesSearchQuery(haystack, term)) relevance += 1;
  }

  // Correspondance forte de catégorie déduite de l'intention.
  if (categorySlug && categories.includes(categorySlug)) relevance += 3;

  const average =
    product.reviews.length > 0
      ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviews.length
      : 0;

  const ageDays = (Date.now() - product.createdAt.getTime()) / (24 * 60 * 60 * 1000);
  const qualityBonus = (average / 5) * 1.5 + (ageDays <= 30 ? 0.5 : 0);

  return { score: relevance + qualityBonus, rating: average, matched: relevance > 0 };
}

/** Critères Prisma appliqués aux produits pour les pilules cumulables. */
function buildWhere(maxPrice: number | null, openOnly: boolean, filters: AiSearchFilters) {
  return {
    isActive: true,
    ...(openOnly ? { vendor: { is: { isOpen: true, isActive: true } } } : {}),
    ...(filters.inStock
      ? {
          stockMode: { not: "OUT_OF_STOCK" },
          OR: [{ stockMode: { not: "TRACKED" } }, { stockQty: { gt: 0 } }],
        }
      : {}),
    ...(maxPrice !== null ? { priceXof: { lte: maxPrice } } : {}),
    ...(filters.reservableOnly ? { isReservable: true } : {}),
  };
}

async function findCandidates(maxPrice: number | null, openOnly: boolean, filters: AiSearchFilters) {
  return db.product.findMany({
    where: buildWhere(maxPrice, openOnly, filters),
    include: {
      images: { orderBy: { position: "asc" }, take: 1 },
      category: { select: { name: true, slug: true } },
      vendor: {
        select: {
          shopName: true,
          slug: true,
          roomNumber: true,
          campus: true,
          isOpen: true,
        },
      },
      reviews: { where: { isVisible: true }, select: { rating: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
}

export async function searchProductsIntelligently(
  query: string,
  filters: AiSearchFilters = {},
): Promise<AiSearchOutcome> {
  const trimmed = query.trim().slice(0, 200);
  const local = localAnalysis(trimmed);
  const gemini = await geminiAnalysis(trimmed);

  const sources = gemini ? [gemini, local] : [local];
  const analysis: AiSearchAnalysis = {
    keywords: [...new Set(sources.flatMap((item) => item.keywords))].slice(0, 20),
    categories: [...new Set(sources.flatMap((item) => item.categories))].slice(0, 4),
    maxPrice: gemini?.maxPrice ?? local.maxPrice,
    onlyOpen: Boolean(gemini?.onlyOpen) || local.onlyOpen,
    summary: gemini?.summary ?? local.summary ?? "",
    source: gemini ? "gemini" : "local",
  };

  const openOnly = analysis.onlyOpen || Boolean(filters.openOnly);

  // Budget : le plus contraignant entre ce que l'IA a détecté et la pilule
  // « Moins de 1 500 FCFA ».
  const budgets = [analysis.maxPrice, filters.maxPrice ?? null].filter(
    (value): value is number => typeof value === "number" && value > 0,
  );
  const strictMaxPrice = budgets.length > 0 ? Math.min(...budgets) : null;

  const rank = (products: SearchProduct[]) =>
    products
      .map((product) => ({
        product,
        ...scoreProduct(product, analysis.keywords, analysis.categories),
      }))
      .filter((item) => item.matched)
      .sort((a, b) => {
        if (filters.bestRated) {
          const byRating = (b.rating || 0) - (a.rating || 0);
          if (byRating !== 0) return byRating;
        }
        return (
          b.score - a.score ||
          b.product.createdAt.getTime() - a.product.createdAt.getTime()
        );
      })
      .slice(0, 12)
      .map((item) => toCard(item.product));

  let relaxedPrice = false;
  let candidates = await findCandidates(strictMaxPrice, openOnly, filters);
  let products = rank(candidates);

  // Aucun résultat exact sous le budget : on relâche uniquement la contrainte
  // de prix pour proposer les alternatives les plus proches.
  if (products.length === 0 && strictMaxPrice !== null) {
    relaxedPrice = true;
    candidates = await findCandidates(null, openOnly, filters);
    products = rank(candidates);
  }

  return {
    analysis,
    products,
    relaxedPrice,
  };
}
