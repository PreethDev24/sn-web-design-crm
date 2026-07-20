import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { resolveInvitedRole } from "@/lib/auth/clerk-role";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/db/supabase";
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
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
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

  const supabase = getSupabaseAdmin();

  if (event.type === "user.created" || event.type === "user.updated") {
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
      const { count } = await supabase.from("users").select("*", { count: "exact", head: true });
      role = (count ?? 0) === 0 ? "owner" : "client";
    }

    const { data: existing } = await supabase
      .from("users")
      .select("id, role")
      .eq("clerk_id", event.data.id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("users")
        .update({
          email,
          first_name: event.data.first_name,
          last_name: event.data.last_name,
          avatar_url: event.data.image_url,
          role,
        })
        .eq("clerk_id", event.data.id);
    } else if (email) {
      const { data: byEmail } = await supabase
        .from("users")
        .select("id, role")
        .ilike("email", email)
        .maybeSingle();

      if (byEmail) {
        await supabase
          .from("users")
          .update({
            clerk_id: event.data.id,
            email,
            first_name: event.data.first_name,
            last_name: event.data.last_name,
            avatar_url: event.data.image_url,
            role: event.data.public_metadata?.role ?? byEmail.role,
          })
          .eq("id", byEmail.id);
      } else {
        await supabase.from("users").insert({
          clerk_id: event.data.id,
          email,
          first_name: event.data.first_name,
          last_name: event.data.last_name,
          avatar_url: event.data.image_url,
          role,
        });
      }
    } else {
      await supabase.from("users").insert({
        clerk_id: event.data.id,
        email,
        first_name: event.data.first_name,
        last_name: event.data.last_name,
        avatar_url: event.data.image_url,
        role,
      });
    }

    // Link client user to client company by email
    if (role === "client" && email) {
      const { data: dbUser } = await supabase
        .from("users")
        .select("id")
        .eq("clerk_id", event.data.id)
        .single();
      if (dbUser) {
        await supabase
          .from("clients")
          .update({ primary_user_id: dbUser.id })
          .eq("email", email)
          .is("primary_user_id", null);
      }
    }
  }

  if (event.type === "user.deleted") {
    await supabase.from("users").delete().eq("clerk_id", event.data.id);
  }

  return NextResponse.json({ ok: true });
}
