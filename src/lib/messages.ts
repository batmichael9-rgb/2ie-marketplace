import "server-only";

import { db } from "@/lib/db";

/** Message sérialisé pour le client (dates en ISO, JSON-safe). */
export type MessageView = {
  id: string;
  senderId: string;
  content: string;
  isRead: boolean;
  createdAt: string;
};

export async function listConversationMessages(
  conversationId: string,
): Promise<MessageView[]> {
  const rows = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 300,
    select: { id: true, senderId: true, content: true, isRead: true, createdAt: true },
  });

  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

/** Marque comme lus les messages reçus dans une conversation ouverte. */
export async function markConversationRead(
  conversationId: string,
  readerId: string,
): Promise<void> {
  // Le filtre sur le participant empêche de marquer comme lus les messages
  // d'une conversation dont on n'est pas membre (IDOR en écriture).
  await db.message.updateMany({
    where: {
      conversationId,
      isRead: false,
      senderId: { not: readerId },
      conversation: { OR: [{ buyerId: readerId }, { sellerId: readerId }] },
    },
    data: { isRead: true },
  });
}

/** Total des messages non lus, toutes conversations confondues. */
export async function countUnreadMessages(userId: string): Promise<number> {
  return db.message.count({
    where: {
      isRead: false,
      senderId: { not: userId },
      conversation: { OR: [{ buyerId: userId }, { sellerId: userId }] },
    },
  });
}

/** Vérifie que l'utilisateur participe bien à la conversation. */
export async function isConversationMember(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, OR: [{ buyerId: userId }, { sellerId: userId }] },
    select: { id: true },
  });

  return Boolean(conversation);
}
