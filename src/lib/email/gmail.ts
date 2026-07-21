import nodemailer from "nodemailer";

export function isGmailConfigured() {
  return Boolean(process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.trim());
}

function getTransporter() {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.trim();
  if (!user || !pass) return null;

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

export async function sendGmail(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  if (!options.to?.includes("@")) return { sent: false as const, reason: "invalid_to" };
  if (!isGmailConfigured()) return { sent: false as const, reason: "not_configured" };

  const transporter = getTransporter();
  if (!transporter) return { sent: false as const, reason: "not_configured" };

  const from = process.env.GMAIL_FROM?.trim() || process.env.GMAIL_USER!.trim();

  try {
    await transporter.sendMail({
      from: `"SN Web Design" <${from}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html ?? `<p>${options.text.replace(/\n/g, "<br/>")}</p>`,
    });
    return { sent: true as const };
  } catch (error) {
    console.error("Gmail send failed:", error);
    return {
      sent: false as const,
      reason: "send_failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
