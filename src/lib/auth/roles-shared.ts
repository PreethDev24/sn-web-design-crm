import type { UserRole } from "@/lib/types";

export function isStaffRole(role: UserRole | string | undefined | null): boolean {
  return role === "owner" || role === "sales";
}

/** Owner/Admin only — billing invoices in CRM */
export function canAccessInvoices(role: UserRole | string | undefined | null): boolean {
  return role === "owner";
}

/** Owner/Admin only — contracts create/send */
export function canAccessContracts(role: UserRole | string | undefined | null): boolean {
  return role === "owner";
}

/** Owner/Admin can create/update projects and upload deliverables; sales is view-only */
export function canManageProjects(role: UserRole | string | undefined | null): boolean {
  return role === "owner";
}

export function canManageDeliverables(role: UserRole | string | undefined | null): boolean {
  return role === "owner";
}
