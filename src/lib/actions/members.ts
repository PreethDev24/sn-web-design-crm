"use server";

import { requireOwner } from "@/lib/auth/roles";
import { recordAuditLog } from "@/lib/audit/log";
import {
  isDataConfigured,
  getDocument,
  deleteDocument,
  deleteDocuments,
  updateDocuments,
  COLLECTIONS,
} from "@/lib/db/repo";
import { isDemoMode } from "@/lib/demo/mode";
import { mutateStore } from "@/lib/demo/store";
import type { DbUser } from "@/lib/types";
import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

function assertDbReady() {
  if (!isDataConfigured()) {
    throw new Error("Database is not configured. Add credentials to .env.local");
  }
}

/**
 * Permanently remove a sales rep or client from Clerk + the database.
 * Owners cannot remove themselves or other owners.
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
      store.users = store.users.filter((u) => u.id !== userId);
      store.sales_profiles = store.sales_profiles.filter((p) => p.user_id !== userId);
      for (const client of store.clients) {
        if (client.primary_user_id === userId) client.primary_user_id = null;
      }
      return target;
    });
    revalidatePath("/crm/team");
    revalidatePath("/crm/contacts");
    revalidatePath("/crm/audit");
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

  if (clerkId && !clerkId.startsWith("demo-") && clerkId !== "local-dev-user") {
    try {
      const client = await clerkClient();
      await client.users.deleteUser(clerkId);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!/not found|404|resource_not_found/i.test(message)) {
        throw new Error(`Failed to delete Clerk user: ${message}`);
      }
    }
  }

  if (email) {
    try {
      const client = await clerkClient();
      const { data: invitations } = await client.invitations.getInvitationList({
        query: email,
      });
      await Promise.all(
        invitations
          .filter(
            (inv) =>
              inv.emailAddress.toLowerCase() === email && inv.status === "pending"
          )
          .map((inv) => client.invitations.revokeInvitation(inv.id))
      );
    } catch (e) {
      console.warn("Could not revoke pending invitations:", e);
    }
  }

  // Unlink client companies (Appwrite rejects JSON null — use empty string)
  try {
    await updateDocuments(
      COLLECTIONS.clients,
      { primary_user_id: userId },
      { primary_user_id: "", updated_at: new Date().toISOString() }
    );
  } catch (e) {
    console.warn("Could not unlink client primary_user_id:", e);
  }

  // sales_profiles are stored with document $id === user_id
  try {
    await deleteDocument(COLLECTIONS.sales_profiles, userId);
  } catch {
    /* may not exist */
  }
  try {
    await deleteDocuments(COLLECTIONS.sales_profiles, { user_id: userId });
  } catch (e) {
    console.warn("Could not delete sales_profiles by user_id:", e);
  }

  try {
    await deleteDocument(COLLECTIONS.users, userId);
  } catch (e) {
    throw new Error(
      `Failed to delete user record: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  revalidatePath("/crm/team");
  revalidatePath("/crm/contacts");
  revalidatePath("/crm/clients");
  revalidatePath("/crm/audit");
  revalidatePath("/crm/messages");
  await recordAuditLog({
    action: "member.removed",
    actor: owner,
    targetType: "user",
    targetId: userId,
    targetLabel: email || target.email,
    summary: `Removed ${target.role} ${email || target.email}`,
    metadata: { role: target.role, email: email || target.email },
  });
}
