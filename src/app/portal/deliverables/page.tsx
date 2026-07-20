import Link from "next/link";
import { requireClient } from "@/lib/auth/roles";
import {
  getClientForUser,
  listDeliverables,
  listProjectsForClient,
} from "@/lib/db/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function PortalDeliverablesPage() {
  const user = await requireClient();
  const client = await getClientForUser(user.id);
  const projects = client ? await listProjectsForClient(client.id) : [];

  const all = await Promise.all(
    projects.map(async (p) => ({
      project: p,
      deliverables: await listDeliverables(p.id),
    }))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Deliverables</h1>
        <p className="mt-1 text-slate-500">All drafts awaiting your review</p>
      </div>
      <div className="grid gap-3">
        {all.flatMap(({ project, deliverables }) =>
          deliverables.map((d) => (
            <Link key={d.id} href={`/portal/projects/${project.id}`}>
              <Card className="hover:border-teal-300 transition-colors">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{d.title}</p>
                    <p className="text-sm text-slate-500">{project.name}</p>
                  </div>
                  <Badge
                    variant={
                      d.status === "approved"
                        ? "success"
                        : d.status === "changes_requested"
                          ? "warning"
                          : "secondary"
                    }
                  >
                    {d.status}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
        {all.every((x) => x.deliverables.length === 0) && (
          <p className="text-sm text-slate-500">No deliverables yet.</p>
        )}
      </div>
    </div>
  );
}
