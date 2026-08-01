/**
 * If Clerk still has pjaltacount@gmail.com (or other client emails),
 * create/link Appwrite users + primary_user_id so portal works again.
 */
import { createClerkClient } from "@clerk/backend";
import { Client, Databases, Query, ID } from "node-appwrite";
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

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const aw = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(aw);
const DB = process.env.APPWRITE_DATABASE_ID;

const CLIENT_EMAILS = ["pjaltacount@gmail.com"];

async function findUserByEmail(email) {
  const res = await db.listDocuments(DB, "users", [
    Query.equal("email", email),
    Query.limit(5),
  ]);
  return res.documents[0] ?? null;
}

async function main() {
  for (const email of CLIENT_EMAILS) {
    console.log(`\n→ ${email}`);
    const { data: clerkUsers } = await clerk.users.getUserList({
      emailAddress: [email],
    });
    if (!clerkUsers.length) {
      console.log("  No Clerk user — invite as client from /crm/team");
      continue;
    }
    const cu = clerkUsers[0];
    console.log(`  Clerk user: ${cu.id}`);

    let doc = await findUserByEmail(email);
    const now = new Date().toISOString();
    const payload = {
      clerk_id: cu.id,
      email,
      first_name: cu.firstName || null,
      last_name: cu.lastName || null,
      role: "client",
      avatar_url: cu.imageUrl || null,
      updated_at: now,
    };

    if (doc) {
      await db.updateDocument(DB, "users", doc.$id, payload);
      console.log(`  updated Appwrite user ${doc.$id}`);
    } else {
      // Prefer UUID-looking id from nowhere — use Clerk-derived stable id if valid, else unique
      const newId = ID.unique();
      doc = await db.createDocument(DB, "users", newId, {
        ...payload,
        created_at: now,
      });
      console.log(`  created Appwrite user ${doc.$id}`);
    }

    const clients = await db.listDocuments(DB, "clients", [
      Query.equal("email", email),
      Query.limit(5),
    ]);
    for (const c of clients.documents) {
      await db.updateDocument(DB, "clients", c.$id, {
        primary_user_id: doc.$id,
        status: "active",
        updated_at: now,
      });
      console.log(`  linked client "${c.name}" → ${doc.$id}`);
    }
    if (!clients.documents.length) {
      console.log("  No client row with that email to link");
    }
  }
  console.log("\nDone. Sign in as the client email to open /portal/dashboard.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
