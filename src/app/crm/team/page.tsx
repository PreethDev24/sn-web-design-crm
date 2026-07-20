import { requireStaff } from "@/lib/auth/roles";
import {
  clientInviteRequestsReady,
  listClientInviteRequests,
  listTeamUsers,
} from "@/lib/db/queries";
import { fullName } from "@/lib/utils";
import { InviteTeamForm } from "@/components/crm/invite-team-form";
import { RequestClientInviteForm } from "@/components/crm/request-client-invite-form";
import { ClientInviteRequestsList } from "@/components/crm/client-invite-requests-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function TeamPage() {
  const user = await requireStaff();
  const isOwner = user.role === "owner";
  const [users, requests, inviteTableReady] = await Promise.all([
    isOwner ? listTeamUsers() : Promise.resolve([]),
    listClientInviteRequests(user),
    clientInviteRequestsReady(),
  ]);

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl">Team</h1>
        <p className="mt-1 text-slate-500">
          {isOwner
            ? "Invite staff, approve client portal requests, and manage people"
            : "Request client portal access — owners must approve before an invite is sent"}
        </p>
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
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">
                    {fullName(u.first_name, u.last_name)}
                  </p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </div>
                <Badge variant="secondary" className="capitalize">
                  {u.role}
                </Badge>
              </div>
            ))}
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
