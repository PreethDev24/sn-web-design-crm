import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/roles";
import { canManageDeliverables, canManageProjects } from "@/lib/auth/roles-shared";
import { getProject, listActivities, listDeliverables } from "@/lib/db/queries";
import { formatDate } from "@/lib/utils";
import { PROJECT_STATUSES, type ProjectStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectStaffActions } from "@/components/crm/project-staff-actions";
import { ActivityForm } from "@/components/crm/activity-form";

function statusIndex(status: ProjectStatus) {
  const idx = PROJECT_STATUSES.indexOf(status);
  return idx >= 0 ? idx : 0;
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaff();
  const canManage = canManageProjects(user.role);
  const canUpload = canManageDeliverables(user.role);
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const [deliverables, activities] = await Promise.all([
    listDeliverables(id),
    listActivities({ project_id: id }),
  ]);

  const currentIdx = statusIndex(project.status);
  const progressPct = Math.min(100, Math.max(0, Number(project.progress) || 0));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/crm/projects" className="text-sm text-teal-700 hover:underline">
          ← Projects
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl">{project.name}</h1>
          <Badge>{project.status}</Badge>
          {!canManage && (
            <Badge variant="secondary">View only</Badge>
          )}
        </div>
        <p className="text-slate-500">
          {project.client?.name} · <span className="font-mono">{project.id}</span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-800 capitalize">
                {project.status.replaceAll("_", " ")}
              </span>
              <span className="tabular-nums text-slate-500">{progressPct}% complete</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-teal-600 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {PROJECT_STATUSES.filter((s) => s !== "on_hold").map((stage) => {
              const idx = statusIndex(stage);
              const done = idx < currentIdx || project.status === "completed";
              const active = stage === project.status;
              return (
                <li
                  key={stage}
                  className={`rounded-md border px-2.5 py-2 text-xs ${
                    active
                      ? "border-teal-600 bg-teal-50 text-teal-900"
                      : done
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-slate-200 text-slate-500"
                  }`}
                >
                  <span className="font-medium capitalize">{stage.replaceAll("_", " ")}</span>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Deliverables</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {deliverables.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{d.title}</p>
                    <p className="text-xs text-slate-500">
                      v{d.version}
                      {d.file_url || d.preview_url ? (
                        <>
                          {" · "}
                          <a
                            href={d.preview_url || d.file_url || "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="text-teal-700 hover:underline"
                          >
                            View
                          </a>
                        </>
                      ) : null}
                    </p>
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
                    {d.status.replaceAll("_", " ")}
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
              {canManage && <ActivityForm projectId={project.id} />}
              <ul className="space-y-3">
                {activities.map((a) => (
                  <li key={a.id} className="border-l-2 border-teal-600 pl-3 text-sm">
                    <p className="font-medium capitalize">{a.type}</p>
                    <p className="text-slate-600">{a.body}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatDate(a.created_at)}</p>
                  </li>
                ))}
                {activities.length === 0 && (
                  <p className="text-sm text-slate-500">No activity yet.</p>
                )}
              </ul>
            </CardContent>
          </Card>
        </div>

        {canManage || canUpload ? (
          <ProjectStaffActions project={project} canManage={canManage} canUpload={canUpload} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <p>
                Current stage:{" "}
                <span className="font-medium capitalize text-slate-900">
                  {project.status.replaceAll("_", " ")}
                </span>
              </p>
              <p>
                Progress:{" "}
                <span className="font-medium text-slate-900">{progressPct}%</span>
              </p>
              <p>
                Deliverables:{" "}
                <span className="font-medium text-slate-900">{deliverables.length}</span>
                {deliverables.length > 0 && (
                  <>
                    {" "}
                    (
                    {
                      deliverables.filter((d) => d.status === "approved").length
                    }{" "}
                    approved)
                  </>
                )}
              </p>
              <p className="text-xs text-slate-400">
                Sales reps can monitor progress. Only owners can update status or upload
                deliverables.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
