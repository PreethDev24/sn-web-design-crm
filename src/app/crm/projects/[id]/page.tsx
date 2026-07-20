import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/roles";
import { getProject, listActivities, listDeliverables } from "@/lib/db/queries";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectStaffActions } from "@/components/crm/project-staff-actions";
import { ActivityForm } from "@/components/crm/activity-form";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const [deliverables, activities] = await Promise.all([
    listDeliverables(id),
    listActivities({ project_id: id }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/crm/projects" className="text-sm text-teal-700 hover:underline">
          ← Projects
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl">{project.name}</h1>
          <Badge>{project.status}</Badge>
        </div>
        <p className="text-slate-500">
          {project.client?.name} · <span className="font-mono">{project.id}</span> · {project.progress}%
          complete
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Deliverables</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {deliverables.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{d.title}</p>
                    <p className="text-xs text-slate-500">v{d.version}</p>
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
                </div>
              ))}
              {deliverables.length === 0 && (
                <p className="text-sm text-slate-500">No deliverables yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ActivityForm projectId={project.id} />
              <ul className="space-y-3">
                {activities.map((a) => (
                  <li key={a.id} className="border-l-2 border-teal-600 pl-3 text-sm">
                    <p className="font-medium capitalize">{a.type}</p>
                    <p className="text-slate-600">{a.body}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatDate(a.created_at)}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
        <ProjectStaffActions project={project} />
      </div>
    </div>
  );
}
