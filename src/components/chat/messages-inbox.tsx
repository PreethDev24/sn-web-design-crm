"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, MessageSquare, Send } from "lucide-react";
import {
  fetchTypingPresence,
  markConversationRead,
  sendMessage,
  sendPing,
  setTypingPresence,
} from "@/lib/actions/messages";
import type { ChatPartnerOption, Conversation, DbUser, Message } from "@/lib/types";
import { cn, fullName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NewChatDialog } from "@/components/chat/new-chat-dialog";

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function roleLabel(role: DbUser["role"]) {
  if (role === "owner") return "Owner";
  if (role === "sales") return "Sales";
  return "Client";
}

function partnerLabel(user: DbUser | null | undefined) {
  if (!user) return "Unknown";
  return fullName(user.first_name, user.last_name);
}

function partnerContext(
  user: DbUser | null | undefined,
  byId: Map<string, ChatPartnerOption>
) {
  if (!user) return null;
  return byId.get(user.id)?.context_label ?? user.company_name ?? null;
}

function isPingMessage(message: Message) {
  return message.kind === "ping" || message.body === "🔔 Ping";
}

function previewBody(message: Message | null | undefined) {
  if (!message) return "No messages yet";
  if (isPingMessage(message)) return "🔔 Ping";
  return message.body;
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
    </span>
  );
}

type MessagesInboxProps = {
  viewer: DbUser;
  conversations: Conversation[];
  partners: ChatPartnerOption[];
  activeConversationId: string | null;
  messages: Message[];
  basePath: string;
  subtitle: string;
};

