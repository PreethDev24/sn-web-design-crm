/**
 * Bootstrap Appwrite database, collections, attributes, indexes, and storage buckets.
 * Usage: npm run appwrite:setup
 * Requires: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY
 */
import { Client, Databases, Storage, ID, Permission, Role } from "node-appwrite";
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
  console.error(
    "Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, or APPWRITE_API_KEY. See scripts/appwrite/PHASE0.md"
  );
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(KEY);
const databases = new Databases(client);
const storage = new Storage(client);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ignoreExists(fn) {
  try {
    await fn();
  } catch (e) {
    const msg = String(e?.message || e);
    if (/already exists|409/i.test(msg)) return;
    throw e;
  }
}

async function waitAttribute(collectionId, key, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const attr = await databases.getAttribute(DATABASE_ID, collectionId, key);
      if (attr.status === "available") return;
      if (attr.status === "failed") {
        throw new Error(`Attribute ${collectionId}.${key} failed: ${attr.error}`);
      }
    } catch (e) {
      if (!/not found|404/i.test(String(e?.message || e))) throw e;
    }
    await sleep(500);
  }
  throw new Error(`Timeout waiting for attribute ${collectionId}.${key}`);
}

async function createString(collectionId, key, size, required = false, array = false) {
  await ignoreExists(() =>
    databases.createStringAttribute(DATABASE_ID, collectionId, key, size, required, undefined, array)
  );
  await waitAttribute(collectionId, key);
}

async function createInteger(collectionId, key, required = false) {
  await ignoreExists(() =>
    databases.createIntegerAttribute(DATABASE_ID, collectionId, key, required)
  );
  await waitAttribute(collectionId, key);
}

async function createFloat(collectionId, key, required = false) {
  await ignoreExists(() =>
    databases.createFloatAttribute(DATABASE_ID, collectionId, key, required)
  );
  await waitAttribute(collectionId, key);
}

async function createBoolean(collectionId, key, required = false, defaultVal) {
  await ignoreExists(() =>
    databases.createBooleanAttribute(
      DATABASE_ID,
      collectionId,
      key,
      required,
      defaultVal
    )
  );
  await waitAttribute(collectionId, key);
}

async function createDatetime(collectionId, key, required = false) {
  await ignoreExists(() =>
    databases.createDatetimeAttribute(DATABASE_ID, collectionId, key, required)
  );
  await waitAttribute(collectionId, key);
}

async function createIndex(collectionId, key, type, attrs, orders) {
  await ignoreExists(() =>
    databases.createIndex(DATABASE_ID, collectionId, key, type, attrs, orders)
  );
}

async function ensureCollection(id, name) {
  await ignoreExists(() =>
    databases.createCollection(DATABASE_ID, id, name, [
      Permission.read(Role.any()),
      Permission.write(Role.any()),
    ])
  );
  console.log(`  collection: ${id}`);
}

async function ensureBucket(id, name) {
  await ignoreExists(() =>
    storage.createBucket(
      id,
      name,
      [Permission.read(Role.any()), Permission.write(Role.any())],
      true,
      true,
      undefined,
      ["jpg", "jpeg", "png", "gif", "webp", "pdf", "doc", "docx", "zip", "svg", "txt", "mp4"]
    )
  );
  console.log(`  bucket: ${id}`);
}

