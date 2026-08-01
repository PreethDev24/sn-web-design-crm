"use server";

import { requireOwner } from "@/lib/auth/roles";
import { recordAuditLog } from "@/lib/audit/log";
import {
  isDataConfigured,
  getDocument,
  deleteDocument,
  deleteDocuments,
  updateDocuments,
  listDocuments,
  COLLECTIONS,
} from "@/lib/db/repo";
import { isDemoMode } from "@/lib/demo/mode";
import { mutateStore } from "@/lib/demo/store";
import type { Conversation, DbUser } from "@/lib/types";
import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

function assertDbReady() {
  if (!isDataConfigured()) {
    throw new Error("Database is not configured. Add credentials to .env.local");
  }
}

async function safe(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    console.warn(`[removePortalMember] ${label}:`, e instanceof Error ? e.message : e);
  }
}

async function clearFk(
  collection: (typeof COLLECTIONS)[keyof typeof COLLECTIONS],
  matchField: string,
  userId: string,
  opts?: { clearField?: string; stampUpdatedAt?: boolean }
) {
  const clearField = opts?.clearField ?? matchField;
  const data: Record<string, unknown> = { [clearField]: "" };
  if (opts?.stampUpdatedAt !== false) {
    data.updated_at = new Date().toISOString();
  }
  await updateDocuments(collection, { [matchField]: userId }, data);
}

async function revokeClerkInvitesForEmail(email: string) {
  const client = await clerkClient();
  const seen = new Set<string>();
  const pages = await Promise.all([
    client.invitations.getInvitationList({ query: email, limit: 100 }),
    client.invitations.getInvitationList({ status: "pending", limit: 100 }),
  ]);
  for (const page of pages) {
    for (const inv of page.data) {
      if (seen.has(inv.id)) continue;
      seen.add(inv.id);
      if (
        inv.emailAddress.toLowerCase() === email &&
        inv.status === "pending"
      ) {
        await client.invitations.revokeInvitation(inv.id);
      }
    }
  }
}

