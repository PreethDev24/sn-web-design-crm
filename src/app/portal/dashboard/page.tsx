import Link from "next/link";
import { requireClient } from "@/lib/auth/roles";
import {
  getClientForUser,
  listContractsForClient,
  listInvoicesForClient,
  listProjectsForClient,
} from "@/lib/db/queries";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/db/supabase";

export default async function PortalDashboardPage() {
  const user = await requireClient();
  const configured = isSupabaseConfigured();
  const client = configured ? await getClientForUser(user.id) : null;

  const [projects, contracts, invoices] = client
    ? await Promise.all([
        listProjectsForClient(client.id),
        listContractsForClient(client.id),
        listInvoicesForClient(client.id),
      ])
    : [[], [], []];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-slate-900">
          Welcome{user.first_name ? `, ${user.first_name}` : ""}
        </h1>
        <p className="mt-1 text-slate-500">
          Review designs, approve deliverables, sign contracts, and pay invoices
        </p>
      </div>

      {!client && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          Your portal account is not linked to a client company yet. Ask SN Web Design to link your
          email to a client record (set <code>primary_user_id</code> on the client).
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{projects.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">Contracts to sign</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {contracts.filter((c) => ["sent", "viewed"].includes(c.status)).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-500">Open invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {invoices.filter((i) => i.status !== "paid" && i.status !== "cancelled").length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your projects</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/portal/projects/${p.id}`}
              className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-slate-50"
            >
              <span className="text-sm font-medium">{p.name}</span>
              <Badge>{p.status}</Badge>
            </Link>
          ))}
          {projects.length === 0 && (
            <p className="text-sm text-slate-500">No projects assigned yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invoices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {invoices.slice(0, 5).map((inv) => (
              <Link
                key={inv.id}
                href={`/portal/invoices/${inv.id}`}
                className="flex items-center justify-between text-sm"
              >
                <span>{inv.title}</span>
                <span>
                  {formatCurrency(inv.amount)} · {inv.status}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contracts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {contracts.slice(0, 5).map((c) => (
              <Link
                key={c.id}
                href={`/portal/contracts/${c.id}`}
                className="flex items-center justify-between text-sm"
              >
                <span>{c.title}</span>
                <Badge variant="secondary">{c.status}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
