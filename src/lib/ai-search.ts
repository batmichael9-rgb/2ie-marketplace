import "server-only";

import type { ProductCardData } from "@/components/product-card";
import { CATEGORIES } from "@/lib/categories";
import { db } from "@/lib/db";
import { matchesSearchQuery, normalizeSearchText } from "@/lib/domain";

export type AiSearchSource = "gemini" | "local";

export type AiSearchOutcome = {
  answer: string;
  keywords: string[];
  categories: string[];
  products: ProductCardData[];
  source: AiSearchSource;
};

type SearchAnalysis = {
  keywords: string[];
  categories: string[];
  advice: string | null;
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

// Mots vides français : inutiles comme mots-clés produits, ils polluaient le
// score (« de quoi réviser la nuit » ajoutait « quoi »).
const STOPWORDS = new Set([
  "les", "des", "une", "pour", "avec", "sans", "dans", "sur", "sous",
  "entre", "quoi", "que", "qui", "comment", "mon", "mes", "ton", "tes",
  "cet", "cette", "elle", "nous", "vous", "ils", "aux", "et", "ou", "en",
  "est", "sont", "plus", "moins", "besoin", "cherche", "recherche", "trouver",
  "acheter", "avoir", "faire", "the", "and",
]);

function localAnalysis(query: string): SearchAnalysis {
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
    if (word.length >= 3 && !STOPWORDS.has(word)) keywords.add(word);
  }

  return {
    keywords: [...keywords].slice(0, 16),
    categories: [...categories].slice(0, 4),
    advice: null,
    source: "local",
  };
}

function localAnswer(query: string, categories: string[]): string {
  const names = categories
    .map((slug) => CATEGORY_NAMES.get(slug))
    .filter((name): name is string => Boolean(name))
    .slice(0, 2);

  if (names.length === 0) {
    return `J'ai cherché les articles du campus qui correspondent à « ${query.trim()} ». Les résultats sont classés par pertinence.`;
  }

  return `Voici les articles du campus les plus adaptés à « ${query.trim()} », notamment en ${names.join(" et ")}.`;
}

async function geminiAnalysis(query: string): Promise<SearchAnalysis | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const systemPrompt = [
    "Tu es l'assistant d'achat des étudiants de l'Institut 2iE au Burkina Faso.",
    "À partir d'une demande en français, extrais des mots-clés de produits concrets",
    "et les catégories probables du catalogue.",
    `Catégories autorisées (slugs exacts) : ${[...CATEGORY_SLUGS].join(", ")}.`,
    "Réponds uniquement en JSON valide, sans texte autour, avec la forme :",
    '{"keywords": ["..."], "categories": ["slug"], "advice": "une phrase courte en français"}.',
    "Les keywords doivent être des noms d'objets ou d'aliments vendables, jamais des phrases.",
  ].join(" ");

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(6000),
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
      advice?: unknown;
    };

    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 16)
      : [];

    const categories = Array.isArray(parsed.categories)
      ? parsed.categories
          .filter((value): value is string => typeof value === "string" && CATEGORY_SLUGS.has(value))
          .slice(0, 4)
      : [];

    const advice =
      typeof parsed.advice === "string" && parsed.advice.trim().length > 0
        ? parsed.advice.trim().slice(0, 240)
        : null;

    if (keywords.length === 0 && categories.length === 0) return null;

    return { keywords, categories, advice, source: "gemini" };
  } catch (error) {
    // Quota dépassé, panne réseau, JSON invalide : on retombe sur le local.
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
): { score: number; matched: boolean } {
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
    const inCategory = singleWord
      ? wordBoundary.test(categoryName)
      : categoryName.includes(term);
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

  return { score: relevance + qualityBonus, matched: relevance > 0 };
}

export async function searchProductsIntelligently(query: string): Promise<AiSearchOutcome> {
  const trimmed = query.trim().slice(0, 200);
  const local = localAnalysis(trimmed);
  const gemini = await geminiAnalysis(trimmed);

  const keywords = [...new Set([...(gemini?.keywords ?? []), ...local.keywords])].slice(0, 20);
  const categories = [...new Set([...(gemini?.categories ?? []), ...local.categories])].slice(0, 4);

  const products = await db.product.findMany({
    where: {
      isActive: true,
      stockMode: { not: "OUT_OF_STOCK" },
      OR: [{ stockMode: { not: "TRACKED" } }, { stockQty: { gt: 0 } }],
    },
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

  const ranked = products
    .map((product) => ({
      product,
      ...scoreProduct(product, keywords, categories),
    }))
    .filter((item) => item.matched)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.product.createdAt.getTime() - a.product.createdAt.getTime(),
    )
    .slice(0, 8);

  // Aucun article ne correspond réellement : on le dit plutôt que d'afficher
  // des produits hors sujet. La phrase reste utile et propose une alternative.
  if (ranked.length === 0) {
    return {
      answer: `Je n'ai pas encore trouvé d'article du campus pour « ${trimmed} ». Essaie avec un autre mot, ou parcours les catégories juste au-dessus.`,
      keywords,
      categories,
      products: [],
      source: gemini ? "gemini" : "local",
    };
  }

  return {
    answer: gemini?.advice ?? localAnswer(trimmed, categories),
    keywords,
    categories,
    products: ranked.map((item) => toCard(item.product)),
    source: gemini ? "gemini" : "local",
  };
}