async function purgeUserData(userId: string, email: string) {
  const now = new Date().toISOString();

  // ── Client company link ───────────────────────────────────
  await safe("unlink clients", () =>
    updateDocuments(
      COLLECTIONS.clients,
      { primary_user_id: userId },
      { primary_user_id: "", updated_at: now }
    )
  );

  // ── Sales onboarding ──────────────────────────────────────
  await safe("delete sales_profile by id", () =>
    deleteDocument(COLLECTIONS.sales_profiles, userId)
  );
  await safe("delete sales_profiles by user_id", () =>
    deleteDocuments(COLLECTIONS.sales_profiles, { user_id: userId })
  );

  // ── Chat: delete conversations they are in (+ their messages) ─
  await safe("delete chat", async () => {
    const [asOneRaw, asTwoRaw] = await Promise.all([
      listDocuments(COLLECTIONS.conversations, {
        equal: { participant_one_id: userId },
        limit: 200,
      }),
      listDocuments(COLLECTIONS.conversations, {
        equal: { participant_two_id: userId },
        limit: 200,
      }),
    ]);
    const asOne = asOneRaw as unknown as Conversation[];
    const asTwo = asTwoRaw as unknown as Conversation[];
    const convIds = [
      ...new Set([...asOne, ...asTwo].map((c) => c.id).filter(Boolean)),
    ];
    for (const conversationId of convIds) {
      await deleteDocuments(COLLECTIONS.messages, {
        conversation_id: conversationId,
      });
      await deleteDocument(COLLECTIONS.conversations, conversationId);
    }
    // Orphan messages sent by them in any remaining thread
    await deleteDocuments(COLLECTIONS.messages, { sender_id: userId });
  });

  // ── Activities & feedback they authored ───────────────────
  await safe("delete activities", () =>
    deleteDocuments(COLLECTIONS.activities, { author_id: userId })
  );
  await safe("delete feedback", () =>
    deleteDocuments(COLLECTIONS.feedback, { author_id: userId })
  );

  // ── Invite requests ───────────────────────────────────────
  await safe("delete invite requests by requester", () =>
    deleteDocuments(COLLECTIONS.client_invite_requests, {
      requested_by: userId,
    })
  );
  if (email) {
    await safe("delete invite requests by email", () =>
      deleteDocuments(COLLECTIONS.client_invite_requests, { email })
    );
  }
  await safe("clear invite reviewer", () =>
    updateDocuments(
      COLLECTIONS.client_invite_requests,
      { reviewed_by: userId },
      { reviewed_by: "", updated_at: now }
    )
  );

  // ── Clear FK references (keep the parent records) ─────────
  await safe("clear lead owner", () =>
    clearFk(COLLECTIONS.leads, "owner_id", userId)
  );
  await safe("clear lead assigned_to", () =>
    clearFk(COLLECTIONS.leads, "assigned_to", userId)
  );
  await safe("clear deal owner", () =>
    clearFk(COLLECTIONS.deals, "owner_id", userId)
  );
  await safe("clear project assigned_to", () =>
    clearFk(COLLECTIONS.projects, "assigned_to", userId)
  );
  await safe("clear project created_by", () =>
    clearFk(COLLECTIONS.projects, "created_by", userId)
  );
  await safe("clear deliverable uploaded_by", () =>
    clearFk(COLLECTIONS.deliverables, "uploaded_by", userId)
  );
  await safe("clear contract created_by", () =>
    clearFk(COLLECTIONS.contracts, "created_by", userId)
  );
  await safe("clear invoice created_by", () =>
    clearFk(COLLECTIONS.invoices, "created_by", userId)
  );
  await safe("clear client created_by", () =>
    clearFk(COLLECTIONS.clients, "created_by", userId)
  );
  await safe("clear conversation typing", () =>
    updateDocuments(
      COLLECTIONS.conversations,
      { typing_user_id: userId },
      { typing_user_id: "", updated_at: now }
    )
  );

  // ── Audit logs about / by this person ─────────────────────
  if (email) {
    await safe("delete audit by actor_email", async () => {
      const rows = await listDocuments(COLLECTIONS.audit_logs, {
        equal: { actor_email: email },
        limit: 200,
      });
      for (const row of rows) {
        await deleteDocument(COLLECTIONS.audit_logs, String(row.id));
      }
    });
    await safe("delete audit by target_label", async () => {
      const rows = await listDocuments(COLLECTIONS.audit_logs, {
        equal: { target_label: email },
        limit: 200,
      });
      for (const row of rows) {
        await deleteDocument(COLLECTIONS.audit_logs, String(row.id));
      }
    });
  }
  await safe("clear audit actor_id", () =>
    updateDocuments(
      COLLECTIONS.audit_logs,
      { actor_id: userId },
      { actor_id: "" }
    )
  );
  await safe("delete audit by target_id", async () => {
    const rows = await listDocuments(COLLECTIONS.audit_logs, {
      equal: { target_id: userId },
      limit: 200,
    });
    for (const row of rows) {
      await deleteDocument(COLLECTIONS.audit_logs, String(row.id));
    }
  });

  // ── User row last ─────────────────────────────────────────
  await deleteDocument(COLLECTIONS.users, userId);
}

/**
 * Permanently remove a sales rep or client from Clerk + Appwrite.
 * Deletes chat, profiles, invite requests, authored activities/feedback,
 * clears FK references, revokes invites, and removes the user record.
 */
