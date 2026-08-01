import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { resolveClerkRole, syncClerkUserRole } from "@/lib/auth/clerk-role";
import {
  isDataConfigured,
  findOneBy,
  findByEmailIlike,
  createDocument,
  updateDocument,
  countDocuments,
  COLLECTIONS,
} from "@/lib/db/repo";
import { isDemoMode } from "@/lib/demo/mode";
import {
  requireDemoAuth,
  requireDemoClient,
  requireDemoOwner,
  requireDemoStaff,
} from "@/lib/demo/auth";
import { canAccessInvoices, canAccessContracts, isStaffRole } from "@/lib/auth/roles-shared";
import type { DbUser, UserRole } from "@/lib/types";

export { canAccessInvoices, canAccessContracts, isStaffRole };

function formatDbError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function getOrCreateDbUser(): Promise<DbUser | null> {
  if (isDemoMode()) {
    return requireDemoAuth();
  }

  const user = await currentUser();
  if (!user) return null;

  if (!isDataConfigured()) {
    const role = (user.publicMetadata?.role as UserRole) || "owner";
    return {
      id: "local-dev-user",
      clerk_id: user.id,
      email: user.emailAddresses[0]?.emailAddress ?? "",
      first_name: user.firstName,
      last_name: user.lastName,
      role,
      phone: null,
      company_name: null,
      avatar_url: user.imageUrl,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  const email =
    user.emailAddresses[0]?.emailAddress || `${user.id.replace(/[^a-zA-Z0-9]/g, "")}@users.local`;

  let metaRole: UserRole | undefined;
  try {
    metaRole = await resolveClerkRole(user.id, email);
  } catch (e) {
    console.warn("Could not resolve Clerk role:", e);
    metaRole = user.publicMetadata?.role as UserRole | undefined;
  }

  const now = new Date().toISOString();
  let existing: DbUser | null;
  try {
    existing = await findOneBy(COLLECTIONS.users, { clerk_id: user.id }) as unknown as (DbUser) | null;
  } catch (e) {
    console.error("Failed to lookup user:", formatDbError(e));
    throw new Error(`User lookup failed: ${formatDbError(e)}`);
  }

  if (existing) {
    const nextRole = metaRole ?? existing.role;
    try {
      const updated = await updateDocument(COLLECTIONS.users, existing.id, {
        role: nextRole,
        email,
        first_name: user.firstName || "",
        last_name: user.lastName || "",
        avatar_url: user.imageUrl || "",
        updated_at: now,
      }) as unknown as (DbUser);

      if (metaRole && metaRole !== existing.role) {
        try {
          await syncClerkUserRole(user.id, metaRole);
        } catch (e) {
          console.warn("Could not sync Clerk publicMetadata.role:", e);
        }
      }

      return updated;
    } catch (e) {
      console.error("Failed to update user:", formatDbError(e));
      return existing;
    }
  }

  // Re-link existing user after Clerk project migration (same email, new clerk_id)
  const byEmail = await findByEmailIlike(COLLECTIONS.users, email) as unknown as (DbUser) | null;

  if (byEmail) {
    const nextRole = metaRole ?? byEmail.role;
    try {
      const relinked = await updateDocument(COLLECTIONS.users, byEmail.id, {
        clerk_id: user.id,
        role: nextRole,
        email,
        first_name: user.firstName || "",
        last_name: user.lastName || "",
        avatar_url: user.imageUrl || "",
        updated_at: now,
      }) as unknown as (DbUser);
      return relinked;
    } catch (e) {
      console.error("Failed to relink user:", formatDbError(e));
      return byEmail;
    }
  }

  const count = await countDocuments(COLLECTIONS.users);
  const role: UserRole = metaRole ?? ((count ?? 0) === 0 ? "owner" : "client");

  if (!metaRole && role === "owner") {
    try {
      const client = await clerkClient();
      await client.users.updateUserMetadata(user.id, {
        publicMetadata: { role: "owner" },
      });
    } catch (e) {
      console.warn("Could not set Clerk publicMetadata.role:", e);
    }
  }

  try {
    const created = await createDocument(COLLECTIONS.users, {
      clerk_id: user.id,
      email,
      first_name: user.firstName || "",
      last_name: user.lastName || "",
      role,
      avatar_url: user.imageUrl || "",
      created_at: now,
      updated_at: now,
    }) as unknown as (DbUser);
    return created;
  } catch (error) {
    // Race: another request created the row — fetch it
    const raced = await findOneBy(COLLECTIONS.users, { clerk_id: user.id }) as unknown as (DbUser) | null;
    if (raced) return raced;

    console.error("Failed to create user:", formatDbError(error), error);
    throw new Error(`Failed to create user: ${formatDbError(error)}`);
  }
}

export async function requireAuth() {
  if (isDemoMode()) return requireDemoAuth();
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const dbUser = await getOrCreateDbUser();
  if (!dbUser) redirect("/sign-in");
  return dbUser;
}

export async function requireStaff() {
  if (isDemoMode()) return requireDemoStaff();
  const user = await requireAuth();
  if (!isStaffRole(user.role)) redirect("/portal/dashboard");
  return user;
}

export async function requireOwner() {
  if (isDemoMode()) return requireDemoOwner();
  const user = await requireStaff();
  if (user.role !== "owner") redirect("/crm/dashboard");
  return user;
}

export async function requireInvoiceAccess() {
  if (isDemoMode()) return requireDemoOwner();
  const user = await requireStaff();
  if (!canAccessInvoices(user.role)) redirect("/crm/dashboard");
  return user;
}

export async function requireContractAccess() {
  if (isDemoMode()) return requireDemoOwner();
  const user = await requireStaff();
  if (!canAccessContracts(user.role)) redirect("/crm/dashboard");
  return user;
}

export async function requireClient() {
  if (isDemoMode()) return requireDemoClient();
  const user = await requireAuth();
  if (user.role !== "client") {
    if (isStaffRole(user.role)) redirect("/crm/dashboard");
    redirect("/sign-in");
  }
  return user;
}
