import { isDataConfigured, createDocument, COLLECTIONS } from "@/lib/db/repo";
import { isDemoMode } from "@/lib/demo/mode";
import { mutateStore, newId, touch } from "@/lib/demo/store";
import type { AuditLog, DbUser } from "@/lib/types";
import { revalidatePath } from "next/cache";

export type AuditAction =
  | "member.invited"
  | "member.removed"
  | "client_invite.requested"
  | "client_invite.approved"
  | "client_invite.rejected"
  | "client.terminated"
  | "client.reactivated"
  | "project.terminated"
  | "project.status_changed"
  | "contract.sent"
  | "contract.signed"
  | "invoice.created"
  | "invoice.sent"
  | "invoice.paid"
  | "lead.status_changed"
  | "lead.imported"
  | "deal.converted"
  | "deliverable.approved"
  | "sales.onboarding.completed";

export type AuditTargetType =
  | "user"
  | "client"
  | "project"
  | "contract"
  | "invoice"
  | "lead"
  | "deal"
  | "deliverable"
  | "invite_request"
  | "system";

export async function recordAuditLog(input: {
  action: AuditAction;
  actor?: Pick<DbUser, "id" | "email" | "role"> | null;
  targetType?: AuditTargetType | null;
  targetId?: string | null;
  targetLabel?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  const entry: AuditLog = {
    id: newId("audit"),
    action: input.action,
    actor_id: input.actor?.id && input.actor.id !== "local-dev-user" ? input.actor.id : null,
    actor_email: input.actor?.email ?? null,
    actor_role: input.actor?.role ?? null,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    target_label: input.targetLabel ?? null,
    summary: input.summary,
    metadata: input.metadata ?? {},
    created_at: touch(),
  };

  try {
    if (isDemoMode()) {
      mutateStore((store) => {
        if (!store.audit_logs) store.audit_logs = [];
        store.audit_logs.unshift(entry);
      });
      revalidatePath("/crm/audit");
      return;
    }

    if (!isDataConfigured()) return;

    await createDocument(COLLECTIONS.audit_logs, {
      action: entry.action,
      actor_id: entry.actor_id,
      actor_email: entry.actor_email,
      actor_role: entry.actor_role,
      target_type: entry.target_type,
      target_id: entry.target_id,
      target_label: entry.target_label,
      summary: entry.summary,
      metadata: entry.metadata,
      created_at: entry.created_at,
    });

    revalidatePath("/crm/audit");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Table/collection may be missing until the relevant migration is applied
    if (/PGRST205|audit_logs|schema cache|not found|404|Could not find|does not exist/i.test(message)) {
      console.warn(
        "audit_logs table missing — run supabase/migrations/009_audit_logs.sql or create the Appwrite audit_logs collection"
      );
      return;
    }
    console.error("Failed to write audit log:", message);
  }
}
