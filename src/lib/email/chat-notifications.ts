import { isDemoMode } from "@/lib/demo/mode";
import { sendGmail, isGmailConfigured } from "@/lib/email/gmail";
import { fullName } from "@/lib/utils";
import type { DbUser, UserRole } from "@/lib/types";

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export function isUserOnline(user: Pick<DbUser, "last_seen_at"> | null | undefined) {
  if (!user?.last_seen_at) return false;
  return Date.now() - new Date(user.last_seen_at).getTime() < ONLINE_WINDOW_MS;
}

function appBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

function messagesPathForRole(role: UserRole, conversationId: string) {
  const base = role === "client" ? "/portal/messages" : "/crm/messages";
  return `${base}?c=${conversationId}`;
}

function senderLabel(user: DbUser) {
  return fullName(user.first_name, user.last_name) || user.email || "Someone";
}

export async function notifyChatPing(params: {
  recipient: DbUser;
  sender: DbUser;
  conversationId: string;
}) {
  if (isDemoMode() || !isGmailConfigured()) return;
  if (!params.recipient.email || params.recipient.email === params.sender.email) return;

  const link = `${appBaseUrl()}${messagesPathForRole(params.recipient.role, params.conversationId)}`;
  const who = senderLabel(params.sender);

  await sendGmail({
    to: params.recipient.email,
    subject: `${who} pinged you on SN Web Design`,
    text: `${who} sent you a ping.\n\nOpen the conversation:\n${link}\n`,
    html: `
      <p><strong>${who}</strong> pinged you on SN Web Design.</p>
      <p><a href="${link}">Open conversation</a></p>
    `,
  });
}

export async function notifyChatMessageIfOffline(params: {
  recipient: DbUser;
  sender: DbUser;
  conversationId: string;
  preview: string;
}) {
  if (isDemoMode() || !isGmailConfigured()) return;
  if (!params.recipient.email || params.recipient.email === params.sender.email) return;
  if (isUserOnline(params.recipient)) return;

  const link = `${appBaseUrl()}${messagesPathForRole(params.recipient.role, params.conversationId)}`;
  const who = senderLabel(params.sender);
  const preview = params.preview.trim().slice(0, 280);

  await sendGmail({
    to: params.recipient.email,
    subject: `New message from ${who}`,
    text: `${who} sent you a message while you were offline:\n\n"${preview}"\n\nOpen the conversation:\n${link}\n`,
    html: `
      <p><strong>${who}</strong> sent you a message while you were offline:</p>
      <blockquote style="border-left:3px solid #0f766e;padding-left:12px;color:#334155;">
        ${preview.replace(/</g, "&lt;")}
      </blockquote>
      <p><a href="${link}">Open conversation</a></p>
    `,
  });
}
