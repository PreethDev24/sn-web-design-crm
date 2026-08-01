import { readFileSync } from "fs";
import path from "path";
import { isDemoMode } from "@/lib/demo/mode";
import { sendGmail, isGmailConfigured } from "@/lib/email/gmail";
import { listTeamUsers } from "@/lib/db/queries";
import { fullName } from "@/lib/utils";
import type { DbUser } from "@/lib/types";

function appBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

function leadsDashboardUrl() {
  return `${appBaseUrl()}/crm/leads`;
}

function renderLeadListTemplate(dashboardUrl: string) {
  const filePath = path.join(
    process.cwd(),
    "src/lib/email/templates/new-lead-list.html"
  );
  return readFileSync(filePath, "utf8")
    .split("{{DASHBOARD_URL}}")
    .join(dashboardUrl);
}

function uploaderLabel(user: DbUser) {
  return fullName(user.first_name, user.last_name) || user.email || "An owner";
}

/**
 * Email every sales rep when an owner uploads a lead list CSV.
 * Fire-and-forget friendly — never throws to the import caller.
 */
export async function notifySalesOfLeadListUpload(params: {
  uploader: DbUser;
  createdCount: number;
  source?: string | null;
}) {
  if (params.createdCount <= 0) {
    return { sent: 0, skipped: "no_leads" as const };
  }
  if (isDemoMode()) {
    return { sent: 0, skipped: "demo" as const };
  }
  if (!isGmailConfigured()) {
    console.warn("Lead-list email skipped: Gmail is not configured");
    return { sent: 0, skipped: "not_configured" as const };
  }

  let sales: DbUser[] = [];
  try {
    const team = await listTeamUsers(params.uploader);
    sales = team.filter((u) => u.role === "sales" && u.email?.includes("@"));
  } catch (error) {
    console.error("Failed to load sales users for lead-list email:", error);
    return { sent: 0, skipped: "load_failed" as const };
  }

  if (sales.length === 0) {
    return { sent: 0, skipped: "no_sales" as const };
  }

  const link = leadsDashboardUrl();
  const who = uploaderLabel(params.uploader);
  const count = params.createdCount;
  const sourceNote = params.source?.trim()
    ? ` Source: ${params.source.trim()}.`
    : "";
  const html = renderLeadListTemplate(link);
  const subject = `New lead list ready (${count}) — SN Web Design`;
  const text = [
    `Hey team,`,
    ``,
    `${who} just added ${count} new lead${count === 1 ? "" : "s"} to your dashboard.${sourceNote}`,
    ``,
    `Review the list and start outreach:`,
    link,
    ``,
    `— SN Web Design`,
  ].join("\n");

  let sent = 0;
  for (const rep of sales) {
    if (rep.email === params.uploader.email) continue;
    const result = await sendGmail({
      to: rep.email,
      subject,
      text,
      html,
    });
    if (result.sent) {
      sent += 1;
    } else {
      console.warn(
        "Lead-list email not sent to",
        rep.email,
        result.reason,
        "error" in result ? result.error : ""
      );
    }
  }

  return { sent, total: sales.length };
}
