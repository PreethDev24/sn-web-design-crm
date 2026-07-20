import type { SupabaseClient } from "@supabase/supabase-js";
import { buildProjectId } from "@/lib/projects/id";

const MAX_ATTEMPTS = 25;

export async function allocateProjectId(
  supabase: SupabaseClient,
  companyName: string
): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const id = buildProjectId(companyName);
    const { data } = await supabase.from("projects").select("id").eq("id", id).maybeSingle();
    if (!data) return id;
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
