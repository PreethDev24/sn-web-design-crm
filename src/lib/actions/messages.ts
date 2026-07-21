"use server";

import { requireAuth } from "@/lib/auth/roles";
import {
  canChatRoles,
  chatTablesReady,
  getConversationForViewer,
  getConversationTyping,
  isMissingChatTables,
  orderedParticipantIds,
} from "@/lib/db/queries";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/db/supabase";
import { isDemoMode } from "@/lib/demo/mode";
import { mutateStore, newId, readStore, touch } from "@/lib/demo/store";
import type { Conversation, DbUser, Message } from "@/lib/types";
import { revalidatePath } from "next/cache";

const TYPING_TTL_MS = 4000;
const PING_COOLDOWN_MS = 30_000;
const PING_BODY = "🔔 Ping";

function requireDb() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured. Add credentials to .env.local");
  }
  return getSupabaseAdmin();
}

function revalidateChatPaths() {
  revalidatePath("/crm/messages");
  revalidatePath("/portal/messages");
}

function typingUntilIso() {
  return new Date(Date.now() + TYPING_TTL_MS).toISOString();
}

async function loadUserById(id: string): Promise<DbUser | null> {
  if (isDemoMode()) {
    return readStore().users.find((u) => u.id === id) ?? null;
  }
  const { data, error } = await requireDb()
    .from("users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DbUser) ?? null;
}

async function assertCanMessage(viewer: DbUser, partnerId: string) {
  const partner = await loadUserById(partnerId);
  if (!partner) throw new Error("User not found");
  if (!canChatRoles(viewer.role, partner.role)) {
    throw new Error(
      "You can only message between owners, or owners with clients/sales"
    );
  }
  return partner;
}

async function clearTypingForViewer(conversationId: string, viewerId: string) {
  if (isDemoMode()) {
    mutateStore((store) => {
      const conv = store.conversations.find((c) => c.id === conversationId);
      if (conv && conv.typing_user_id === viewerId) {
        conv.typing_user_id = null;
        conv.typing_until = null;
      }
    });
    return;
  }
  if (!isSupabaseConfigured()) return;
  await requireDb()
    .from("conversations")
    .update({ typing_user_id: null, typing_until: null })
    .eq("id", conversationId)
    .eq("typing_user_id", viewerId);
}

export async function startConversation(partnerId: string) {
  const viewer = await requireAuth();
  if (partnerId === viewer.id) throw new Error("Cannot message yourself");
  await assertCanMessage(viewer, partnerId);

  const [one, two] = orderedParticipantIds(viewer.id, partnerId);
  const ts = touch();

  if (isDemoMode()) {
    const conversationId = mutateStore((store) => {
      const existing = store.conversations.find(
        (c) => c.participant_one_id === one && c.participant_two_id === two
      );
      if (existing) return existing.id;
      const conversation: Conversation = {
        id: newId("conv"),
        participant_one_id: one,
        participant_two_id: two,
        last_message_at: ts,
        created_at: ts,
        updated_at: ts,
        typing_user_id: null,
        typing_until: null,
      };
      store.conversations.push(conversation);
      return conversation.id;
    });
    revalidateChatPaths();
    return conversationId;
  }

  const supabase = requireDb();
  const { data: existing, error: findError } = await supabase
    .from("conversations")
    .select("id")
    .eq("participant_one_id", one)
    .eq("participant_two_id", two)
    .maybeSingle();
  if (findError) {
    if (isMissingChatTables(findError)) {
      throw new Error(
        "Chat tables missing — run supabase/migrations/006_chat.sql in Supabase"
      );
    }
    throw new Error(findError.message);
  }
  if (existing?.id) {
    revalidateChatPaths();
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      participant_one_id: one,
      participant_two_id: two,
      last_message_at: ts,
    })
    .select("id")
    .single();
  if (error) {
    if (isMissingChatTables(error)) {
      throw new Error(
        "Chat tables missing — run supabase/migrations/006_chat.sql in Supabase"
      );
    }
    throw new Error(error.message);
  }
  revalidateChatPaths();
  return data.id as string;
}

export async function sendMessage(conversationId: string, body: string) {
  const viewer = await requireAuth();
  const text = body.trim();
  if (!text) throw new Error("Message cannot be empty");
  if (text.length > 5000) throw new Error("Message is too long");

  const conversation = await getConversationForViewer(conversationId, viewer);
  if (!conversation) throw new Error("Conversation not found");

  const partnerId =
    conversation.participant_one_id === viewer.id
      ? conversation.participant_two_id
      : conversation.participant_one_id;
  await assertCanMessage(viewer, partnerId);

  const ts = touch();
  await clearTypingForViewer(conversationId, viewer.id);

  if (isDemoMode()) {
    mutateStore((store) => {
      const message: Message = {
        id: newId("msg"),
        conversation_id: conversationId,
        sender_id: viewer.id,
        body: text,
        kind: "text",
        created_at: ts,
        read_at: null,
      };
      store.messages.push(message);
      const conv = store.conversations.find((c) => c.id === conversationId);
      if (conv) {
        conv.last_message_at = ts;
        conv.updated_at = ts;
        if (conv.typing_user_id === viewer.id) {
          conv.typing_user_id = null;
          conv.typing_until = null;
        }
      }
    });
    revalidateChatPaths();
    return;
  }

  const supabase = requireDb();
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: viewer.id,
    body: text,
    kind: "text",
  });
  if (error) {
    if (isMissingChatTables(error)) {
      throw new Error(
        "Chat tables missing — run supabase/migrations/006_chat.sql in Supabase"
      );
    }
    if (error.message.includes("kind")) {
      const retry = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: viewer.id,
        body: text,
      });
      if (retry.error) throw new Error(retry.error.message);
    } else {
      throw new Error(error.message);
    }
  }

  await supabase
    .from("conversations")
    .update({
      last_message_at: ts,
      updated_at: ts,
      typing_user_id: null,
      typing_until: null,
    })
    .eq("id", conversationId);

  revalidateChatPaths();
}

