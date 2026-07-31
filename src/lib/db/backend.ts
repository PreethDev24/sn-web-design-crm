import { isAppwriteConfigured } from "@/lib/db/appwrite";

export type DataBackend = "appwrite" | "none";

/**
 * DATA_BACKEND=appwrite forces Appwrite when configured.
 * Default: appwrite if APPWRITE_* env vars are present.
 */
export function getDataBackend(): DataBackend {
  const forced = process.env.DATA_BACKEND?.trim().toLowerCase();
  if (forced === "supabase") {
    console.warn(
      "DATA_BACKEND=supabase is no longer supported at runtime. Use Appwrite (see scripts/appwrite/PHASE0.md)."
    );
    return isAppwriteConfigured() ? "appwrite" : "none";
  }
  if (forced && forced !== "appwrite") {
    return isAppwriteConfigured() ? "appwrite" : "none";
  }
  return isAppwriteConfigured() ? "appwrite" : "none";
}

export function isDbConfigured() {
  return getDataBackend() !== "none";
}

export function requireDataBackend(): "appwrite" {
  const backend = getDataBackend();
  if (backend === "none") {
    throw new Error(
      "No database configured. Set DATA_BACKEND=appwrite with APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, and APPWRITE_API_KEY."
    );
  }
  return backend;
}
