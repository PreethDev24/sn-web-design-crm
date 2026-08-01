import { requireClient } from "@/lib/auth/roles";
import {
  chatTablesReady,
  listChatPartners,
  listConversations,
  listMessages,
} from "@/lib/db/queries";
import { getAppwriteRealtimeConfig } from "@/lib/db/appwrite-public";
import { MessagesInbox } from "@/components/chat/messages-inbox";

export default async function PortalMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const user = await requireClient();
  const { c } = await searchParams;
  const ready = await chatTablesReady();
  const realtimeConfig = getAppwriteRealtimeConfig();

  let conversations: Awaited<ReturnType<typeof listConversations>> = [];
  let partners: Awaited<ReturnType<typeof listChatPartners>> = [];
  let loadError: string | null = null;

  try {
    [conversations, partners] = await Promise.all([
      listConversations(user),
      listChatPartners(user),
    ]);
  } catch (e) {
    console.error("portal messages load failed:", e);
    loadError = e instanceof Error ? e.message : "Failed to load messages";
  }

  const activeId =
    c && conversations.some((conversation) => conversation.id === c) ? c : null;
  let messages: Awaited<ReturnType<typeof listMessages>> = [];
  if (activeId) {
    try {
      messages = await listMessages(activeId, user);
    } catch (e) {
      console.error("portal messages thread load failed:", e);
      loadError = e instanceof Error ? e.message : "Failed to load conversation";
    }
  }

  return (
    <div className="space-y-4">
      {!ready && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">One-time database setup required</p>
          <p className="mt-1">
            Run{" "}
            <code className="rounded bg-amber-100 px-1">npm run appwrite:setup</code>{" "}
            to create chat collections, then refresh this page.
          </p>
        </div>
      )}
      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950">
          <p className="font-medium">Couldn’t load messages</p>
          <p className="mt-1">{loadError}</p>
        </div>
      )}
      <MessagesInbox
        viewer={user}
        conversations={conversations}
        partners={partners}
        activeConversationId={activeId}
        messages={messages}
        basePath="/portal/messages"
        realtimeConfig={realtimeConfig}
        subtitle="Message the SN Web Design team — use New chat to choose an owner"
      />
    </div>
  );
}