export async function removePortalMember(userId: string) {
  const owner = await requireOwner();
  if (!userId) throw new Error("User id is required");
  if (userId === owner.id) throw new Error("You cannot remove yourself");

  if (isDemoMode()) {
    const removed = mutateStore((store) => {
      const target = store.users.find((u) => u.id === userId);
      if (!target) throw new Error("User not found");
      if (target.role !== "sales" && target.role !== "client") {
        throw new Error("Only sales reps and clients can be removed this way");
      }
      const email = target.email.toLowerCase();
      store.users = store.users.filter((u) => u.id !== userId);
      store.sales_profiles = store.sales_profiles.filter((p) => p.user_id !== userId);
      for (const client of store.clients) {
        if (client.primary_user_id === userId) client.primary_user_id = null;
        if (client.created_by === userId) client.created_by = null;
      }
      for (const lead of store.leads) {
        if (lead.owner_id === userId) lead.owner_id = null;
        if (lead.assigned_to === userId) lead.assigned_to = null;
      }
      for (const deal of store.deals) {
        if (deal.owner_id === userId) deal.owner_id = null;
      }
      for (const project of store.projects) {
        if (project.assigned_to === userId) project.assigned_to = null;
        if (project.created_by === userId) project.created_by = null;
      }
      for (const d of store.deliverables) {
        if (d.uploaded_by === userId) d.uploaded_by = null;
      }
      for (const c of store.contracts) {
        if (c.created_by === userId) c.created_by = null;
      }
      for (const inv of store.invoices) {
        if (inv.created_by === userId) inv.created_by = null;
      }
      store.conversations = store.conversations.filter(
        (c) => c.participant_one_id !== userId && c.participant_two_id !== userId
      );
      const keepConv = new Set(store.conversations.map((c) => c.id));
      store.messages = store.messages.filter(
        (m) => m.sender_id !== userId && keepConv.has(m.conversation_id)
      );
      store.activities = store.activities.filter((a) => a.author_id !== userId);
      store.feedback = store.feedback.filter((f) => f.author_id !== userId);
      store.client_invite_requests = store.client_invite_requests.filter(
        (r) =>
          r.requested_by !== userId && r.email.toLowerCase() !== email
      );
      for (const r of store.client_invite_requests) {
        if (r.reviewed_by === userId) r.reviewed_by = null;
      }
      if (store.audit_logs) {
        store.audit_logs = store.audit_logs.filter(
          (a) =>
            a.actor_id !== userId &&
            a.target_id !== userId &&
            a.actor_email?.toLowerCase() !== email &&
            a.target_label?.toLowerCase() !== email
        );
      }
      return target;
    });
    revalidatePath("/crm/team");
    revalidatePath("/crm/contacts");
    revalidatePath("/crm/audit");
    revalidatePath("/crm/messages");
    await recordAuditLog({
      action: "member.removed",
      actor: owner,
      targetType: "user",
      targetId: userId,
      targetLabel: removed.email,
      summary: `Removed ${removed.role} ${removed.email}`,
      metadata: { role: removed.role, email: removed.email },
    });
    return;
  }

  assertDbReady();
  const target = (await getDocument(COLLECTIONS.users, userId)) as unknown as
    | (DbUser & { clerk_id?: string })
    | null;
  if (!target) throw new Error("User not found");
  if (target.role !== "sales" && target.role !== "client") {
    throw new Error("Only sales reps and clients can be removed this way");
  }

  const clerkId = String(target.clerk_id || "");
  const email = String(target.email || "")
    .trim()
    .toLowerCase();

  // ── Clerk: delete account(s) for this email + revoke invites ─
  await safe("delete Clerk user by id", async () => {
    if (!clerkId || clerkId.startsWith("demo-") || clerkId === "local-dev-user") {
      return;
    }
    const client = await clerkClient();
    try {
      await client.users.deleteUser(clerkId);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!/not found|404|resource_not_found/i.test(message)) throw e;
    }
  });

  if (email) {
    await safe("delete Clerk users by email", async () => {
      const client = await clerkClient();
      const { data } = await client.users.getUserList({
        emailAddress: [email],
      });
      for (const u of data) {
        try {
          await client.users.deleteUser(u.id);
        } catch {
          /* already gone */
        }
      }
    });
    await safe("revoke Clerk invitations", () => revokeClerkInvitesForEmail(email));
  }

  // ── Appwrite: purge related data then user ────────────────
  try {
    await purgeUserData(userId, email);
  } catch (e) {
    throw new Error(
      `Failed to purge user data: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  revalidatePath("/crm/team");
  revalidatePath("/crm/contacts");
  revalidatePath("/crm/clients");
  revalidatePath("/crm/audit");
  revalidatePath("/crm/messages");
  revalidatePath("/portal/messages");

  // Record removal AFTER purge so this audit entry is the only one left about them
  await recordAuditLog({
    action: "member.removed",
    actor: owner,
    targetType: "user",
    targetId: userId,
    targetLabel: email || target.email,
    summary: `Removed ${target.role} ${email || target.email} (full purge)`,
    metadata: { role: target.role, email: email || target.email, purged: true },
  });
}
