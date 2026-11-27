import { NextResponse, after } from "next/server";
import {
  searchProductsIntelligently,
  type AiSearchFilters,
} from "@/lib/ai-search";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordPreferenceSignal } from "@/lib/preferences";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Recherche en langage naturel.
 *
 * Gemini est utilisé s'il est configuré ; sinon (ou en cas de quota dépassé)
 * l'expansion sémantique locale prend le relais. La réponse contient toujours
 * des produits classés par score et une phrase d'assistant.
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const query =
    typeof payload === "object" && payload !== null && "query" in payload
      ? String((payload as { query: unknown }).query ?? "").trim()
      : "";

  if (query.length < 2) {
    return NextResponse.json(
      { error: "Décris ce que tu cherches en quelques mots." },
      { status: 400 },
    );
  }

  if (query.length > 300) {
    return NextResponse.json(
      { error: "Recherche trop longue : 300 caractères maximum." },
      { status: 400 },
    );
  }

  // La recherche appelle éventuellement un modèle payant : on limite les
  // rafales par IP pour éviter un déni de service ou une facture incontrôlée.
  const ip = await getClientIp();
  const limit = await rateLimit(`ai-search:${ip}`, 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: `Trop de recherches en peu de temps. Patiente ${limit.retryAfterSeconds} seconde${
          limit.retryAfterSeconds > 1 ? "s" : ""
        }.`,
      },
      { status: 429 },
    );
  }

  const rawFilters =
    typeof payload === "object" && payload !== null && "filters" in payload
      ? (payload as { filters?: unknown }).filters
      : null;
  const filters: AiSearchFilters = {};
  if (typeof rawFilters === "object" && rawFilters !== null) {
    const value = rawFilters as Record<string, unknown>;
    if (value.openOnly === true) filters.openOnly = true;
    if (value.inStock === true) filters.inStock = true;
    if (value.reservableOnly === true) filters.reservableOnly = true;
    if (value.bestRated === true) filters.bestRated = true;
    if (typeof value.maxPrice === "number" && value.maxPrice > 0) {
      filters.maxPrice = Math.round(value.maxPrice);
    }
  }

  const user = await getCurrentUser();

  try {
    const outcome = await searchProductsIntelligently(query, filters);

    // Le signal de recherche sert aux recommandations : il part après la
    // réponse pour ne pas allonger l'attente de l'étudiant.
    if (user) {
      after(async () => {
        const firstCategory = outcome.analysis.categories[0]
          ? await db.category.findUnique({
              where: { slug: outcome.analysis.categories[0] },
              select: { id: true },
            })
          : null;

        await recordPreferenceSignal({
          userId: user.id,
          actionType: "SEARCH",
          query,
          categoryId: firstCategory?.id ?? null,
        });
      });
    }

    return NextResponse.json(outcome, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Recherche intelligente impossible", error);
    return NextResponse.json(
      { error: "La recherche intelligente est momentanément indisponible." },
      { status: 500 },
    );
  }
}