export async function sendPing(conversationId: string) {
  const viewer = await requireAuth();
  const conversation = await getConversationForViewer(conversationId, viewer);
  if (!conversation) throw new Error("Conversation not found");

  const partnerId =
    conversation.participant_one_id === viewer.id
      ? conversation.participant_two_id
      : conversation.participant_one_id;
  await assertCanMessage(viewer, partnerId);

  const ts = touch();
  const cutoff = new Date(Date.now() - PING_COOLDOWN_MS).toISOString();

  if (isDemoMode()) {
    const blocked = mutateStore((store) => {
      const recent = store.messages.find(
        (m) =>
          m.conversation_id === conversationId &&
          m.sender_id === viewer.id &&
          (m.kind === "ping" || m.body === PING_BODY) &&
          m.created_at >= cutoff
      );
      if (recent) return true;
      store.messages.push({
        id: newId("msg"),
        conversation_id: conversationId,
        sender_id: viewer.id,
        body: PING_BODY,
        kind: "ping",
        created_at: ts,
        read_at: null,
      });
      const conv = store.conversations.find((c) => c.id === conversationId);
      if (conv) {
        conv.last_message_at = ts;
        conv.updated_at = ts;
        if (conv.typing_user_id === viewer.id) {
          conv.typing_user_id = null;
          conv.typing_until = null;
        }
      }
      return false;
    });
    if (blocked) throw new Error("Wait a few seconds before pinging again");
    revalidateChatPaths();
    return;
  }

  const supabase = requireDb();
  const { data: recentPings, error: recentError } = await supabase
    .from("messages")
    .select("id, kind, body, created_at")
    .eq("conversation_id", conversationId)
    .eq("sender_id", viewer.id)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(10);
  if (recentError && !isMissingChatTables(recentError)) {
    throw new Error(recentError.message);
  }
  const tooSoon = (recentPings ?? []).some(
    (m) => m.kind === "ping" || m.body === PING_BODY
  );
  if (tooSoon) throw new Error("Wait a few seconds before pinging again");

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: viewer.id,
    body: PING_BODY,
    kind: "ping",
  });
  if (error) {
    if (error.message.includes("kind")) {
      const retry = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: viewer.id,
        body: PING_BODY,
      });
      if (retry.error) throw new Error(retry.error.message);
    } else if (isMissingChatTables(error)) {
      throw new Error(
        "Chat tables missing — run supabase/migrations/006_chat.sql in Supabase"
      );
    } else {
      throw new Error(error.message);
    }
  }

  await supabase
    .from("conversations")
    .update({
      last_message_at: ts,
      updated_at: ts,
      typing_user_id: null,
      typing_until: null,
    })
    .eq("id", conversationId);

  revalidateChatPaths();
}

/** Lightweight presence update — does not revalidate pages. */
export async function setTypingPresence(conversationId: string, isTyping: boolean) {
  const viewer = await requireAuth();
  const conversation = await getConversationForViewer(conversationId, viewer);
  if (!conversation) return { ok: false as const };

  if (isDemoMode()) {
    mutateStore((store) => {
      const conv = store.conversations.find((c) => c.id === conversationId);
      if (!conv) return;
      if (isTyping) {
        conv.typing_user_id = viewer.id;
        conv.typing_until = typingUntilIso();
      } else if (conv.typing_user_id === viewer.id) {
        conv.typing_user_id = null;
        conv.typing_until = null;
      }
    });
    return { ok: true as const };
  }

  const supabase = requireDb();
  if (isTyping) {
    const { error } = await supabase
      .from("conversations")
      .update({
        typing_user_id: viewer.id,
        typing_until: typingUntilIso(),
      })
      .eq("id", conversationId);
    if (error && !error.message.includes("typing_")) {
      if (isMissingChatTables(error)) return { ok: false as const };
      throw new Error(error.message);
    }
  } else {
    await clearTypingForViewer(conversationId, viewer.id);
  }
  return { ok: true as const };
}

export async function fetchTypingPresence(conversationId: string) {
  const viewer = await requireAuth();
  return getConversationTyping(conversationId, viewer);
}

export async function markConversationRead(conversationId: string) {
  const viewer = await requireAuth();
  const conversation = await getConversationForViewer(conversationId, viewer);
  if (!conversation) return;

  const ts = touch();

  if (isDemoMode()) {
    mutateStore((store) => {
      for (const message of store.messages) {
        if (
          message.conversation_id === conversationId &&
          message.sender_id !== viewer.id &&
          !message.read_at
        ) {
          message.read_at = ts;
        }
      }
    });
    revalidateChatPaths();
    return;
  }

  const { error } = await requireDb()
    .from("messages")
    .update({ read_at: ts })
    .eq("conversation_id", conversationId)
    .neq("sender_id", viewer.id)
    .is("read_at", null);
  if (error && !isMissingChatTables(error)) throw new Error(error.message);
  revalidateChatPaths();
}

export async function ensureChatReady() {
  return chatTablesReady();
}