const COLLECTIONS = {
  users: async () => {
    await ensureCollection("users", "Users");
    await createString("users", "clerk_id", 128, true);
    await createString("users", "email", 320, true);
    await createString("users", "first_name", 128);
    await createString("users", "last_name", 128);
    await createString("users", "role", 32, true);
    await createString("users", "phone", 64);
    await createString("users", "company_name", 256);
    await createString("users", "avatar_url", 2048);
    await createDatetime("users", "last_seen_at");
    await createDatetime("users", "created_at");
    await createDatetime("users", "updated_at");
    await createIndex("users", "idx_clerk_id", "key", ["clerk_id"], ["ASC"]);
    await createIndex("users", "idx_email", "key", ["email"], ["ASC"]);
    await createIndex("users", "idx_role", "key", ["role"], ["ASC"]);
  },
  clients: async () => {
    await ensureCollection("clients", "Clients");
    await createString("clients", "name", 256, true);
    await createString("clients", "email", 320);
    await createString("clients", "phone", 64);
    await createString("clients", "website", 512);
    await createString("clients", "status", 32, true);
    await createString("clients", "primary_user_id", 64);
    await createString("clients", "notes", 10000);
    await createString("clients", "created_by", 64);
    await createDatetime("clients", "created_at");
    await createDatetime("clients", "updated_at");
    await createIndex("clients", "idx_status", "key", ["status"], ["ASC"]);
    await createIndex("clients", "idx_primary_user", "key", ["primary_user_id"], ["ASC"]);
    await createIndex("clients", "idx_email", "key", ["email"], ["ASC"]);
  },
  leads: async () => {
    await ensureCollection("leads", "Leads");
    await createString("leads", "first_name", 128, true);
    await createString("leads", "last_name", 128);
    await createString("leads", "email", 320);
    await createString("leads", "phone", 64);
    await createString("leads", "company_name", 256);
    await createString("leads", "source", 128);
    await createString("leads", "status", 32, true);
    await createFloat("leads", "estimated_value");
    await createString("leads", "notes", 10000);
    await createString("leads", "owner_id", 64);
    await createString("leads", "converted_client_id", 64);
    await createDatetime("leads", "created_at");
    await createDatetime("leads", "updated_at");
    await createIndex("leads", "idx_status", "key", ["status"], ["ASC"]);
    await createIndex("leads", "idx_owner", "key", ["owner_id"], ["ASC"]);
  },
  deals: async () => {
    await ensureCollection("deals", "Deals");
    await createString("deals", "title", 512, true);
    await createString("deals", "lead_id", 64);
    await createString("deals", "client_id", 64);
    await createString("deals", "stage", 32, true);
    await createFloat("deals", "amount");
    await createString("deals", "close_date", 32);
    await createString("deals", "notes", 10000);
    await createString("deals", "owner_id", 64);
    await createDatetime("deals", "created_at");
    await createDatetime("deals", "updated_at");
    await createIndex("deals", "idx_stage", "key", ["stage"], ["ASC"]);
    await createIndex("deals", "idx_owner", "key", ["owner_id"], ["ASC"]);
    await createIndex("deals", "idx_lead", "key", ["lead_id"], ["ASC"]);
  },
  projects: async () => {
    await ensureCollection("projects", "Projects");
    await createString("projects", "name", 512, true);
    await createString("projects", "description", 10000);
    await createString("projects", "client_id", 64, true);
    await createString("projects", "status", 32, true);
    await createInteger("projects", "progress");
    await createString("projects", "start_date", 32);
    await createString("projects", "target_launch_date", 32);
    await createString("projects", "assigned_to", 64);
    await createString("projects", "deal_id", 64);
    await createString("projects", "created_by", 64);
    await createDatetime("projects", "created_at");
    await createDatetime("projects", "updated_at");
    await createIndex("projects", "idx_client", "key", ["client_id"], ["ASC"]);
    await createIndex("projects", "idx_status", "key", ["status"], ["ASC"]);
    await createIndex("projects", "idx_assigned", "key", ["assigned_to"], ["ASC"]);
  },
  deliverables: async () => {
    await ensureCollection("deliverables", "Deliverables");
    await createString("deliverables", "project_id", 64, true);
    await createString("deliverables", "title", 512, true);
    await createString("deliverables", "description", 10000);
    await createString("deliverables", "file_url", 2048);
    await createString("deliverables", "file_name", 512);
    await createString("deliverables", "preview_url", 2048);
    await createInteger("deliverables", "version");
    await createString("deliverables", "status", 32, true);
    await createString("deliverables", "uploaded_by", 64);
    await createDatetime("deliverables", "approved_at");
    await createDatetime("deliverables", "created_at");
    await createDatetime("deliverables", "updated_at");
    await createIndex("deliverables", "idx_project", "key", ["project_id"], ["ASC"]);
    await createIndex("deliverables", "idx_status", "key", ["status"], ["ASC"]);
  },
  feedback: async () => {
    await ensureCollection("feedback", "Feedback");
    await createString("feedback", "deliverable_id", 64, true);
    await createString("feedback", "author_id", 64, true);
    await createString("feedback", "comment", 10000, true);
    await createBoolean("feedback", "resolved", false, false);
    await createDatetime("feedback", "created_at");
    await createIndex("feedback", "idx_deliverable", "key", ["deliverable_id"], ["ASC"]);
  },
  contracts: async () => {
    await ensureCollection("contracts", "Contracts");
    await createString("contracts", "title", 512, true);
    await createString("contracts", "client_id", 64, true);
    await createString("contracts", "project_id", 64);
    await createString("contracts", "file_url", 2048);
    await createString("contracts", "file_name", 512);
    await createString("contracts", "status", 32, true);
    await createDatetime("contracts", "sent_at");
    await createDatetime("contracts", "viewed_at");
    await createDatetime("contracts", "signed_at");
    await createString("contracts", "signature_data", 100000);
    await createString("contracts", "signer_ip", 128);
    await createString("contracts", "signer_user_agent", 512);
    await createString("contracts", "created_by", 64);
    await createDatetime("contracts", "created_at");
    await createDatetime("contracts", "updated_at");
    await createIndex("contracts", "idx_client", "key", ["client_id"], ["ASC"]);
    await createIndex("contracts", "idx_status", "key", ["status"], ["ASC"]);
  },
  invoices: async () => {
    await ensureCollection("invoices", "Invoices");
    await createString("invoices", "invoice_number", 64, true);
    await createString("invoices", "title", 512, true);
    await createString("invoices", "description", 10000);
    await createString("invoices", "client_id", 64, true);
    await createString("invoices", "project_id", 64);
    await createFloat("invoices", "amount", true);
    await createString("invoices", "currency", 8);
    await createString("invoices", "status", 32, true);
    await createString("invoices", "due_date", 32);
    await createDatetime("invoices", "paid_at");
    await createString("invoices", "stripe_checkout_session_id", 256);
    await createString("invoices", "stripe_payment_intent_id", 256);
    await createString("invoices", "created_by", 64);
    await createDatetime("invoices", "created_at");
    await createDatetime("invoices", "updated_at");
    await createIndex("invoices", "idx_client", "key", ["client_id"], ["ASC"]);
    await createIndex("invoices", "idx_status", "key", ["status"], ["ASC"]);
    await createIndex("invoices", "idx_number", "unique", ["invoice_number"], ["ASC"]);
  },
  activities: async () => {
    await ensureCollection("activities", "Activities");
    await createString("activities", "type", 32, true);
    await createString("activities", "body", 10000, true);
    await createString("activities", "lead_id", 64);
    await createString("activities", "deal_id", 64);
    await createString("activities", "client_id", 64);
    await createString("activities", "project_id", 64);
    await createString("activities", "author_id", 64);
    await createDatetime("activities", "created_at");
    await createIndex("activities", "idx_lead", "key", ["lead_id"], ["ASC"]);
    await createIndex("activities", "idx_deal", "key", ["deal_id"], ["ASC"]);
    await createIndex("activities", "idx_client", "key", ["client_id"], ["ASC"]);
    await createIndex("activities", "idx_project", "key", ["project_id"], ["ASC"]);
  },
  maintenance_plans: async () => {
    await ensureCollection("maintenance_plans", "Maintenance Plans");
    await createString("maintenance_plans", "client_id", 64, true);
    await createString("maintenance_plans", "name", 256, true);
    await createFloat("maintenance_plans", "monthly_amount", true);
    await createString("maintenance_plans", "status", 32, true);
    await createString("maintenance_plans", "notes", 10000);
    await createDatetime("maintenance_plans", "created_at");
    await createDatetime("maintenance_plans", "updated_at");
    await createIndex("maintenance_plans", "idx_client", "key", ["client_id"], ["ASC"]);
  },
  client_invite_requests: async () => {
    await ensureCollection("client_invite_requests", "Client Invite Requests");
    await createString("client_invite_requests", "email", 320, true);
    await createString("client_invite_requests", "client_name", 256);
    await createString("client_invite_requests", "note", 5000);
    await createString("client_invite_requests", "status", 32, true);
    await createString("client_invite_requests", "requested_by", 64, true);
    await createString("client_invite_requests", "reviewed_by", 64);
    await createDatetime("client_invite_requests", "reviewed_at");
    await createString("client_invite_requests", "review_note", 5000);
    await createDatetime("client_invite_requests", "created_at");
    await createDatetime("client_invite_requests", "updated_at");
    await createIndex("client_invite_requests", "idx_status", "key", ["status"], ["ASC"]);
    await createIndex("client_invite_requests", "idx_requested_by", "key", ["requested_by"], ["ASC"]);
    await createIndex("client_invite_requests", "idx_email", "key", ["email"], ["ASC"]);
  },
  sales_profiles: async () => {
    await ensureCollection("sales_profiles", "Sales Profiles");
    await createString("sales_profiles", "user_id", 64, true);
    await createString("sales_profiles", "full_name", 256, true);
    await createString("sales_profiles", "email", 320, true);
    await createString("sales_profiles", "phone", 64);
    await createString("sales_profiles", "calling_from", 256);
    await createString("sales_profiles", "calling_schedule", 1000);
    await createString("sales_profiles", "target_region", 256);
    await createInteger("sales_profiles", "daily_call_goal");
    await createInteger("sales_profiles", "weekly_meeting_goal");
    await createDatetime("sales_profiles", "completed_at", true);
    await createDatetime("sales_profiles", "created_at");
    await createDatetime("sales_profiles", "updated_at");
    await createIndex("sales_profiles", "idx_user_id", "unique", ["user_id"], ["ASC"]);
    await createIndex("sales_profiles", "idx_email", "key", ["email"], ["ASC"]);
  },
  conversations: async () => {
    await ensureCollection("conversations", "Conversations");
    await createString("conversations", "participant_one_id", 64, true);
    await createString("conversations", "participant_two_id", 64, true);
    await createDatetime("conversations", "last_message_at", true);
    await createString("conversations", "typing_user_id", 64);
    await createDatetime("conversations", "typing_until");
    await createDatetime("conversations", "created_at");
    await createDatetime("conversations", "updated_at");
    await createIndex("conversations", "idx_p1", "key", ["participant_one_id"], ["ASC"]);
    await createIndex("conversations", "idx_p2", "key", ["participant_two_id"], ["ASC"]);
    await createIndex("conversations", "idx_pair", "unique", ["participant_one_id", "participant_two_id"], ["ASC", "ASC"]);
  },
  messages: async () => {
    await ensureCollection("messages", "Messages");
    await createString("messages", "conversation_id", 64, true);
    await createString("messages", "sender_id", 64, true);
    await createString("messages", "body", 5000, true);
    await createString("messages", "kind", 16, true);
    await createDatetime("messages", "created_at");
    await createDatetime("messages", "read_at");
    await createIndex("messages", "idx_conversation", "key", ["conversation_id"], ["ASC"]);
    await createIndex("messages", "idx_sender", "key", ["sender_id"], ["ASC"]);
  },
  audit_logs: async () => {
    await ensureCollection("audit_logs", "Audit Logs");
    await createString("audit_logs", "action", 128, true);
    await createString("audit_logs", "actor_id", 64);
    await createString("audit_logs", "actor_email", 320);
    await createString("audit_logs", "actor_role", 32);
    await createString("audit_logs", "target_type", 64);
    await createString("audit_logs", "target_id", 128);
    await createString("audit_logs", "target_label", 512);
    await createString("audit_logs", "summary", 2000, true);
    await createString("audit_logs", "metadata", 100000);
    await createDatetime("audit_logs", "created_at");
    await createIndex("audit_logs", "idx_created", "key", ["created_at"], ["DESC"]);
    await createIndex("audit_logs", "idx_action", "key", ["action"], ["ASC"]);
    await createIndex("audit_logs", "idx_actor", "key", ["actor_id"], ["ASC"]);
  },
};

async function main() {
  console.log(`Setting up Appwrite schema in project ${PROJECT}…`);
  console.log(`Database ID: ${DATABASE_ID}`);

  await ignoreExists(() => databases.create(DATABASE_ID, "SN Web Design CRM"));
  console.log("Database ready");

  for (const [name, setup] of Object.entries(COLLECTIONS)) {
    console.log(`→ ${name}`);
    await setup();
  }

  console.log("→ storage buckets");
  await ensureBucket("deliverables", "Deliverables");
  await ensureBucket("contracts", "Contracts");

  console.log("\nSchema setup complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
