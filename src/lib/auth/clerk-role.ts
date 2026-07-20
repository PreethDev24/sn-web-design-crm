import { clerkClient } from "@clerk/nextjs/server";
import type { UserRole } from "@/lib/types";

const VALID_ROLES = new Set<UserRole>(["owner", "sales", "client"]);

function parseRole(value: unknown): UserRole | undefined {
  return typeof value === "string" && VALID_ROLES.has(value as UserRole)
    ? (value as UserRole)
    : undefined;
}

export async function resolveClerkRole(
  clerkUserId: string,
  email?: string | null
): Promise<UserRole | undefined> {
  const client = await clerkClient();
  const clerkUser = await client.users.getUser(clerkUserId);
  const fromUser = parseRole(clerkUser.publicMetadata?.role);
  if (fromUser) return fromUser;

  const lookupEmail = email ?? clerkUser.emailAddresses[0]?.emailAddress;
  if (!lookupEmail) return undefined;

  return resolveInvitedRole(lookupEmail);
}

export async function resolveInvitedRole(email: string): Promise<UserRole | undefined> {
  const client = await clerkClient();
  const normalized = email.trim().toLowerCase();

  const { data: invitations } = await client.invitations.getInvitationList({
    query: normalized,
  });

  const match = invitations
    .filter((invite) => invite.emailAddress.toLowerCase() === normalized)
    .filter((invite) => invite.status === "pending" || invite.status === "accepted")
    .sort((a, b) => b.createdAt - a.createdAt)[0];

  return parseRole(match?.publicMetadata?.role);
}

export async function syncClerkUserRole(clerkUserId: string, role: UserRole) {
  const client = await clerkClient();
  await client.users.updateUserMetadata(clerkUserId, {
    publicMetadata: { role },
  });
}

export async function syncClerkRoleByEmail(email: string, role: UserRole) {
  const client = await clerkClient();
  const { data: users } = await client.users.getUserList({
    emailAddress: [email],
  });

  await Promise.all(
    users.map((user) =>
      client.users.updateUserMetadata(user.id, {
        publicMetadata: { role },
      })
    )
  );
}
