import { requireOwner } from "@/lib/auth/roles";
import { auditLogsReady, listAuditLogs } from "@/lib/db/queries";
import { fullName, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function actionLabel(action: string) {
  return action.replace(/\./g, " · ");
}

function roleBadge(role: string | null) {
  if (!role) return "system";
  return role;
}

export default async function AuditLogPage() {
  await requireOwner();
  const ready = await auditLogsReady();
  const logs = ready ? await listAuditLogs(250) : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl">Audit log</h1>
        <p className="mt-1 text-slate-500">
          Owner-only history of sensitive CRM actions — invites, removals, terminations, contracts,
          and invoices
        </p>
      </div>

      {!ready && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">One-time database setup required</p>
          <p className="mt-1">
            Run{" "}
            <code className="rounded bg-amber-100 px-1">supabase/migrations/009_audit_logs.sql</code>{" "}
            in the Supabase SQL Editor, then refresh this page.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {logs.length === 0 && (
            <p className="text-sm text-slate-500">
              No audit events yet. Actions like inviting team members, terminating clients, or
              sending invoices will appear here.
            </p>
          )}
          {logs.map((log) => {
            const actorName = log.actor
              ? fullName(log.actor.first_name, log.actor.last_name)
              : log.actor_email || "System";
            return (
              <div
                key={log.id}
                className="rounded-md border border-slate-100 px-3 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{log.summary}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {actorName}
                      {log.actor_email && log.actor ? ` · ${log.actor_email}` : ""}
                      {" · "}
                      {formatDate(log.created_at)}{" "}
                      {new Intl.DateTimeFormat("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(new Date(log.created_at))}
                    </p>
                    {log.target_label && (
                      <p className="mt-1 text-xs text-slate-400">
                        Target: {log.target_type ? `${log.target_type} · ` : ""}
                        {log.target_label}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {actionLabel(log.action)}
                    </Badge>
                    <Badge variant="secondary" className="capitalize">
                      {roleBadge(log.actor_role)}
                    </Badge>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
