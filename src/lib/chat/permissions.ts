import type { UserRole } from "@/lib/types";

/** Allowed pairs: owner↔sales and owner↔client (no sales↔client). */
export function canChatRoles(a: UserRole, b: UserRole): boolean {
  if (a === b) return false;
  const roles = new Set([a, b]);
  return (
    (roles.has("owner") && roles.has("sales")) ||
    (roles.has("owner") && roles.has("client"))
  );
}

export function orderedParticipantIds(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function chatPartnerRolesFor(viewerRole: UserRole): UserRole[] {
  if (viewerRole === "owner") return ["sales", "client"];
  if (viewerRole === "sales" || viewerRole === "client") return ["owner"];
  return [];
}
