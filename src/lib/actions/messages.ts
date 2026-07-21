"use server";

import { requireAuth } from "@/lib/auth/roles";
import {
  canChatRoles,
  chatTablesReady,
  getConversationForViewer,
  isMissingChatTables,
  orderedParticipantIds,
} from "@/lib/db/queries";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/db/supabase";
import { isDemoMode } from "@/lib/demo/mode";
import { mutateStore, newId, readStore, touch } from "@/lib/demo/store";
import type { Conversation, DbUser, Message } from "@/lib/types";
import { revalidatePath } from "next/cache";

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
    throw new Error("You can only message owners with clients or sales reps");
  }
  return partner;
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

  if (isDemoMode()) {
    mutateStore((store) => {
      const message: Message = {
        id: newId("msg"),
        conversation_id: conversationId,
        sender_id: viewer.id,
        body: text,
        created_at: ts,
        read_at: null,
      };
      store.messages.push(message);
      const conv = store.conversations.find((c) => c.id === conversationId);
      if (conv) {
        conv.last_message_at = ts;
        conv.updated_at = ts;
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
  });
  if (error) {
    if (isMissingChatTables(error)) {
      throw new Error(
        "Chat tables missing — run supabase/migrations/006_chat.sql in Supabase"
      );
    }
    throw new Error(error.message);
  }

  await supabase
    .from("conversations")
    .update({ last_message_at: ts, updated_at: ts })
    .eq("id", conversationId);

  revalidateChatPaths();
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
