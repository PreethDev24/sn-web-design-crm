import type { UserRole } from "@/lib/types";

/**
 * Allowed pairs:
 * - owner ↔ owner
 * - owner ↔ sales
 * - owner ↔ client
 * (no sales ↔ client)
 */
export function canChatRoles(a: UserRole, b: UserRole): boolean {
  if (a === "owner" || b === "owner") {
    if (
      (a === "sales" && b === "client") ||
      (a === "client" && b === "sales")
    ) {
      return false;
    }
    return true;
  }
  return false;
}

export function orderedParticipantIds(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function chatPartnerRolesFor(viewerRole: UserRole): UserRole[] {
  if (viewerRole === "owner") return ["owner", "sales", "client"];
  if (viewerRole === "sales" || viewerRole === "client") return ["owner"];
  return [];
}
