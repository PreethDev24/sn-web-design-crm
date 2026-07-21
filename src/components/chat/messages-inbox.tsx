"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MessageSquare, Send } from "lucide-react";
import {
  markConversationRead,
  sendMessage,
  startConversation,
} from "@/lib/actions/messages";
import type { Conversation, DbUser, Message } from "@/lib/types";
import { cn, fullName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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

type MessagesInboxProps = {
  viewer: DbUser;
  conversations: Conversation[];
  partners: DbUser[];
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
  const bottomRef = useRef<HTMLDivElement>(null);

  const active = conversations.find((c) => c.id === activeConversationId) ?? null;
  const existingPartnerIds = new Set(
    conversations.map((c) => c.partner?.id).filter(Boolean) as string[]
  );
  const startablePartners = partners.filter((p) => !existingPartnerIds.has(p.id));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeConversationId]);

  useEffect(() => {
    if (!activeConversationId || !active?.unread_count) return;
    void markConversationRead(activeConversationId).catch(() => undefined);
  }, [activeConversationId, active?.unread_count]);

  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), 8000);
    return () => window.clearInterval(id);
  }, [router]);

  function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!activeConversationId || !draft.trim()) return;
    const body = draft.trim();
    setDraft("");
    setError(null);
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

  function onStart(partnerId: string) {
    setError(null);
    startTransition(async () => {
      try {
        const id = await startConversation(partnerId);
        router.push(`${basePath}?c=${id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start chat");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Messages</h1>
        <p className="mt-1 text-slate-500">{subtitle}</p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid min-h-[32rem] overflow-hidden rounded-xl border border-slate-200 bg-white lg:grid-cols-[18rem_1fr]">
        <aside className="flex flex-col border-b border-slate-200 lg:border-b-0 lg:border-r">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Conversations
            </p>
          </div>
          <div className="max-h-56 flex-1 overflow-y-auto lg:max-h-none">
            {conversations.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">No conversations yet.</p>
            ) : (
              conversations.map((conversation) => {
                const selected = conversation.id === activeConversationId;
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
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {conversation.last_message?.body ?? "No messages yet"}
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

          {startablePartners.length > 0 && (
            <div className="border-t border-slate-100 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Start a chat
              </p>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {startablePartners.map((partner) => (
                  <button
                    key={partner.id}
                    type="button"
                    disabled={pending}
                    onClick={() => onStart(partner.id)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    <span className="truncate">{partnerLabel(partner)}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {roleLabel(partner.role)}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        <section className="flex min-h-[24rem] flex-col">
          {!active ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-slate-500">
              <MessageSquare className="h-8 w-8 text-slate-300" />
              <p className="text-sm">Select a conversation or start a new one.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="font-medium text-slate-900">{partnerLabel(active.partner)}</p>
                  <p className="text-xs text-slate-500">
                    {active.partner ? roleLabel(active.partner.role) : ""}
                    {active.partner?.email ? ` · ${active.partner.email}` : ""}
                  </p>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {messages.length === 0 ? (
                  <p className="text-center text-sm text-slate-500">
                    Say hello — this is the start of your conversation.
                  </p>
                ) : (
                  messages.map((message) => {
                    const mine = message.sender_id === viewer.id;
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
                <div ref={bottomRef} />
              </div>

              <form onSubmit={onSend} className="border-t border-slate-100 p-3">
                <div className="flex items-end gap-2">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
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
