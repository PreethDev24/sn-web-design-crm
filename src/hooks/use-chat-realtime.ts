"use client";

import { useEffect, useRef, useState } from "react";
import { Client } from "appwrite";
import type { AppwriteRealtimeConfig } from "@/lib/db/appwrite-public";

type ChatRealtimePayload = {
  $id?: string;
  conversation_id?: string;
  participant_one_id?: string;
  participant_two_id?: string;
  typing_user_id?: string | null;
  typing_until?: string | null;
  last_message_at?: string;
  kind?: string;
  body?: string;
  sender_id?: string;
  created_at?: string;
  read_at?: string | null;
};

export type ChatRealtimeEvent = {
  channels: string[];
  events: string[];
  payload: ChatRealtimePayload;
  /** Best-effort collection inferred from Appwrite event names */
  collection: "messages" | "conversations" | null;
};

function inferCollection(
  events: string[],
): "messages" | "conversations" | null {
  const joined = events.join(" ");
  if (joined.includes(".collections.messages.")) return "messages";
  if (joined.includes(".collections.conversations.")) return "conversations";
  return null;
}

/**
 * Subscribe to Appwrite Realtime for chat collections.
 * Uses Role.any() readable documents; UI still loads data via Clerk-auth server actions.
 */
export function useChatRealtime(opts: {
  config: AppwriteRealtimeConfig | null;
  viewerId: string;
  conversationIds: string[];
  activeConversationId: string | null;
  enabled?: boolean;
  onEvent: (event: ChatRealtimeEvent) => void;
}) {
  const { config, viewerId, conversationIds, activeConversationId, enabled = true, onEvent } =
    opts;
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const conversationKey = conversationIds.slice().sort().join(",");

  useEffect(() => {
    if (!enabled || !config || !viewerId) {
      setConnected(false);
      return;
    }

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    try {
      const client = new Client()
        .setEndpoint(config.endpoint.replace(/\/$/, ""))
        .setProject(config.projectId);

      const channels = [
        `databases.${config.databaseId}.collections.messages.documents`,
        `databases.${config.databaseId}.collections.conversations.documents`,
      ];

      const convSet = new Set(conversationIds);
      if (activeConversationId) convSet.add(activeConversationId);

      unsubscribe = client.subscribe<ChatRealtimePayload>(channels, (response) => {
        const payload = response.payload || {};
        const events = response.events || [];
        const collection = inferCollection(events);

        // New/updated message in a thread we know (or are viewing)
        if (payload.conversation_id && convSet.has(payload.conversation_id)) {
          onEventRef.current({
            channels: response.channels,
            events,
            payload,
            collection: collection ?? "messages",
          });
          return;
        }

        // Conversation row we participate in (typing, last_message_at, new thread)
        const isParticipant =
          payload.participant_one_id === viewerId ||
          payload.participant_two_id === viewerId;
        if (isParticipant) {
          onEventRef.current({
            channels: response.channels,
            events,
            payload,
            collection: collection ?? "conversations",
          });
        }
      });

      if (!cancelled) setConnected(true);
    } catch (e) {
      console.warn("Appwrite Realtime unavailable:", e);
      if (!cancelled) setConnected(false);
    }

    return () => {
      cancelled = true;
      setConnected(false);
      try {
        unsubscribe?.();
      } catch {
        /* ignore */
      }
    };
    // conversationKey intentionally encodes conversationIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    config?.endpoint,
    config?.projectId,
    config?.databaseId,
    viewerId,
    conversationKey,
    activeConversationId,
  ]);

  return { connected };
}
