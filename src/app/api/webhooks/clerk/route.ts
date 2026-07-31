import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { resolveInvitedRole } from "@/lib/auth/clerk-role";
import {
  isDataConfigured,
  findOneBy,
  findByEmailIlike,
  createDocument,
  updateDocument,
  updateDocuments,
  deleteDocuments,
  countDocuments,
  COLLECTIONS,
} from "@/lib/db/repo";
import type { UserRole } from "@/lib/types";

type ClerkWebhookEvent = {
  type: string;
  data: {
    id: string;
    email_addresses?: { email_address: string }[];
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string;
    public_metadata?: { role?: UserRole };
  };
};

export async function POST(req: NextRequest) {
  if (!isDataConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  const secret = process.env.CLERK_WEBHOOK_SECRET;
  const payload = await req.text();

  let event: ClerkWebhookEvent;

  if (secret) {
    const wh = new Webhook(secret);
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");
    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
    }
    try {
      event = wh.verify(payload, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as ClerkWebhookEvent;
    } catch {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  } else {
    // Allow unverified in local if secret not set
    event = JSON.parse(payload) as ClerkWebhookEvent;
  }

  if (event.type === "user.created" || event.type === "user.updated") {
    const now = new Date().toISOString();
    const email = event.data.email_addresses?.[0]?.email_address ?? "";
    let role = (event.data.public_metadata?.role as UserRole | undefined) ?? undefined;
    if (!role && email) {
      try {
        role = await resolveInvitedRole(email);
      } catch (e) {
        console.warn("Could not resolve invited role:", e);
      }
    }
    if (!role) {
      const count = await countDocuments(COLLECTIONS.users);
      role = (count ?? 0) === 0 ? "owner" : "client";
    }

    const existing = await findOneBy(COLLECTIONS.users, {
      clerk_id: event.data.id,
    }) as unknown as ({ id: string; role: UserRole }) | null;

    let dbUserId: string | null = null;

    if (existing) {
      await updateDocument(COLLECTIONS.users, existing.id, {
        email,
        first_name: event.data.first_name,
        last_name: event.data.last_name,
        avatar_url: event.data.image_url,
        role,
        updated_at: now,
      });
      dbUserId = existing.id;
    } else if (email) {
      const byEmail = await findByEmailIlike(
        COLLECTIONS.users,
        email
      ) as unknown as ({ id: string; role: UserRole }) | null;

      if (byEmail) {
        await updateDocument(COLLECTIONS.users, byEmail.id, {
          clerk_id: event.data.id,
          email,
          first_name: event.data.first_name,
          last_name: event.data.last_name,
          avatar_url: event.data.image_url,
          role: event.data.public_metadata?.role ?? byEmail.role,
          updated_at: now,
        });
        dbUserId = byEmail.id;
      } else {
        const created = await createDocument(COLLECTIONS.users, {
          clerk_id: event.data.id,
          email,
          first_name: event.data.first_name,
          last_name: event.data.last_name,
          avatar_url: event.data.image_url,
          role,
          created_at: now,
          updated_at: now,
        }) as unknown as ({ id: string });
        dbUserId = created.id;
      }
    } else {
      const created = await createDocument(COLLECTIONS.users, {
        clerk_id: event.data.id,
        email,
        first_name: event.data.first_name,
        last_name: event.data.last_name,
        avatar_url: event.data.image_url,
        role,
        created_at: now,
        updated_at: now,
      }) as unknown as ({ id: string });
      dbUserId = created.id;
    }

    // Link client user to client company by email
    if (role === "client" && email && dbUserId) {
      await updateDocuments(
        COLLECTIONS.clients,
        { email },
        { primary_user_id: dbUserId },
        { isNull: ["primary_user_id"] }
      );
    }
  }

  if (event.type === "user.deleted") {
    await deleteDocuments(COLLECTIONS.users, { clerk_id: event.data.id });
  }

  return NextResponse.json({ ok: true });
}
