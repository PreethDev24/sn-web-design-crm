/**
 * Import exported JSON + files into Appwrite.
 * Usage: npm run appwrite:import
 * Run after: npm run appwrite:setup && npm run appwrite:export
 */
import { Client, Databases, Storage, ID, Query } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import {
  readFileSync,
  existsSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { resolve, join, basename } from "node:path";

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
  console.error("Missing Appwrite env vars");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(KEY);
const databases = new Databases(client);
const storage = new Storage(client);

const DATA = resolve(process.cwd(), "scripts/appwrite/data");
const ID_MAP = {}; // legacyId → appwriteId when remapped
const URL_MAP = {}; // old public URL → new Appwrite view URL

function isValidAppwriteId(id) {
  return typeof id === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(id);
}

function mapId(legacy) {
  if (!legacy) return legacy;
  return ID_MAP[legacy] || legacy;
}

function rewriteUrls(value) {
  if (typeof value !== "string") return value;
  let out = value;
  for (const [oldUrl, newUrl] of Object.entries(URL_MAP)) {
    if (out.includes(oldUrl)) out = out.split(oldUrl).join(newUrl);
  }
  return out;
}

function toDocData(row, { idField = "id", jsonFields = [], fkFields = [] } = {}) {
  const data = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === idField || key === "user_id" && idField === "user_id") continue;
    if (value === undefined) continue;
    let v = value;
    if (fkFields.includes(key) && typeof v === "string") v = mapId(v);
    if (jsonFields.includes(key) && v !== null && typeof v === "object") {
      v = JSON.stringify(v);
    }
    if (typeof v === "string" && (key.endsWith("_url") || key === "file_url" || key === "preview_url")) {
      v = rewriteUrls(v);
    }
    // Appwrite rejects null for optional attrs sometimes — omit nulls
    if (v === null) continue;
    data[key] = v;
  }
  return data;
}

async function createDoc(collectionId, preferredId, data, legacyId) {
  let documentId = preferredId && isValidAppwriteId(preferredId) ? preferredId : ID.unique();
  if (preferredId && !isValidAppwriteId(preferredId)) {
    documentId = ID.unique();
    ID_MAP[preferredId] = documentId;
    console.warn(`  remapped invalid id ${preferredId} → ${documentId} (${collectionId})`);
  }
  if (legacyId && legacyId !== documentId) {
    ID_MAP[legacyId] = documentId;
  }
  try {
    await databases.createDocument(DATABASE_ID, collectionId, documentId, data);
  } catch (e) {
    const msg = String(e?.message || e);
    if (/already exists|409/i.test(msg)) {
      await databases.updateDocument(DATABASE_ID, collectionId, documentId, data);
      return documentId;
    }
    throw e;
  }
  return documentId;
}

function loadJson(name) {
  const path = join(DATA, `${name}.json`);
  if (!existsSync(path)) {
    console.warn(`  missing ${name}.json — skip`);
    return [];
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

async function importCollection(name, { idField = "id", jsonFields = [], fkFields = [], idFrom } = {}) {
  const rows = loadJson(name);
  console.log(`→ ${name} (${rows.length})`);
  for (const row of rows) {
    const preferredId = idFrom ? idFrom(row) : row[idField];
    const data = toDocData(row, { idField, jsonFields, fkFields });
    // sales_profiles: also store user_id attribute
    if (name === "sales_profiles" && row.user_id) {
      data.user_id = mapId(row.user_id);
    }
    await createDoc(name, preferredId, data, row[idField] || row.user_id);
  }
}

async function importFiles() {
  const manifestPath = join(DATA, "storage-manifest.json");
  if (!existsSync(manifestPath)) {
    console.warn("No storage-manifest.json — skip files");
    return;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  console.log(`→ storage files (${manifest.length})`);
  for (const entry of manifest) {
    const localPath = join(DATA, entry.local);
    if (!existsSync(localPath)) {
      console.warn(`  missing file ${entry.local}`);
      continue;
    }
    const buf = readFileSync(localPath);
    const safeName = entry.path.replace(/[^a-zA-Z0-9._/-]/g, "_");
    const fileId = isValidAppwriteId(basename(safeName).slice(0, 36))
      ? basename(safeName).replace(/\./g, "_").slice(0, 36)
      : ID.unique();
    try {
      await storage.createFile(
        entry.bucket,
        fileId,
        InputFile.fromBuffer(buf, basename(entry.path))
      );
    } catch (e) {
      if (!/already exists|409/i.test(String(e?.message || e))) throw e;
    }
    const viewUrl = `${ENDPOINT.replace(/\/$/, "")}/storage/buckets/${entry.bucket}/files/${fileId}/view?project=${PROJECT}`;
    if (entry.old_url) URL_MAP[entry.old_url] = viewUrl;
    entry.new_file_id = fileId;
    entry.new_url = viewUrl;
  }
  writeFileSync(join(DATA, "storage-manifest.json"), JSON.stringify(manifest, null, 2));
}

async function main() {
  if (!existsSync(DATA)) {
    console.error("Run npm run appwrite:export first");
    process.exit(1);
  }

  console.log("Importing into Appwrite…");
  await importFiles();

  // FK-safe order
  await importCollection("users");
  await importCollection("clients", {
    fkFields: ["primary_user_id", "created_by"],
  });
  await importCollection("leads", {
    fkFields: ["owner_id", "converted_client_id"],
  });
  await importCollection("deals", {
    fkFields: ["lead_id", "client_id", "owner_id"],
  });
  await importCollection("projects", {
    fkFields: ["client_id", "assigned_to", "deal_id", "created_by"],
  });
  await importCollection("deliverables", {
    fkFields: ["project_id", "uploaded_by"],
  });
  await importCollection("feedback", {
    fkFields: ["deliverable_id", "author_id"],
  });
  await importCollection("contracts", {
    jsonFields: ["signature_data"],
    fkFields: ["client_id", "project_id", "created_by"],
  });
  await importCollection("invoices", {
    fkFields: ["client_id", "project_id", "created_by"],
  });
  await importCollection("activities", {
    fkFields: ["lead_id", "deal_id", "client_id", "project_id", "author_id"],
  });
  await importCollection("maintenance_plans", { fkFields: ["client_id"] });
  await importCollection("client_invite_requests", {
    fkFields: ["requested_by", "reviewed_by"],
  });
  await importCollection("sales_profiles", {
    idField: "user_id",
    idFrom: (row) => (isValidAppwriteId(row.user_id) ? row.user_id : undefined),
    fkFields: ["user_id"],
  });
  await importCollection("conversations", {
    fkFields: ["participant_one_id", "participant_two_id", "typing_user_id"],
  });
  await importCollection("messages", {
    fkFields: ["conversation_id", "sender_id"],
  });
  await importCollection("audit_logs", {
    jsonFields: ["metadata"],
    fkFields: ["actor_id"],
  });

  writeFileSync(join(DATA, "id-map.json"), JSON.stringify(ID_MAP, null, 2));
  writeFileSync(join(DATA, "url-map.json"), JSON.stringify(URL_MAP, null, 2));
  console.log("\nImport complete. id-map.json + url-map.json written.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
