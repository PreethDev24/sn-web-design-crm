import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/roles";
import { canManageProjects } from "@/lib/auth/roles-shared";
import { getClient, listActivities, listProjectsForClient } from "@/lib/db/queries";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityForm } from "@/components/crm/activity-form";
import { MaintenancePlanForm } from "@/components/crm/maintenance-plan-form";
import { TerminateClientButton } from "@/components/crm/terminate-client-button";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaff();
  const isOwner = canManageProjects(user.role);
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();
  const [projects, activities] = await Promise.all([
    listProjectsForClient(id),
    listActivities({ client_id: id }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/crm/clients" className="text-sm text-teal-700 hover:underline">
            ← Clients
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl">{client.name}</h1>
            <Badge
              variant={
                client.status === "churned"
                  ? "danger"
                  : client.status === "active"
                    ? "success"
                    : "secondary"
              }
            >
              {client.status === "churned" ? "terminated" : client.status}
            </Badge>
          </div>
          <p className="text-slate-500">{client.email}</p>
        </div>
        {isOwner && (
          <TerminateClientButton
            clientId={client.id}
            clientName={client.name}
            status={client.status}
          />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Projects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/crm/projects/${p.id}`}
                className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-slate-50"
              >
                <span className="text-sm font-medium">{p.name}</span>
                <Badge
                  variant={
                    p.status === "terminated"
                      ? "danger"
                      : p.status === "completed"
                        ? "success"
                        : "secondary"
                  }
                >
                  {p.status}
                </Badge>
              </Link>
            ))}
            {projects.length === 0 && (
              <p className="text-sm text-slate-500">No projects for this client.</p>
            )}
          </CardContent>
        </Card>
        {isOwner && client.status !== "churned" && (
          <MaintenancePlanForm clientId={client.id} />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isOwner && client.status !== "churned" && <ActivityForm clientId={client.id} />}
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
  );
}
