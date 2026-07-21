import { requireStaff } from "@/lib/auth/roles";
import {
  chatTablesReady,
  listChatPartners,
  listConversations,
  listMessages,
} from "@/lib/db/queries";
import { MessagesInbox } from "@/components/chat/messages-inbox";

export default async function CrmMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const user = await requireStaff();
  const { c } = await searchParams;
  const ready = await chatTablesReady();
  const [conversations, partners] = await Promise.all([
    listConversations(user),
    listChatPartners(user),
  ]);

  const activeId =
    c && conversations.some((conversation) => conversation.id === c) ? c : null;
  const messages = activeId ? await listMessages(activeId, user) : [];

  return (
    <div className="space-y-4">
      {!ready && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">One-time database setup required</p>
          <p className="mt-1">
            Run{" "}
            <code className="rounded bg-amber-100 px-1">supabase/migrations/006_chat.sql</code>{" "}
            in the Supabase SQL Editor, then refresh this page.
          </p>
        </div>
      )}
      <MessagesInbox
        viewer={user}
        conversations={conversations}
        partners={partners}
        activeConversationId={activeId}
        messages={messages}
        basePath="/crm/messages"
        subtitle={
          user.role === "owner"
            ? "Message clients and sales reps"
            : "Message owners for support and deal questions"
        }
      />
    </div>
  );
}