export function MessagesInbox({
  viewer,
  conversations,
  partners,
  activeConversationId,
  messages,
  basePath,
  subtitle,
}: MessagesInboxProps) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [typingName, setTypingName] = useState<string | null>(null);
  const [pingCooldownUntil, setPingCooldownUntil] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);

  const active = conversations.find((c) => c.id === activeConversationId) ?? null;
  const partnerById = new Map(partners.map((p) => [p.id, p]));
  const activeContext = partnerContext(active?.partner, partnerById);
  const pingReady = Date.now() >= pingCooldownUntil;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeConversationId, partnerTyping]);

  useEffect(() => {
    if (!activeConversationId || !active?.unread_count) return;
    void markConversationRead(activeConversationId).catch(() => undefined);
  }, [activeConversationId, active?.unread_count]);

  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), 8000);
    return () => window.clearInterval(id);
  }, [router]);

  useEffect(() => {
    setPartnerTyping(Boolean(active?.partner_is_typing));
    setTypingName(active?.partner ? partnerLabel(active.partner) : null);
  }, [active?.partner_is_typing, active?.partner, activeConversationId]);

  useEffect(() => {
    if (!activeConversationId) return;
    let cancelled = false;

    async function poll() {
      try {
        const presence = await fetchTypingPresence(activeConversationId!);
        if (cancelled) return;
        setPartnerTyping(presence.isTyping);
        setTypingName(presence.name);
      } catch {
        // ignore transient presence errors
      }
    }

    void poll();
    const id = window.setInterval(poll, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [activeConversationId]);

  useEffect(() => {
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (activeConversationId) {
        void setTypingPresence(activeConversationId, false).catch(() => undefined);
      }
    };
  }, [activeConversationId]);

  function signalTyping() {
    if (!activeConversationId) return;
    const now = Date.now();
    if (now - lastTypingSent.current < 1500) {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        lastTypingSent.current = Date.now();
        void setTypingPresence(activeConversationId, true).catch(() => undefined);
      }, 400);
      return;
    }
    lastTypingSent.current = now;
    void setTypingPresence(activeConversationId, true).catch(() => undefined);
  }

  function onDraftChange(value: string) {
    setDraft(value);
    if (value.trim()) signalTyping();
    else if (activeConversationId) {
      void setTypingPresence(activeConversationId, false).catch(() => undefined);
    }
  }

  function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!activeConversationId || !draft.trim()) return;
    const body = draft.trim();
    setDraft("");
    setError(null);
    void setTypingPresence(activeConversationId, false).catch(() => undefined);
    startTransition(async () => {
      try {
        await sendMessage(activeConversationId, body);
        router.refresh();
      } catch (err) {
        setDraft(body);
        setError(err instanceof Error ? err.message : "Failed to send");
      }
    });
  }

  function onPing() {
    if (!activeConversationId || !pingReady) return;
    setError(null);
    setPingCooldownUntil(Date.now() + 30_000);
    startTransition(async () => {
      try {
        await sendPing(activeConversationId);
        router.refresh();
      } catch (err) {
        setPingCooldownUntil(0);
        setError(err instanceof Error ? err.message : "Failed to ping");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Messages</h1>
          <p className="mt-1 text-slate-500">{subtitle}</p>
        </div>
        <NewChatDialog partners={partners} basePath={basePath} />
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid min-h-[32rem] overflow-hidden rounded-xl border border-slate-200 bg-white lg:grid-cols-[18rem_1fr]">
        <aside className="flex flex-col border-b border-slate-200 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Conversations
            </p>
            <NewChatDialog partners={partners} basePath={basePath} variant="ghost" size="sm" />
          </div>
          <div className="max-h-56 flex-1 overflow-y-auto lg:max-h-none">
            {conversations.length === 0 ? (
              <div className="space-y-3 px-4 py-6 text-center">
                <p className="text-sm text-slate-500">No conversations yet.</p>
                <NewChatDialog partners={partners} basePath={basePath} variant="outline" size="sm" />
              </div>
            ) : (
              conversations.map((conversation) => {
                const selected = conversation.id === activeConversationId;
                const context = partnerContext(conversation.partner, partnerById);
                const typingHere =
                  selected ? partnerTyping : Boolean(conversation.partner_is_typing);
                return (
                  <Link
                    key={conversation.id}
                    href={`${basePath}?c=${conversation.id}`}
                    className={cn(
                      "block border-b border-slate-100 px-4 py-3 transition-colors",
                      selected ? "bg-teal-50" : "hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {partnerLabel(conversation.partner)}
                        </p>
                        {context && (
                          <p className="mt-0.5 truncate text-xs text-teal-700">{context}</p>
                        )}
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {typingHere ? (
                            <span className="inline-flex items-center gap-1 text-teal-700">
                              typing <TypingDots />
                            </span>
                          ) : (
                            previewBody(conversation.last_message)
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {conversation.partner && (
                          <Badge variant="secondary" className="text-[10px]">
                            {roleLabel(conversation.partner.role)}
                          </Badge>
                        )}
                        {(conversation.unread_count ?? 0) > 0 && (
                          <span className="rounded-full bg-teal-700 px-1.5 text-[10px] font-medium text-white">
                            {conversation.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </aside>

        <section className="flex min-h-[24rem] flex-col">
          {!active ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-slate-500">
              <MessageSquare className="h-8 w-8 text-slate-300" />
              <p className="text-sm">Select a conversation or start a new chat.</p>
              <NewChatDialog partners={partners} basePath={basePath} variant="outline" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="font-medium text-slate-900">{partnerLabel(active.partner)}</p>
                  {activeContext && (
                    <p className="text-xs text-teal-700">{activeContext}</p>
                  )}
                  <p className="text-xs text-slate-500">
                    {partnerTyping ? (
                      <span className="inline-flex items-center gap-1.5 text-teal-700">
                        {typingName || "Someone"} is typing <TypingDots />
                      </span>
                    ) : (
                      <>
                        {active.partner ? roleLabel(active.partner.role) : ""}
                        {active.partner?.email ? ` · ${active.partner.email}` : ""}
                      </>
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending || !pingReady}
                  onClick={onPing}
                  title={
                    pingReady
                      ? "Send a ping to get their attention"
                      : "Ping cooldown — try again shortly"
                  }
                >
                  <Bell className="h-4 w-4" />
                  Ping
                </Button>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {messages.length === 0 ? (
                  <p className="text-center text-sm text-slate-500">
                    Say hello — this is the start of your conversation.
                  </p>
                ) : (
                  messages.map((message) => {
                    const mine = message.sender_id === viewer.id;
                    if (isPingMessage(message)) {
                      return (
                        <div key={message.id} className="flex justify-center py-1">
                          <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-center text-xs text-amber-900">
                            <span className="font-medium">
                              {mine ? "You pinged" : `${partnerLabel(message.sender) || "They"} pinged`}
                            </span>
                            <span className="ml-2 text-amber-700/80">
                              {formatMessageTime(message.created_at)}
                            </span>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={message.id}
                        className={cn("flex", mine ? "justify-end" : "justify-start")}
                      >
                        <div
                          className={cn(
                            "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                            mine
                              ? "bg-teal-700 text-white"
                              : "bg-slate-100 text-slate-900"
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words">{message.body}</p>
                          <p
                            className={cn(
                              "mt-1 text-[10px]",
                              mine ? "text-teal-100" : "text-slate-500"
                            )}
                          >
                            {formatMessageTime(message.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                {partnerTyping && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl bg-slate-100 px-3.5 py-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        {typingName || "Someone"} is typing <TypingDots />
                      </span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={onSend} className="border-t border-slate-100 p-3">
                <div className="flex items-end gap-2">
                  <Textarea
                    value={draft}
                    onChange={(e) => onDraftChange(e.target.value)}
                    placeholder="Write a message…"
                    rows={2}
                    className="min-h-[2.75rem] resize-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        onSend(e);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={pending || !pingReady}
                    onClick={onPing}
                    title="Ping"
                  >
                    <Bell className="h-4 w-4" />
                    <span className="sr-only">Ping</span>
                  </Button>
                  <Button type="submit" disabled={pending || !draft.trim()} size="icon">
                    <Send className="h-4 w-4" />
                    <span className="sr-only">Send</span>
                  </Button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
