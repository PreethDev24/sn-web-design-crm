import { Client, Databases, Storage, ID, Query, Permission, Role } from "node-appwrite";
import { APPWRITE_DATABASE_ID, type CollectionName } from "@/lib/db/appwrite-ids";

let client: Client | null = null;
let databases: Databases | null = null;
let storage: Storage | null = null;

export function isAppwriteConfigured() {
  return Boolean(
    process.env.APPWRITE_ENDPOINT?.trim() &&
      process.env.APPWRITE_PROJECT_ID?.trim() &&
      process.env.APPWRITE_API_KEY?.trim()
  );
}

export function getAppwriteClient() {
  if (client) return client;
  const endpoint = process.env.APPWRITE_ENDPOINT?.trim();
  const projectId = process.env.APPWRITE_PROJECT_ID?.trim();
  const apiKey = process.env.APPWRITE_API_KEY?.trim();
  if (!endpoint || !projectId || !apiKey) {
    throw new Error(
      "Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, or APPWRITE_API_KEY. See .env.example."
    );
  }
  client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  return client;
}

export function getAppwriteDatabases() {
  if (!databases) databases = new Databases(getAppwriteClient());
  return databases;
}

export function getAppwriteStorage() {
  if (!storage) storage = new Storage(getAppwriteClient());
  return storage;
}

export { ID, Query, Permission, Role, APPWRITE_DATABASE_ID };

export function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "object") return value as T;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

const JSON_FIELDS = new Set(["signature_data", "metadata"]);

/** Strip Appwrite system fields and map $id → id */
export function fromAppwriteDoc<T extends Record<string, unknown>>(doc: {
  $id: string;
  [key: string]: unknown;
}): T {
  const { $id, $createdAt, $updatedAt, $permissions, $databaseId, $collectionId, ...rest } =
    doc;
  void $createdAt;
  void $updatedAt;
  void $permissions;
  void $databaseId;
  void $collectionId;
  const out: Record<string, unknown> = { id: $id };
  for (const [key, value] of Object.entries(rest)) {
    if (JSON_FIELDS.has(key) && typeof value === "string") {
      out[key] = parseJsonField(value, key === "metadata" ? {} : null);
    } else {
      out[key] = value;
    }
  }
  return out as unknown as T;
}

export function toAppwriteData(data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "id" || key.startsWith("$")) continue;
    // Appwrite string/optional attributes reject JSON null — omit the key instead.
    if (value === undefined || value === null) continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      out[key] = JSON.stringify(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export async function awList(
  collectionId: CollectionName,
  queries: string[] = [],
  limit = 100
) {
  const db = getAppwriteDatabases();
  const all: Record<string, unknown>[] = [];
  let offset = 0;
  for (;;) {
    const page = await db.listDocuments(APPWRITE_DATABASE_ID, collectionId, [
      ...queries,
      Query.limit(Math.min(limit, 100)),
      Query.offset(offset),
    ]);
    all.push(...page.documents);
    if (page.documents.length < 100 || all.length >= limit) break;
    offset += page.documents.length;
  }
  return all.slice(0, limit).map((d) => fromAppwriteDoc(d as { $id: string }));
}

export async function awGet(collectionId: CollectionName, id: string) {
  try {
    const doc = await getAppwriteDatabases().getDocument(
      APPWRITE_DATABASE_ID,
      collectionId,
      id
    );
    return fromAppwriteDoc(doc as { $id: string });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/not found|404/i.test(msg)) return null;
    throw e;
  }
}

export async function awCreate(
  collectionId: CollectionName,
  data: Record<string, unknown>,
  id?: string
) {
  const documentId = id && isValidAppwriteId(id) ? id : ID.unique();
  const doc = await getAppwriteDatabases().createDocument(
    APPWRITE_DATABASE_ID,
    collectionId,
    documentId,
    toAppwriteData(data)
  );
  return fromAppwriteDoc(doc as { $id: string });
}

export async function awUpdate(
  collectionId: CollectionName,
  id: string,
  data: Record<string, unknown>
) {
  const doc = await getAppwriteDatabases().updateDocument(
    APPWRITE_DATABASE_ID,
    collectionId,
    id,
    toAppwriteData(data)
  );
  return fromAppwriteDoc(doc as { $id: string });
}

export async function awDelete(collectionId: CollectionName, id: string) {
  await getAppwriteDatabases().deleteDocument(APPWRITE_DATABASE_ID, collectionId, id);
}

/** Appwrite custom IDs: max 36 chars, a-z A-Z 0-9 . - _ and cannot start with special char */
export function isValidAppwriteId(id: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(id);
}

export async function awUploadFile(
  bucketId: string,
  file: File | Buffer,
  fileName: string,
  fileId?: string
) {
  const { InputFile } = await import("node-appwrite/file");
  const storageClient = getAppwriteStorage();
  const id = fileId && isValidAppwriteId(fileId) ? fileId : ID.unique();
  let input;
  if (Buffer.isBuffer(file)) {
    input = InputFile.fromBuffer(file, fileName);
  } else {
    const buf = Buffer.from(await file.arrayBuffer());
    input = InputFile.fromBuffer(buf, file.name || fileName);
  }
  return storageClient.createFile(bucketId, id, input);
}

export function awFileViewUrl(bucketId: string, fileId: string) {
  const endpoint = process.env.APPWRITE_ENDPOINT?.replace(/\/$/, "") || "";
  const project = process.env.APPWRITE_PROJECT_ID || "";
  return `${endpoint}/storage/buckets/${bucketId}/files/${fileId}/view?project=${project}`;
}
