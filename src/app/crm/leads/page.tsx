import { requireStaff } from "@/lib/auth/roles";
import { listLeads } from "@/lib/db/queries";
import { CreateLeadDialog } from "@/components/crm/create-lead-dialog";
import { LeadsKanban } from "@/components/crm/leads-kanban";
import { Card, CardContent } from "@/components/ui/card";

export default async function LeadsPage() {
  const user = await requireStaff();
  const leads = await listLeads(user);
  const roleLabel = user.role === "owner" ? "Owner" : "Sales rep";

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl text-slate-900">Leads</h1>
          <p className="mt-1 text-slate-500">
            Signed in as {roleLabel} — you can add leads to the shared pipeline
          </p>
        </div>
        <CreateLeadDialog label="Add new lead" />
      </div>

      <Card className="border-teal-200 bg-teal-50/60">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-teal-950">Add a lead</p>
            <p className="text-sm text-teal-800">
              Owners and sales reps can both create leads. Capture contact info, source, and
              estimated value, then drag the card through the pipeline.
            </p>
          </div>
          <CreateLeadDialog label="Create lead" variant="default" />
        </CardContent>
      </Card>

      {leads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <div>
              <p className="text-lg font-medium text-slate-900">No leads yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Start your pipeline — available for both owners and sales reps.
              </p>
            </div>
            <CreateLeadDialog label="Add your first lead" size="lg" />
          </CardContent>
        </Card>
      ) : (
        <div className="min-w-0 w-full">
          <LeadsKanban leads={leads} />
        </div>
      )}
    </div>
  );
}
