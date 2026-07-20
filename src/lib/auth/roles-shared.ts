import type { UserRole } from "@/lib/types";

export function isStaffRole(role: UserRole | string | undefined | null): boolean {
  return role === "owner" || role === "sales";
}

export function canAccessInvoices(role: UserRole | string | undefined | null): boolean {
  return role === "owner";
}
