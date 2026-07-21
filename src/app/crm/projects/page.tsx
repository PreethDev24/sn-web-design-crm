import Link from "next/link";
import { requireStaff } from "@/lib/auth/roles";
import { canManageProjects } from "@/lib/auth/roles-shared";
import { listClients, listProjects } from "@/lib/db/queries";
import { CreateProjectDialog } from "@/components/crm/create-project-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function ProjectsPage() {
  const user = await requireStaff();
  const canManage = canManageProjects(user.role);
  const [projects, clients] = await Promise.all([listProjects(user), listClients(user)]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Projects</h1>
          <p className="mt-1 text-slate-500">
            {canManage
              ? "Delivery from discovery to maintenance"
              : "Track project progress and deliverable status"}
          </p>
        </div>
        {canManage && <CreateProjectDialog clients={clients} />}
      </div>
      <div className="grid gap-3">
        {projects.map((project) => (
          <Link key={project.id} href={`/crm/projects/${project.id}`}>
            <Card className="transition-colors hover:border-teal-300">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{project.name}</p>
                  <p className="text-sm text-slate-500">
                    {project.client?.name} · <span className="font-mono">{project.id}</span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden w-28 sm:block">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Progress</span>
                      <span>{project.progress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200">
                      <div
                        className="h-1.5 rounded-full bg-teal-600 transition-all"
                        style={{ width: `${Math.min(100, Math.max(0, project.progress))}%` }}
                      />
                    </div>
                  </div>
                  <Badge>{project.status}</Badge>
                </div>
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
