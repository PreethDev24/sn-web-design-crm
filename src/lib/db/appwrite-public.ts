/** Public Appwrite config safe to pass into the browser (no API key). */
export type AppwriteRealtimeConfig = {
  endpoint: string;
  projectId: string;
  databaseId: string;
};

export function getAppwriteRealtimeConfig(): AppwriteRealtimeConfig | null {
  const endpoint = (
    process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ||
    process.env.APPWRITE_ENDPOINT ||
    ""
  ).trim();
  const projectId = (
    process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID ||
    process.env.APPWRITE_PROJECT_ID ||
    ""
  ).trim();
  const databaseId = (
    process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID ||
    process.env.APPWRITE_DATABASE_ID ||
    "sn_crm"
  ).trim();

  if (!endpoint || !projectId) return null;
  return { endpoint, projectId, databaseId };
}
