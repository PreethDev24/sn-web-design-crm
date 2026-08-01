import { readFileSync } from "fs";
import path from "path";
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

/** Deep link straight into that conversation thread. */
export function conversationThreadUrl(role: UserRole, conversationId: string) {
  const base = role === "client" ? "/portal/messages" : "/crm/messages";
  return `${appBaseUrl()}${base}?c=${encodeURIComponent(conversationId)}`;
}

function senderLabel(user: DbUser) {
  return fullName(user.first_name, user.last_name) || user.email || "Someone";
}

function renderTemplate(fileName: string, threadUrl: string) {
  const filePath = path.join(process.cwd(), "src/lib/email/templates", fileName);
  return readFileSync(filePath, "utf8").split("{{THREAD_URL}}").join(threadUrl);
}

export async function notifyChatPing(params: {
  recipient: DbUser;
  sender: DbUser;
  conversationId: string;
}) {
  if (isDemoMode()) return { sent: false as const, reason: "demo" };
  if (!isGmailConfigured()) {
    console.warn("Ping email skipped: Gmail is not configured");
    return { sent: false as const, reason: "not_configured" };
  }
  if (!params.recipient.email || params.recipient.email === params.sender.email) {
    return { sent: false as const, reason: "invalid_recipient" };
  }

  const link = conversationThreadUrl(params.recipient.role, params.conversationId);
  const who = senderLabel(params.sender);
  const html = renderTemplate("ping.html", link);

  const result = await sendGmail({
    to: params.recipient.email,
    subject: `${who} tagged you in a message — SN Web Design`,
    text: `${who} tagged you in a message on SN Web Design.\n\nOpen the conversation:\n${link}\n`,
    html,
  });
  if (!result.sent) {
    console.warn("Ping email not sent:", result.reason, "error" in result ? result.error : "");
  }
  return result;
}

export async function notifyChatMessageIfOffline(params: {
  recipient: DbUser;
  sender: DbUser;
  conversationId: string;
  preview: string;
}) {
  if (isDemoMode()) return { sent: false as const, reason: "demo" };
  if (!isGmailConfigured()) {
    console.warn("Missed-message email skipped: Gmail is not configured");
    return { sent: false as const, reason: "not_configured" };
  }
  if (!params.recipient.email || params.recipient.email === params.sender.email) {
    return { sent: false as const, reason: "invalid_recipient" };
  }
  // Live presence: if they're on Messages (last_seen within window), skip email
  if (isUserOnline(params.recipient)) {
    return { sent: false as const, reason: "recipient_online" };
  }

  const link = conversationThreadUrl(params.recipient.role, params.conversationId);
  const who = senderLabel(params.sender);
  const preview = params.preview.trim().slice(0, 280);
  const html = renderTemplate("missed-message.html", link);

  const result = await sendGmail({
    to: params.recipient.email,
    subject: `You have a missed message from ${who} — SN Web Design`,
    text: `${who} sent you a message while you were offline:\n\n"${preview}"\n\nOpen the conversation:\n${link}\n`,
    html,
  });
  if (!result.sent) {
    console.warn(
      "Missed-message email not sent:",
      result.reason,
      "error" in result ? result.error : ""
    );
  }
  return result;
}
