import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { MessageThread } from "@/components/message-thread";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/domain";
import {
  listConversationMessages,
  markConversationRead,
} from "@/lib/messages";

export const metadata: Metadata = { title: "Mes messages" };

// Les conversations changent en permanence : aucune mise en cache.
export const dynamic = "force-dynamic";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const user = await requireUser("/messages");
  const { c } = await searchParams;

  const conversations = await db.conversation.findMany({
    where: { OR: [{ buyerId: user.id }, { sellerId: user.id }] },
    orderBy: { updatedAt: "desc" },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          images: { orderBy: { position: "asc" }, take: 1, select: { url: true } },
        },
      },
      buyer: { select: { id: true, fullName: true } },
      seller: {
        select: {
          id: true,
          fullName: true,
          vendor: { select: { shopName: true } },
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, createdAt: true, senderId: true },
      },
    },
  });

  const conversationIds = conversations.map((conversation) => conversation.id);

  const unreadGroups =
    conversationIds.length > 0
      ? await db.message.groupBy({
          by: ["conversationId"],
          where: {
            conversationId: { in: conversationIds },
            isRead: false,
            senderId: { not: user.id },
          },
          _count: { _all: true },
        })
      : [];

  const unreadByConversation = new Map(
    unreadGroups.map((group) => [group.conversationId, group._count._all]),
  );

  const active = conversations.find((conversation) => conversation.id === c) ?? null;

  if (active) {
    await markConversationRead(active.id, user.id);
  }

  const messages = active ? await listConversationMessages(active.id) : [];
  const activeOther =
    active && active.buyerId === user.id ? active.seller : active?.buyer ?? null;
  const activeOtherName = active
    ? activeOther?.id === active.seller.id
      ? active.seller.vendor?.shopName ?? active.seller.fullName
      : active.buyer.fullName
    : "";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mes messages</h1>
        <p className="mt-1 text-sm text-slate-600">
          Discute directement avec les vendeurs du campus. Chaque message déclenche une
          notification Push si l&apos;application est installée.
        </p>
      </div>

      {conversations.length === 0 ? (
        <div className="card p-10 text-center">
          <MessageSquare className="mx-auto size-10 text-slate-300" aria-hidden />
          <p className="mt-3 text-lg font-semibold">Aucune conversation</p>
          <p className="mt-1 text-sm text-slate-600">
            Depuis une fiche produit, touche « Discuter avec le vendeur » pour démarrer un échange.
          </p>
          <Link href="/" className="btn-primary mt-4">
            Parcourir le catalogue
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:h-[calc(100dvh-15rem)] md:grid-cols-[320px_minmax(0,1fr)]">
          <section
            className={`${active ? "hidden md:flex" : "flex"} min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm`}
            aria-label="Liste des conversations"
          >
            <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-500">
              Conversations ({conversations.length})
            </h2>
            <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
              {conversations.map((conversation) => {
                const otherName =
                  conversation.buyerId === user.id
                    ? conversation.seller.vendor?.shopName ?? conversation.seller.fullName
                    : conversation.buyer.fullName;
                const unread =
                  conversation.id === active?.id
                    ? 0
                    : unreadByConversation.get(conversation.id) ?? 0;
                const last = conversation.messages[0];
                const isActive = conversation.id === active?.id;

                return (
                  <li key={conversation.id}>
                    <Link
                      href={`/messages?c=${conversation.id}`}
                      className={`flex gap-3 px-3 py-3 transition-colors ${
                        isActive ? "bg-teal-50/70" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="relative shrink-0">
                        {conversation.product?.images[0]?.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={conversation.product.images[0].url}
                            alt=""
                            className="size-11 rounded-xl object-cover"
                          />
                        ) : (
                          <span className="grid size-11 place-items-center rounded-xl bg-slate-100 text-sm font-bold text-slate-500">
                            {otherName.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        {unread > 0 ? (
                          <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-5 text-white">
                            {unread > 9 ? "9+" : unread}
                          </span>
                        ) : null}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-semibold">{otherName}</p>
                          {last ? (
                            <span className="shrink-0 text-[10px] text-slate-400">
                              {formatDate(last.createdAt)}
                            </span>
                          ) : null}
                        </div>
                        {conversation.product ? (
                          <p className="truncate text-xs font-medium text-teal-800">
                            {conversation.product.name}
                          </p>
                        ) : null}
                        <p
                          className={`truncate text-xs ${
                            unread > 0 ? "font-semibold text-slate-800" : "text-slate-500"
                          }`}
                        >
                          {last
                            ? `${last.senderId === user.id ? "Vous : " : ""}${last.content}`
                            : "Nouvelle conversation"}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>

          <section
            className={`${active ? "flex" : "hidden md:flex"} min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm`}
            aria-label="Fil de discussion"
          >
            {active ? (
              <MessageThread
                key={active.id}
                conversationId={active.id}
                currentUserId={user.id}
                initialMessages={messages}
                otherName={activeOtherName}
                productName={active.product?.name ?? null}
              />
            ) : (
              <div className="grid flex-1 place-items-center p-10 text-center">
                <div>
                  <MessageSquare className="mx-auto size-10 text-slate-300" aria-hidden />
                  <p className="mt-3 font-semibold">Choisis une conversation</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Sélectionne un fil à gauche pour afficher les messages.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
