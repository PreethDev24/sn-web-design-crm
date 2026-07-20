import Link from "next/link";
import { requireClient } from "@/lib/auth/roles";
import { getClientForUser, listProjectsForClient } from "@/lib/db/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function PortalProjectsPage() {
  const user = await requireClient();
  const client = await getClientForUser(user.id);
  const projects = client ? await listProjectsForClient(client.id) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Projects</h1>
        <p className="mt-1 text-slate-500">Track progress and review deliverables</p>
      </div>
      <div className="grid gap-3">
        {projects.map((p) => (
          <Link key={p.id} href={`/portal/projects/${p.id}`}>
            <Card className="hover:border-teal-300 transition-colors">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-slate-500">{p.progress}% complete</p>
                </div>
                <Badge>{p.status}</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
        {projects.length === 0 && (
          <p className="text-sm text-slate-500">No projects yet.</p>
        )}
      </div>
    </div>
  );
}
