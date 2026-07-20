import Link from "next/link";
import { requireStaff } from "@/lib/auth/roles";
import { canAccessInvoices } from "@/lib/auth/roles-shared";
import { getDashboardStats, listLeads, listProjects } from "@/lib/db/queries";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isDemoMode } from "@/lib/demo/mode";
import { CreateLeadDialog } from "@/components/crm/create-lead-dialog";

export default async function CrmDashboardPage() {
  const user = await requireStaff();
  const stats = await getDashboardStats(user);
  const [leads, projects] = await Promise.all([listLeads(user), listProjects(user)]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-slate-900">Dashboard</h1>
          <p className="mt-1 text-slate-500">Pipeline and delivery at a glance</p>
        </div>
        <CreateLeadDialog label="Add new lead" />
      </div>

      {isDemoMode() && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
          Seeded demo data is ready. Try Leads → convert a won lead to a client, then switch to the{" "}
          <strong>Alex (client)</strong> persona to review deliverables, sign contracts, and pay
          invoices.
        </div>
      )}

      <Card className="border-slate-200">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-medium text-slate-900">Quick action</p>
            <p className="text-sm text-slate-500">
              Owners and sales reps can add leads anytime from here or the Leads page.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CreateLeadDialog label="New lead" />
            <CreateLeadDialog label="Add from referral" variant="outline" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Open leads", value: String(stats.openLeads) },
          { label: "Pipeline value", value: formatCurrency(stats.pipelineValue) },
          { label: "Active projects", value: String(stats.activeProjects) },
          ...(canAccessInvoices(user.role)
            ? [
                {
                  label: "Open invoices",
                  value: `${stats.openInvoices} · ${formatCurrency(stats.openInvoiceAmount)}`,
                },
              ]
            : []),
        ].map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">{stat.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Recent leads</CardTitle>
            <CreateLeadDialog label="Add" size="sm" variant="outline" />
          </CardHeader>
          <CardContent className="space-y-3">
            {leads.slice(0, 5).map((lead) => (
              <Link
                key={lead.id}
                href={`/crm/leads/${lead.id}`}
                className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-slate-50"
              >
                <span className="text-sm font-medium">
                  {lead.first_name} {lead.last_name}
                </span>
                <Badge variant="secondary">{lead.status}</Badge>
              </Link>
            ))}
            {leads.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">No leads yet.</p>
                <CreateLeadDialog label="Add your first lead" size="sm" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Projects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {projects.slice(0, 5).map((project) => (
              <Link
                key={project.id}
                href={`/crm/projects/${project.id}`}
                className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-slate-50"
              >
                <span className="truncate text-sm font-medium">{project.name}</span>
                <Badge>{project.status}</Badge>
              </Link>
            ))}
            {projects.length === 0 && (
              <p className="text-sm text-slate-500">No projects yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
