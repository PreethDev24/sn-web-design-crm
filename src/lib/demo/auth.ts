import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE, isDemoMode } from "@/lib/demo/mode";
import { getDemoUsers, getUserById, mutateStore, newId, touch } from "@/lib/demo/store";
import type { DbUser, UserRole } from "@/lib/types";
import { isStaffRole } from "@/lib/auth/roles-shared";

export { isStaffRole };

const DEFAULT_DEMO_USER = "user-owner";

export async function getDemoUser(): Promise<DbUser> {
  const jar = await cookies();
  const id = jar.get(DEMO_COOKIE)?.value || DEFAULT_DEMO_USER;
  const user = getUserById(id) || getUserById(DEFAULT_DEMO_USER);
  if (!user) {
    // Should never happen after seed
    return {
      id: DEFAULT_DEMO_USER,
      clerk_id: "demo-owner",
      email: "owner@snwebdesign.test",
      first_name: "Sam",
      last_name: "Nguyen",
      role: "owner",
      phone: null,
      company_name: "SN Web Design",
      avatar_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
  return user;
}

export async function setDemoUser(userId: string) {
  const jar = await cookies();
  jar.set(DEMO_COOKIE, userId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function ensureDemoInvite(email: string, role: UserRole, name?: string) {
  return mutateStore((store) => {
    const existing = store.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      existing.role = role;
      existing.updated_at = touch();
      return existing;
    }
    const [first, ...rest] = (name || email.split("@")[0]).split(" ");
    const user: DbUser = {
      id: newId("user"),
      clerk_id: `demo-${newId("clerk")}`,
      email,
      first_name: first || "New",
      last_name: rest.join(" ") || null,
      role,
      phone: null,
      company_name: null,
      avatar_url: null,
      created_at: touch(),
      updated_at: touch(),
    };
    store.users.push(user);
    return user;
  });
}

export async function requireDemoAuth(): Promise<DbUser> {
  return getDemoUser();
}

export async function requireDemoStaff(): Promise<DbUser> {
  const user = await getDemoUser();
  if (!isStaffRole(user.role)) redirect("/portal/dashboard");
  return user;
}

export async function requireDemoOwner(): Promise<DbUser> {
  const user = await requireDemoStaff();
  if (user.role !== "owner") redirect("/crm/dashboard");
  return user;
}

export async function requireDemoClient(): Promise<DbUser> {
  const user = await getDemoUser();
  if (user.role !== "client") {
    if (isStaffRole(user.role)) redirect("/crm/dashboard");
    redirect("/");
  }
  return user;
}

export function listDemoPersonas() {
  return getDemoUsers();
}

export { isDemoMode };
