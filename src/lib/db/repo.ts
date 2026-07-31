/**
 * Appwrite document repository (primary data backend).
 * Supabase remains available only for one-shot export scripts under scripts/appwrite/.
 */
import { Query } from "node-appwrite";
import {
  awCreate,
  awDelete,
  awGet,
  awList,
  awUpdate,
  awUploadFile,
  awFileViewUrl,
  parseJsonField,
} from "@/lib/db/appwrite";
import { COLLECTIONS, BUCKETS, type CollectionName } from "@/lib/db/appwrite-ids";
import { getDataBackend } from "@/lib/db/backend";

export { COLLECTIONS, BUCKETS, parseJsonField, Query };

export function isDataConfigured() {
  return getDataBackend() === "appwrite";
}

function assertAppwrite() {
  if (!isDataConfigured()) {
    throw new Error(
      "Appwrite is not configured. Set DATA_BACKEND=appwrite and APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY."
    );
  }
}

/** Appwrite stores document IDs as system field `$id`, not a custom `id` attribute. */
function appwriteAttr(key: string) {
  return key === "id" ? "$id" : key;
}

export async function listDocuments<T extends Record<string, unknown>>(
  collection: CollectionName,
  opts: {
    equal?: Record<string, string | number | boolean | null>;
    equalAny?: Record<string, (string | number)[]>;
    notEqual?: Record<string, string | number | boolean>;
    isNull?: string[];
    searchContains?: { attr: string; value: string };
    orderAttr?: string;
    orderAsc?: boolean;
    limit?: number;
  } = {}
): Promise<T[]> {
  if (!isDataConfigured()) return [];

  const queries: string[] = [];
  if (opts.equal) {
    for (const [k, v] of Object.entries(opts.equal)) {
      const attr = appwriteAttr(k);
      if (v === null) queries.push(Query.isNull(attr));
      else queries.push(Query.equal(attr, v));
    }
  }
  if (opts.equalAny) {
    for (const [k, vals] of Object.entries(opts.equalAny)) {
      if (vals.length) queries.push(Query.equal(appwriteAttr(k), vals));
    }
  }
  if (opts.notEqual) {
    for (const [k, v] of Object.entries(opts.notEqual)) {
      queries.push(Query.notEqual(appwriteAttr(k), v));
    }
  }
  if (opts.isNull) {
    for (const k of opts.isNull) queries.push(Query.isNull(appwriteAttr(k)));
  }
  if (opts.orderAttr) {
    const attr = appwriteAttr(opts.orderAttr);
    queries.push(opts.orderAsc ? Query.orderAsc(attr) : Query.orderDesc(attr));
  }
  const limit = opts.limit ?? 500;
  let rows = (await awList(collection, queries, limit)) as T[];
  if (opts.searchContains) {
    const { attr, value } = opts.searchContains;
    const needle = value.toLowerCase();
    rows = rows.filter((r) =>
      String((r as Record<string, unknown>)[attr] ?? "")
        .toLowerCase()
        .includes(needle)
    );
  }
  return rows;
}

export async function getDocument<T extends Record<string, unknown>>(
  collection: CollectionName,
  id: string
): Promise<T | null> {
  if (!isDataConfigured()) return null;
  return (await awGet(collection, id)) as T | null;
}

export async function createDocument<T extends Record<string, unknown>>(
  collection: CollectionName,
  data: Record<string, unknown>,
  id?: string
): Promise<T> {
  assertAppwrite();
  return (await awCreate(collection, data, id)) as T;
}

export async function updateDocument<T extends Record<string, unknown>>(
  collection: CollectionName,
  id: string,
  data: Record<string, unknown>
): Promise<T> {
  assertAppwrite();
  return (await awUpdate(collection, id, data)) as T;
}

export async function updateDocuments(
  collection: CollectionName,
  match: Record<string, string | number | boolean | null>,
  data: Record<string, unknown>,
  extra?: {
    notIn?: { attr: string; values: string[] };
    notEqual?: Record<string, string | number | boolean>;
    isNull?: string[];
  }
): Promise<number> {
  assertAppwrite();
  const rows = await listDocuments<Record<string, unknown>>(collection, {
    equal: match,
    notEqual: extra?.notEqual,
    isNull: extra?.isNull,
    limit: 500,
  });
  let filtered = rows;
  if (extra?.notIn) {
    const set = new Set(extra.notIn.values);
    filtered = rows.filter((r) => !set.has(String(r[extra.notIn!.attr])));
  }
  for (const row of filtered) {
    await awUpdate(collection, String(row.id), data);
  }
  return filtered.length;
}

export async function deleteDocument(collection: CollectionName, id: string) {
  assertAppwrite();
  await awDelete(collection, id);
}

export async function deleteDocuments(
  collection: CollectionName,
  match: Record<string, string | number | boolean>
) {
  assertAppwrite();
  const rows = await listDocuments<Record<string, unknown>>(collection, {
    equal: match,
    limit: 500,
  });
  for (const row of rows) await awDelete(collection, String(row.id));
  return rows.length;
}

export async function countDocuments(
  collection: CollectionName,
  equal?: Record<string, string>
): Promise<number> {
  if (!isDataConfigured()) return 0;
  const rows = await listDocuments(collection, { equal, limit: 5000 });
  return rows.length;
}

export async function findOneBy<T extends Record<string, unknown>>(
  collection: CollectionName,
  equal: Record<string, string | number | boolean | null>,
  opts?: { searchContains?: { attr: string; value: string } }
): Promise<T | null> {
  const rows = await listDocuments<T>(collection, {
    equal,
    searchContains: opts?.searchContains,
    limit: 5,
  });
  return rows[0] ?? null;
}

export async function findByEmailIlike<T extends Record<string, unknown>>(
  collection: CollectionName,
  email: string
): Promise<T | null> {
  if (!isDataConfigured()) return null;
  const needle = email.trim().toLowerCase();
  const exact = await listDocuments<T>(collection, {
    equal: { email: email.trim() },
    limit: 5,
  });
  if (exact[0]) return exact[0];
  const all = await listDocuments<T>(collection, { limit: 2000 });
  return (
    all.find((r) => String((r as { email?: string }).email ?? "").toLowerCase() === needle) ??
    null
  );
}

export async function uploadToBucket(
  bucket: keyof typeof BUCKETS,
  path: string,
  file: File | Buffer,
  fileName: string
): Promise<{ path: string; publicUrl: string; fileId: string }> {
  assertAppwrite();
  const created = await awUploadFile(BUCKETS[bucket], file, fileName);
  const publicUrl = awFileViewUrl(BUCKETS[bucket], created.$id);
  return { path, publicUrl, fileId: created.$id };
}

export async function upsertById<T extends Record<string, unknown>>(
  collection: CollectionName,
  id: string,
  data: Record<string, unknown>
): Promise<T> {
  assertAppwrite();
  const existing = await getDocument(collection, id);
  if (existing) return updateDocument<T>(collection, id, data);
  return createDocument<T>(collection, data, id);
}

/** Probe whether a collection responds. */
export async function collectionReady(collection: CollectionName): Promise<boolean> {
  if (!isDataConfigured()) return false;
  try {
    await listDocuments(collection, { limit: 1 });
    return true;
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    if (/not found|404|Could not find|does not exist/i.test(msg)) return false;
    throw e;
  }
}
