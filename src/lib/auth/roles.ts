import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { resolveClerkRole, syncClerkUserRole } from "@/lib/auth/clerk-role";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/db/supabase";
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

function formatSupabaseError(error: {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}) {
  return [error.message, error.code && `(${error.code})`, error.details, error.hint]
    .filter(Boolean)
    .join(" ");
}

export async function getOrCreateDbUser(): Promise<DbUser | null> {
  if (isDemoMode()) {
    return requireDemoAuth();
  }

  const user = await currentUser();
  if (!user) return null;

  if (!isSupabaseConfigured()) {
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

  const supabase = getSupabaseAdmin();
  const email =
    user.emailAddresses[0]?.emailAddress || `${user.id.replace(/[^a-zA-Z0-9]/g, "")}@users.local`;

  let metaRole: UserRole | undefined;
  try {
    metaRole = await resolveClerkRole(user.id, email);
  } catch (e) {
    console.warn("Could not resolve Clerk role:", e);
    metaRole = user.publicMetadata?.role as UserRole | undefined;
  }

  const { data: existing, error: lookupError } = await supabase
    .from("users")
    .select("*")
    .eq("clerk_id", user.id)
    .maybeSingle();

  if (lookupError) {
    console.error("Failed to lookup user:", formatSupabaseError(lookupError));
    throw new Error(`User lookup failed: ${formatSupabaseError(lookupError)}`);
  }

  if (existing) {
    const nextRole = metaRole ?? existing.role;
    const { data: updated, error: updateError } = await supabase
      .from("users")
      .update({
        role: nextRole,
        email,
        first_name: user.firstName,
        last_name: user.lastName,
        avatar_url: user.imageUrl,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (updateError) {
      console.error("Failed to update user:", formatSupabaseError(updateError));
      return existing as DbUser;
    }

    if (metaRole && metaRole !== existing.role) {
      try {
        await syncClerkUserRole(user.id, metaRole);
      } catch (e) {
        console.warn("Could not sync Clerk publicMetadata.role:", e);
      }
    }

    return (updated ?? existing) as DbUser;
  }

  // Re-link existing Supabase user after Clerk project migration (same email, new clerk_id)
  const { data: byEmail } = await supabase
    .from("users")
    .select("*")
    .ilike("email", email)
    .maybeSingle();

  if (byEmail) {
    const nextRole = metaRole ?? byEmail.role;
    const { data: relinked, error: relinkError } = await supabase
      .from("users")
      .update({
        clerk_id: user.id,
        role: nextRole,
        email,
        first_name: user.firstName,
        last_name: user.lastName,
        avatar_url: user.imageUrl,
      })
      .eq("id", byEmail.id)
      .select("*")
      .single();

    if (relinkError) {
      console.error("Failed to relink user:", formatSupabaseError(relinkError));
      return byEmail as DbUser;
    }
    return (relinked ?? byEmail) as DbUser;
  }

  const { count } = await supabase.from("users").select("*", { count: "exact", head: true });
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

  const { data: created, error } = await supabase
    .from("users")
    .insert({
      clerk_id: user.id,
      email,
      first_name: user.firstName,
      last_name: user.lastName,
      role,
      avatar_url: user.imageUrl,
    })
    .select("*")
    .single();

  if (error) {
    // Race: another request created the row — fetch it
    const { data: raced } = await supabase
      .from("users")
      .select("*")
      .eq("clerk_id", user.id)
      .maybeSingle();
    if (raced) return raced as DbUser;

    console.error("Failed to create user:", formatSupabaseError(error), error);
    throw new Error(`Failed to create user: ${formatSupabaseError(error)}`);
  }

  return created as DbUser;
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
