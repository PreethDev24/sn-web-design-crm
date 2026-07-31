import { getDocument, COLLECTIONS } from "@/lib/db/repo";
import { buildProjectId } from "@/lib/projects/id";

const MAX_ATTEMPTS = 25;

export async function allocateProjectId(companyName: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const id = buildProjectId(companyName);
    const existing = await getDocument(COLLECTIONS.projects, id);
    if (!existing) return id;
  }
  throw new Error("Could not generate a unique project ID. Try again.");
}

export function allocateDemoProjectId(companyName: string, existingIds: string[]): string {
  const taken = new Set(existingIds);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const id = buildProjectId(companyName);
    if (!taken.has(id)) return id;
  }
  throw new Error("Could not generate a unique project ID. Try again.");
}
