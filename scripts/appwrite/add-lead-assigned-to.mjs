/**
 * Add leads.assigned_to if missing (without re-running full schema setup).
 * Usage: node scripts/appwrite/add-lead-assigned-to.mjs
 */
import { Client, Databases } from "node-appwrite";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
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

loadEnvLocal();

const ENDPOINT = process.env.APPWRITE_ENDPOINT?.trim();
const PROJECT = process.env.APPWRITE_PROJECT_ID?.trim();
const KEY = process.env.APPWRITE_API_KEY?.trim();
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID?.trim() || "sn_crm";

if (!ENDPOINT || !PROJECT || !KEY) {
  console.error("Missing Appwrite env");
  process.exit(1);
}

const databases = new Databases(
  new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(KEY)
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitAttribute(key, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const attr = await databases.getAttribute(DATABASE_ID, "leads", key);
      if (attr.status === "available") return attr;
      if (attr.status === "failed") {
        throw new Error(`Attribute leads.${key} failed: ${attr.error}`);
      }
    } catch (e) {
      if (!/not found|404/i.test(String(e?.message || e))) throw e;
    }
    await sleep(500);
  }
  throw new Error(`Timeout waiting for leads.${key}`);
}

try {
  await databases.getAttribute(DATABASE_ID, "leads", "assigned_to");
  console.log("leads.assigned_to already exists");
} catch {
  console.log("Creating leads.assigned_to…");
  await databases.createStringAttribute(
    DATABASE_ID,
    "leads",
    "assigned_to",
    64,
    false
  );
  await waitAttribute("assigned_to");
  console.log("leads.assigned_to available");
}

try {
  await databases.createIndex(
    DATABASE_ID,
    "leads",
    "idx_assigned",
    "key",
    ["assigned_to"],
    ["ASC"]
  );
  console.log("idx_assigned created");
} catch (e) {
  if (/already exists|409/i.test(String(e?.message || e))) {
    console.log("idx_assigned already exists");
  } else {
    throw e;
  }
}

console.log("Done");
