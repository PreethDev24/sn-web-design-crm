/**
 * Restore portal visibility after terminated clients / missing primary_user links.
 * Does not wipe data — only repairs links + statuses from known export emails.
 */
import { Client, Databases, Users, Query, ID } from "node-appwrite";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnv();

const aw = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(aw);
const DB = process.env.APPWRITE_DATABASE_ID;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function listAll(collection) {
  const out = [];
  let offset = 0;
  for (;;) {
    const page = await db.listDocuments(DB, collection, [
      Query.limit(100),
      Query.offset(offset),
    ]);
    out.push(...page.documents);
    if (page.documents.length < 100) break;
    offset += page.documents.length;
  }
  return out;
}

async function main() {
  console.log("Repairing portal data in Appwrite…");

  // Prefer live Supabase for any better primary_user_id / status if present
  const { data: sbClients } = await supabase.from("clients").select("*");
  const { data: sbProjects } = await supabase.from("projects").select("*");
  const { data: sbUsers } = await supabase.from("users").select("*");

  console.log(
    `Supabase snapshot: users=${sbUsers?.length ?? 0} clients=${sbClients?.length ?? 0} projects=${sbProjects?.length ?? 0}`
  );
  for (const c of sbClients ?? []) {
    console.log(
      `  SB client ${c.name}: status=${c.status} primary_user_id=${c.primary_user_id}`
    );
  }

  const clients = await listAll("clients");
  const projects = await listAll("projects");
  const users = await listAll("users");

  // 1) Reactivate churned clients
  for (const c of clients) {
    const patch = {};
    if (c.status === "churned") patch.status = "active";

    // Restore primary_user_id from Supabase if available
    const sb = (sbClients ?? []).find((x) => x.id === c.$id);
    if (sb?.primary_user_id && !c.primary_user_id) {
      patch.primary_user_id = sb.primary_user_id;
    }

    // Link by email to an existing Appwrite user with role client (or any matching email)
    if (!patch.primary_user_id && !c.primary_user_id && c.email) {
      const match = users.find(
        (u) => u.email?.toLowerCase() === String(c.email).toLowerCase()
      );
      if (match) {
        patch.primary_user_id = match.$id;
        if (match.role !== "client") {
          await db.updateDocument(DB, "users", match.$id, { role: "client" });
          console.log(`  set user ${match.email} role → client`);
        }
      }
    }

    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      await db.updateDocument(DB, "clients", c.$id, patch);
      console.log(`  updated client ${c.name}:`, patch);
    } else {
      console.log(`  client ${c.name}: no change (status=${c.status}, primary=${c.primary_user_id})`);
    }
  }

  // 2) Un-terminate projects (restore from Supabase status when possible)
  for (const p of projects) {
    const sb = (sbProjects ?? []).find((x) => x.id === p.$id);
    const desired = sb?.status && sb.status !== "terminated" ? sb.status : null;
    if (p.status === "terminated") {
      const next = desired || "discovery";
      await db.updateDocument(DB, "projects", p.$id, {
        status: next,
        updated_at: new Date().toISOString(),
      });
      console.log(`  project ${p.$id}: terminated → ${next}`);
    }
  }

  // 3) If client emails have no user row, leave a note — owner must re-invite
  const refreshed = await listAll("clients");
  for (const c of refreshed) {
    if (!c.primary_user_id && c.email) {
      console.log(
        `  WARN: client "${c.name}" (${c.email}) still has no portal user. Invite them as role=client from Team.`
      );
    } else if (c.primary_user_id) {
      console.log(`  OK: client "${c.name}" linked to user ${c.primary_user_id}`);
    }
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
