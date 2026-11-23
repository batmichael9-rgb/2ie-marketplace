import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  isConversationMember,
  listConversationMessages,
  markConversationRead,
} from "@/lib/messages";

/**
 * Fil de discussion en JSON, interrogé toutes les 5 secondes par le fil ouvert
 * pour faire apparaître les nouveaux messages sans recharger la page.
 *
 * La lecture marque aussi les messages reçus comme lus : le fil est réellement
 * sous les yeux de l'utilisateur.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { conversationId } = await params;

  if (!(await isConversationMember(conversationId, user.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await markConversationRead(conversationId, user.id);

  return NextResponse.json(
    { messages: await listConversationMessages(conversationId) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
