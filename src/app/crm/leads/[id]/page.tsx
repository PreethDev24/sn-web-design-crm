import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/roles";
import { getLead, listActivities } from "@/lib/db/queries";
import { formatCurrency, formatDate, fullName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LeadDetailActions } from "@/components/crm/lead-detail-actions";
import { ActivityForm } from "@/components/crm/activity-form";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireStaff();
  const lead = await getLead(id, user);
  if (!lead) notFound();
  const activities = await listActivities({ lead_id: id });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/crm/leads" className="text-sm text-teal-700 hover:underline">
            ← Leads
          </Link>
          <h1 className="mt-2 font-display text-3xl">
            {fullName(lead.first_name, lead.last_name)}
          </h1>
          <p className="text-slate-500">{lead.company_name || "No company"}</p>
        </div>
        <Badge className="capitalize">{lead.status}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <p className="text-slate-500">Email</p>
              <p className="font-medium">{lead.email || "—"}</p>
            </div>
            <div>
              <p className="text-slate-500">Phone</p>
              <p className="font-medium">{lead.phone || "—"}</p>
            </div>
            <div>
              <p className="text-slate-500">Source</p>
              <p className="font-medium">{lead.source || "—"}</p>
            </div>
            <div>
              <p className="text-slate-500">Est. value</p>
              <p className="font-medium">{formatCurrency(lead.estimated_value)}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-slate-500">Notes</p>
              <p className="font-medium whitespace-pre-wrap">{lead.notes || "—"}</p>
            </div>
          </CardContent>
        </Card>

        <LeadDetailActions lead={lead} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ActivityForm leadId={lead.id} />
          <ul className="space-y-3">
            {activities.map((a) => (
              <li key={a.id} className="border-l-2 border-teal-600 pl-3 text-sm">
                <p className="font-medium capitalize text-slate-700">{a.type}</p>
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
  );
}
