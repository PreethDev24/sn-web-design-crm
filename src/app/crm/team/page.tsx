import Link from "next/link";
import { requireStaff } from "@/lib/auth/roles";
import {
  clientInviteRequestsReady,
  listClientInviteRequests,
  listSalesProfiles,
  listTeamUsers,
} from "@/lib/db/queries";
import { fullName } from "@/lib/utils";
import { InviteTeamForm } from "@/components/crm/invite-team-form";
import { RequestClientInviteForm } from "@/components/crm/request-client-invite-form";
import { ClientInviteRequestsList } from "@/components/crm/client-invite-requests-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function TeamPage() {
  const user = await requireStaff();
  const isOwner = user.role === "owner";
  const [users, requests, inviteTableReady, salesProfiles] = await Promise.all([
    isOwner ? listTeamUsers() : Promise.resolve([]),
    listClientInviteRequests(user),
    clientInviteRequestsReady(),
    isOwner ? listSalesProfiles() : Promise.resolve([]),
  ]);

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const profileByUser = new Map(salesProfiles.map((p) => [p.user_id, p]));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Team</h1>
          <p className="mt-1 text-slate-500">
            {isOwner
              ? "Invite staff, approve client portal requests, and manage people"
              : "Request client portal access — owners must approve before an invite is sent"}
          </p>
        </div>
        {isOwner && (
          <Button asChild variant="outline">
            <Link href="/crm/contacts">Open contacts</Link>
          </Button>
        )}
      </div>

      {!inviteTableReady && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">One-time database setup required</p>
          <p className="mt-1">
            Run{" "}
            <code className="rounded bg-amber-100 px-1">
              supabase/migrations/003_client_invite_requests.sql
            </code>{" "}
            in the{" "}
            <a
              href="https://supabase.com/dashboard/project/fbnglqpbdmqgogiseblk/sql/new"
              target="_blank"
              rel="noreferrer"
              className="font-medium underline"
            >
              Supabase SQL Editor
            </a>
            , then refresh this page.
          </p>
        </div>
      )}

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invite user</CardTitle>
          </CardHeader>
          <CardContent>
            <InviteTeamForm />
          </CardContent>
        </Card>
      )}

      {!isOwner && inviteTableReady && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Request client invite</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-slate-500">
              Submit a client email for portal access. An owner will review and send the invite.
            </p>
            <RequestClientInviteForm />
          </CardContent>
        </Card>
      )}

      {inviteTableReady && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">
              {isOwner ? "Client invite requests" : "Your client invite requests"}
            </CardTitle>
            {isOwner && pendingCount > 0 && (
              <Badge variant="warning">{pendingCount} pending</Badge>
            )}
          </CardHeader>
          <CardContent>
            <ClientInviteRequestsList requests={requests} isOwner={isOwner} />
          </CardContent>
        </Card>
      )}

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">People</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {users.map((u) => {
              const profile = profileByUser.get(u.id);
              return (
                <div
                  key={u.id}
                  className="rounded-md border border-slate-100 px-3 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        {profile?.full_name || fullName(u.first_name, u.last_name)}
                      </p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary" className="capitalize">
                        {u.role}
                      </Badge>
                      {u.role === "sales" && (
                        <Badge variant={profile ? "success" : "warning"}>
                          {profile ? "Onboarded" : "Pending"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {u.role === "sales" && profile && (
                    <div className="mt-3 grid gap-1 text-xs text-slate-600 sm:grid-cols-3">
                      <p>
                        <span className="text-slate-400">Region:</span>{" "}
                        {profile.target_region || "—"}
                      </p>
                      <p>
                        <span className="text-slate-400">Calls/day:</span>{" "}
                        {profile.daily_call_goal ?? "—"}
                      </p>
                      <p>
                        <span className="text-slate-400">Meetings/week:</span>{" "}
                        {profile.weekly_meeting_goal ?? "—"}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
            {users.length === 0 && (
              <p className="text-sm text-slate-500">
                No users synced yet. Sign in once to create your owner account.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
