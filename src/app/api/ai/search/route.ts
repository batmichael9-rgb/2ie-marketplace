import { NextResponse, after } from "next/server";
import { searchProductsIntelligently } from "@/lib/ai-search";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordPreferenceSignal } from "@/lib/preferences";

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

  const user = await getCurrentUser();

  try {
    const outcome = await searchProductsIntelligently(query);

    // Le signal de recherche sert aux recommandations : il part après la
    // réponse pour ne pas allonger l'attente de l'étudiant.
    if (user) {
      after(async () => {
        const firstCategory = outcome.categories[0]
          ? await db.category.findUnique({
              where: { slug: outcome.categories[0] },
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
