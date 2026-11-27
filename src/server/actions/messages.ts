"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listConversationMessages, markConversationRead, type MessageView } from "@/lib/messages";
import { notifyUserSafely } from "@/lib/push";
import { rateLimit } from "@/lib/rate-limit";
import { messageSchema } from "@/lib/validators";

/**
 * Ouvre (ou crée) la conversation entre le client connecté et le vendeur d'un
 * produit, puis redirige vers le fil `/messages?c=<id>`.
 *
 * La contrainte unique [buyerId, sellerId, productId] garantit qu'une même
 * paire client/vendeur sur un produit n'a qu'un seul fil.
 */
export async function startConversationAction(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const user = await requireUser("/");

  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      slug: true,
      vendorId: true,
      vendor: { select: { userId: true } },
    },
  });

  if (!product) redirect("/");

  // Un vendeur n'a pas de conversation avec lui-même.
  if (product.vendor.userId === user.id) {
    redirect(`/p/${product.slug}`);
  }

  const existing = await db.conversation.findFirst({
    where: { buyerId: user.id, sellerId: product.vendor.userId, productId: product.id },
    select: { id: true },
  });

  if (existing) redirect(`/messages?c=${existing.id}`);

  const created = await db.conversation.create({
    data: { buyerId: user.id, sellerId: product.vendor.userId, productId: product.id },
    select: { id: true },
  });

  revalidatePath("/messages");
  redirect(`/messages?c=${created.id}`);
}

/**
 * Même chose depuis une page commande : le fil est rattaché au premier produit
 * de la commande, et le vendeur comme l'acheteur peuvent l'ouvrir.
 */
export async function startOrderConversationAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const user = await requireUser("/mes-commandes");

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      reference: true,
      buyerId: true,
      vendor: { select: { userId: true } },
      items: { take: 1, select: { productId: true } },
    },
  });

  if (!order) redirect("/mes-commandes");

  const sellerId = order.vendor.userId;
  const isBuyer = order.buyerId === user.id;
  const isSeller = sellerId === user.id;

  if (!isBuyer && !isSeller && user.role !== "ADMIN") {
    redirect("/mes-commandes");
  }

  if (isBuyer && isSeller) {
    redirect(`/commande/${order.reference}`);
  }

  const productId = order.items[0]?.productId ?? null;

  const existing = await db.conversation.findFirst({
    where: { buyerId: order.buyerId, sellerId, productId },
    select: { id: true },
  });

  if (existing) redirect(`/messages?c=${existing.id}`);

  const created = await db.conversation.create({
    data: { buyerId: order.buyerId, sellerId, productId },
    select: { id: true },
  });

  revalidatePath("/messages");
  redirect(`/messages?c=${created.id}`);
}

export type SendMessageResult =
  | { ok: true; messages: MessageView[] }
  | { ok: false; error: string };

/**
 * Envoie un message et notifie le destinataire par Push Web (best effort).
 * Renvoie le fil complet pour que le client n'ait pas à recharger la page.
 */
export async function sendMessageAction(
  conversationId: string,
  rawContent: string,
): Promise<SendMessageResult> {
  const user = await requireUser("/messages");

  const parsed = messageSchema.safeParse({ conversationId, content: rawContent });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Message invalide.",
    };
  }

  const content = parsed.data.content;

  const conversation = await db.conversation.findFirst({
    where: { id: parsed.data.conversationId, OR: [{ buyerId: user.id }, { sellerId: user.id }] },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      product: { select: { name: true } },
    },
  });

  if (!conversation) return { ok: false, error: "Conversation introuvable." };

  // Anti-spam : 20 messages par minute et par compte. Le fil est actualisé
  // toutes les 5 s côté client, cette limite reste donc largement suffisante
  // pour une conversation normale.
  const limit = await rateLimit(`message:${user.id}`, 20, 60_000);
  if (!limit.ok) {
    return {
      ok: false,
      error: `Tu envoies des messages trop vite. Patiente ${limit.retryAfterSeconds} seconde${
        limit.retryAfterSeconds > 1 ? "s" : ""
      } avant de réessayer.`,
    };
  }

  await db.message.create({
    data: { conversationId: conversation.id, senderId: user.id, content },
  });

  // `updatedAt` remonte le fil en tête de liste chez les deux participants.
  await db.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  });

  const recipientId =
    conversation.buyerId === user.id ? conversation.sellerId : conversation.buyerId;
  const firstName = user.fullName.split(" ")[0] || "2iE Market";
  const preview = content.length > 120 ? `${content.slice(0, 117)}…` : content;

  await notifyUserSafely(recipientId, {
    title: `💬 Nouveau message de ${firstName}`,
    body: conversation.product ? `${conversation.product.name} — ${preview}` : preview,
    url: `/messages?c=${conversation.id}`,
    tag: `message-${conversation.id}`,
  });

  revalidatePath("/messages");
  revalidatePath("/", "layout");

  return { ok: true, messages: await listConversationMessages(conversation.id) };
}

/** Appelé par le fil ouvert pour effacer la pastille de non-lus. */
export async function markConversationReadAction(conversationId: string): Promise<void> {
  const user = await requireUser("/messages");
  await markConversationRead(conversationId, user.id);
}
