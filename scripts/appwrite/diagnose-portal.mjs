import { Client, Databases, Query } from "node-appwrite";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(process.cwd(), ".env.local");
if (existsSync(path)) {
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

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);
const db = new Databases(client);
const id = process.env.APPWRITE_DATABASE_ID;

function strip(doc) {
  const { $id, $createdAt, $updatedAt, $permissions, $databaseId, $collectionId, ...rest } = doc;
  return { id: $id, ...rest };
}

const users = (await db.listDocuments(id, "users", [Query.limit(100)])).documents.map(strip);
const clients = (await db.listDocuments(id, "clients", [Query.limit(100)])).documents.map(strip);
const projects = (await db.listDocuments(id, "projects", [Query.limit(100)]).catch(() => ({ documents: [] }))).documents?.map(strip)
  ?? (await db.listDocuments(id, "projects", [Query.limit(100)])).documents.map(strip);

console.log("=== USERS ===");
for (const u of users) {
  console.log(JSON.stringify({ id: u.id, email: u.email, role: u.role, clerk_id: u.clerk_id }, null, 0));
}
console.log("\n=== CLIENTS ===");
for (const c of clients) {
  console.log(JSON.stringify({ id: c.id, name: c.name, email: c.email, primary_user_id: c.primary_user_id, status: c.status }, null, 0));
}
console.log("\n=== PROJECTS ===");
for (const p of (await db.listDocuments(id, "projects", [Query.limit(100)])).documents.map(strip)) {
  console.log(JSON.stringify({ id: p.id, name: p.name, client_id: p.client_id, status: p.status }, null, 0));
}

console.log("\n=== PORTAL LINK CHECK ===");
for (const u of users.filter((x) => x.role === "client")) {
  const match = clients.filter((c) => c.primary_user_id === u.id);
  const byEmail = clients.filter(
    (c) => c.email && u.email && c.email.toLowerCase() === u.email.toLowerCase()
  );
  console.log(
    `client user ${u.email} (${u.id}): primary_user matches=${match.length}, email matches=${byEmail.length}`
  );
}
