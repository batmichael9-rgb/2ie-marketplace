"use client";

import { ChevronLeft, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MessageView } from "@/lib/messages";
import { sendMessageAction } from "@/server/actions/messages";

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Fil de discussion d'une conversation.
 *
 * Les nouveaux messages arrivent sans action de l'utilisateur : le composant
 * interroge `/api/messages/<id>` toutes les 5 secondes. L'envoi est optimiste
 * (le message apparaît immédiatement) puis confirmé par la Server Action.
 */
export function MessageThread({
  conversationId,
  currentUserId,
  initialMessages,
  otherName,
  productName,
}: {
  conversationId: string;
  currentUserId: string;
  initialMessages: MessageView[];
  otherName: string;
  productName: string | null;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    let cancelled = false;

    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/messages/${conversationId}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { messages: MessageView[] };
        if (!cancelled) setMessages(data.messages);
      } catch {
        // Coupure réseau passagère : la prochaine interrogation réessaiera.
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [conversationId]);

  async function send() {
    const content = draftRef.current.trim();
    if (!content || sending) return;

    setSending(true);
    setError(null);
    setDraft("");

    const optimistic: MessageView = {
      id: `local-${Date.now()}`,
      senderId: currentUserId,
      content,
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);

    const result = await sendMessageAction(conversationId, content);

    if (result.ok) {
      setMessages(result.messages);
    } else {
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      setDraft(content);
      setError(result.error);
    }

    setSending(false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <a
          href="/messages"
          className="btn-ghost !px-2 !py-1 md:hidden"
          aria-label="Revenir aux conversations"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </a>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold dark:text-slate-100">{otherName}</p>
          {productName ? (
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              À propos de {productName}
            </p>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-4 py-4 dark:bg-slate-950/40">
        {messages.length === 0 ? (
          <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-300">
            Aucun message pour l&apos;instant. Présente-toi et pose ta question sur le produit :
            le vendeur reçoit une notification.
          </p>
        ) : null}

        {messages.map((message) => {
          const mine = message.senderId === currentUserId;
          return (
            <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                  mine
                    ? "rounded-br-sm bg-teal-700 text-white"
                    : "rounded-bl-sm border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                }`}
              >
                <p className="whitespace-pre-line break-words">{message.content}</p>
                <p
                  className={`mt-1 text-right text-[10px] ${
                    mine ? "text-teal-100" : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {formatTime(message.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p>
      ) : null}

      <form
        className="flex items-end gap-2 border-t border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Écris ton message…"
          aria-label="Ton message"
          className="input max-h-32 min-h-11 flex-1 resize-none py-2.5"
        />
        <button
          type="submit"
          disabled={sending || draft.trim().length === 0}
          className="btn-primary !px-3 !py-2.5"
          aria-label="Envoyer le message"
        >
          <Send className="size-5" aria-hidden />
        </button>
      </form>
    </div>
  );
}
