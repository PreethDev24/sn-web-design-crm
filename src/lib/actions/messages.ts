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
import {
  notifyChatMessageIfOffline,
  notifyChatPing,
} from "@/lib/email/chat-notifications";
import { Permission, Role } from "@/lib/db/appwrite";
import {
  isDataConfigured,
  listDocuments,
  getDocument,
  createDocument,
  updateDocument,
  findOneBy,
  COLLECTIONS,
} from "@/lib/db/repo";
import { isDemoMode } from "@/lib/demo/mode";
import { mutateStore, newId, readStore, touch } from "@/lib/demo/store";
import type { Conversation, DbUser, Message } from "@/lib/types";
import { revalidatePath } from "next/cache";

const TYPING_TTL_MS = 4000;
const PING_COOLDOWN_MS = 30_000;
const PING_BODY = "🔔 Ping";

/** Readable by Realtime clients (collection already allows any; documents need it too). */
const CHAT_DOC_PERMS = [Permission.read(Role.any()), Permission.update(Role.any())];

function assertDbReady() {
  if (!isDataConfigured()) {
    throw new Error("Database is not configured. Add credentials to .env.local");
  }
}

function toErrorInfo(e: unknown): { message: string } {
  return { message: e instanceof Error ? e.message : String(e) };
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
  if (!isDataConfigured()) return null;
  return getDocument(COLLECTIONS.users, id) as unknown as (DbUser) | null;
}

async function touchUserLastSeen(userId: string) {
  const ts = touch();
  if (isDemoMode()) {
    mutateStore((store) => {
      const user = store.users.find((u) => u.id === userId);
      if (user) user.last_seen_at = ts;
    });
    return;
  }
  if (!isDataConfigured() || userId === "local-dev-user") return;
  try {
    await updateDocument(COLLECTIONS.users, userId, { last_seen_at: ts });
  } catch (e) {
    const info = toErrorInfo(e);
    // Column/attribute may be missing until the relevant migration is applied
    if (!info.message.includes("last_seen_at")) {
      console.warn("Failed to update last_seen_at:", info.message);
    }
  }
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
  if (!isDataConfigured()) return;
  const conv = await getDocument(COLLECTIONS.conversations, conversationId) as unknown as (Conversation) | null;
  if (conv?.typing_user_id === viewerId) {
    await updateDocument(COLLECTIONS.conversations, conversationId, {
      typing_user_id: "",
      typing_until: "",
    });
  }
}

