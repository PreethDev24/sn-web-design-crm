/**
 * Export Supabase tables + storage files for Appwrite import.
 * Usage: npm run appwrite:export
 * Requires Supabase env vars (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
 */
import { createClient } from "@supabase/supabase-js";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  createWriteStream,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

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

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const OUT = resolve(process.cwd(), "scripts/appwrite/data");
const FILES_OUT = join(OUT, "files");
mkdirSync(OUT, { recursive: true });
mkdirSync(join(FILES_OUT, "deliverables"), { recursive: true });
mkdirSync(join(FILES_OUT, "contracts"), { recursive: true });

const TABLES = [
  "users",
  "clients",
  "leads",
  "deals",
  "projects",
  "deliverables",
  "feedback",
  "contracts",
  "invoices",
  "activities",
  "maintenance_plans",
  "client_invite_requests",
  "sales_profiles",
  "conversations",
  "messages",
  "audit_logs",
];

async function exportTable(name) {
  const rows = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from(name)
      .select("*")
      .range(from, from + page - 1);
    if (error) {
      if (/does not exist|PGRST205|Could not find/i.test(error.message)) {
        console.warn(`  skip missing table: ${name}`);
        return [];
      }
      throw new Error(`${name}: ${error.message}`);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < page) break;
    from += page;
  }
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(rows, null, 2));
  console.log(`  ${name}: ${rows.length} rows`);
  return rows;
}

async function listStorageFiles(bucket) {
  const files = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list("", {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      console.warn(`  storage ${bucket}: ${error.message}`);
      return files;
    }
    // Flatten one level of folders (projectId/file)
    for (const item of data ?? []) {
      if (item.id) {
        files.push({ path: item.name, bucket });
      } else if (item.name) {
        const { data: nested } = await supabase.storage
          .from(bucket)
          .list(item.name, { limit: 1000 });
        for (const f of nested ?? []) {
          if (f.id) files.push({ path: `${item.name}/${f.name}`, bucket });
        }
      }
    }
    if (!data || data.length < limit) break;
    offset += limit;
  }
  return files;
}

async function downloadFile(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    console.warn(`  failed download ${bucket}/${path}: ${error?.message}`);
    return null;
  }
  const dest = join(FILES_OUT, bucket, path);
  mkdirSync(dirname(dest), { recursive: true });
  const buf = Buffer.from(await data.arrayBuffer());
  writeFileSync(dest, buf);
  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
  return {
    bucket,
    path,
    local: `files/${bucket}/${path}`,
    old_url: pub?.publicUrl ?? null,
    size: buf.length,
  };
}

async function main() {
  console.log("Exporting Supabase → scripts/appwrite/data …");
  const counts = {};
  for (const table of TABLES) {
    const rows = await exportTable(table);
    counts[table] = rows.length;
  }

  const manifest = [];
  for (const bucket of ["deliverables", "contracts"]) {
    console.log(`→ storage ${bucket}`);
    const listed = await listStorageFiles(bucket);
    for (const f of listed) {
      const entry = await downloadFile(f.bucket, f.path);
      if (entry) manifest.push(entry);
    }
  }
  writeFileSync(join(OUT, "storage-manifest.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(join(OUT, "export-summary.json"), JSON.stringify({ counts, files: manifest.length }, null, 2));
  console.log(`\nExport complete. ${manifest.length} files. Summary written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