async function notifyRecipient(params: {
  kind: "message" | "ping";
  conversationId: string;
  sender: DbUser;
  recipientId: string;
  preview: string;
}) {
  try {
    const recipient = await loadUserById(params.recipientId);
    if (!recipient) return;
    if (params.kind === "ping") {
      await notifyChatPing({
        recipient,
        sender: params.sender,
        conversationId: params.conversationId,
      });
      return;
    }
    await notifyChatMessageIfOffline({
      recipient,
      sender: params.sender,
      conversationId: params.conversationId,
      preview: params.preview,
    });
  } catch (error) {
    console.error("Chat email notification failed:", error);
  }
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

  assertDbReady();
  try {
    const existing = await findOneBy(COLLECTIONS.conversations, {
      participant_one_id: one,
      participant_two_id: two,
    }) as unknown as ({ id: string }) | null;
    if (existing?.id) {
      revalidateChatPaths();
      return existing.id;
    }

    const created = await createDocument(
      COLLECTIONS.conversations,
      {
        participant_one_id: one,
        participant_two_id: two,
        last_message_at: ts,
        created_at: ts,
        updated_at: ts,
        typing_user_id: "",
        typing_until: "",
      },
      undefined,
      CHAT_DOC_PERMS
    ) as unknown as ({ id: string });
    revalidateChatPaths();
    return created.id;
  } catch (e) {
    if (isMissingChatTables(toErrorInfo(e))) {
      throw new Error(
        "Chat tables missing — run supabase/migrations/006_chat.sql, or create the Appwrite conversations/messages collections"
      );
    }
    throw e;
  }
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
    await notifyRecipient({
      kind: "message",
      conversationId,
      sender: viewer,
      recipientId: partnerId,
      preview: text,
    });
    return;
  }

  assertDbReady();
  try {
    await createDocument(
      COLLECTIONS.messages,
      {
        conversation_id: conversationId,
        sender_id: viewer.id,
        body: text,
        kind: "text",
        created_at: ts,
        read_at: null,
      },
      undefined,
      CHAT_DOC_PERMS
    );
  } catch (e) {
    if (isMissingChatTables(toErrorInfo(e))) {
      throw new Error(
        "Chat tables missing — run supabase/migrations/006_chat.sql, or create the Appwrite conversations/messages collections"
      );
    }
    throw e;
  }

  await updateDocument(
    COLLECTIONS.conversations,
    conversationId,
    {
      last_message_at: ts,
      updated_at: ts,
      typing_user_id: "",
      typing_until: "",
    },
    CHAT_DOC_PERMS
  );

  revalidateChatPaths();
  // Fire-and-forget: specialized missed-message HTML email if recipient is offline
  void notifyRecipient({
    kind: "message",
    conversationId,
    sender: viewer,
    recipientId: partnerId,
    preview: text,
  });
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
    void notifyRecipient({
      kind: "ping",
      conversationId,
      sender: viewer,
      recipientId: partnerId,
      preview: PING_BODY,
    });
    return;
  }

  assertDbReady();
  try {
    const recentPings = await listDocuments(COLLECTIONS.messages, {
      equal: { conversation_id: conversationId, sender_id: viewer.id },
      orderAttr: "created_at",
      orderAsc: false,
      limit: 10,
    }) as unknown as (Message)[];
    const tooSoon = recentPings.some(
      (m) => m.created_at >= cutoff && (m.kind === "ping" || m.body === PING_BODY)
    );
    if (tooSoon) throw new Error("Wait a few seconds before pinging again");

    await createDocument(
      COLLECTIONS.messages,
      {
        conversation_id: conversationId,
        sender_id: viewer.id,
        body: PING_BODY,
        kind: "ping",
        created_at: ts,
        read_at: null,
      },
      undefined,
      CHAT_DOC_PERMS
    );
  } catch (e) {
    if (e instanceof Error && e.message === "Wait a few seconds before pinging again") throw e;
    if (isMissingChatTables(toErrorInfo(e))) {
      throw new Error(
        "Chat tables missing — run supabase/migrations/006_chat.sql, or create the Appwrite conversations/messages collections"
      );
    }
    throw e;
  }

  await updateDocument(
    COLLECTIONS.conversations,
    conversationId,
    {
      last_message_at: ts,
      updated_at: ts,
      typing_user_id: "",
      typing_until: "",
    },
    CHAT_DOC_PERMS
  );

  revalidateChatPaths();
  // Fire-and-forget: specialized ping HTML email (always sent — not gated on online)
  void notifyRecipient({
    kind: "ping",
    conversationId,
    sender: viewer,
    recipientId: partnerId,
    preview: PING_BODY,
  });
}

/** Lightweight presence update — does not revalidate pages. */
export async function setTypingPresence(conversationId: string, isTyping: boolean) {
  const viewer = await requireAuth();
  const conversation = await getConversationForViewer(conversationId, viewer);
  if (!conversation) return { ok: false as const };
  await touchUserLastSeen(viewer.id);

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

  if (!isDataConfigured()) return { ok: false as const };
  try {
    if (isTyping) {
      await updateDocument(
        COLLECTIONS.conversations,
        conversationId,
        {
          typing_user_id: viewer.id,
          typing_until: typingUntilIso(),
        },
        CHAT_DOC_PERMS
      );
    } else {
      await clearTypingForViewer(conversationId, viewer.id);
    }
    return { ok: true as const };
  } catch (e) {
    const info = toErrorInfo(e);
    if (info.message.includes("typing_") || isMissingChatTables(info)) {
      return { ok: false as const };
    }
    throw e;
  }
}

export async function fetchTypingPresence(conversationId: string) {
  const viewer = await requireAuth();
  await touchUserLastSeen(viewer.id);
  return getConversationTyping(conversationId, viewer);
}

export async function markConversationRead(conversationId: string) {
  const viewer = await requireAuth();
  const conversation = await getConversationForViewer(conversationId, viewer);
  if (!conversation) return;
  await touchUserLastSeen(viewer.id);

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

  if (!isDataConfigured()) return;
  try {
    const unread = await listDocuments(COLLECTIONS.messages, {
      equal: { conversation_id: conversationId },
      notEqual: { sender_id: viewer.id },
      isNull: ["read_at"],
      limit: 500,
    }) as unknown as (Message)[];
    for (const message of unread) {
      await updateDocument(COLLECTIONS.messages, message.id, { read_at: ts });
    }
  } catch (e) {
    if (!isMissingChatTables(toErrorInfo(e))) throw e;
  }
  revalidateChatPaths();
}

export async function ensureChatReady() {
  return chatTablesReady();
}
