import Link from "next/link";
import { requireStaff } from "@/lib/auth/roles";
import {
  clientInviteRequestsReady,
  listClientInviteRequests,
  listSalesProfiles,
  listTeamUsers,
} from "@/lib/db/queries";
import { isDbConfigured } from "@/lib/db/backend";
import { fullName } from "@/lib/utils";
import { InviteTeamForm } from "@/components/crm/invite-team-form";
import { RequestClientInviteForm } from "@/components/crm/request-client-invite-form";
import { ClientInviteRequestsList } from "@/components/crm/client-invite-requests-list";
import { RemoveMemberButton } from "@/components/crm/remove-member-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function TeamPage() {
  const user = await requireStaff();
  const isOwner = user.role === "owner";
  const dbConfigured = isDbConfigured();
  const [users, requests, inviteTableReady, salesProfiles] = await Promise.all([
    listTeamUsers(user),
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
              : "Request client portal access and view owners and clients (other sales are hidden)"}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/crm/contacts">Open contacts</Link>
        </Button>
      </div>

      {!dbConfigured && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950">
          <p className="font-medium">Database not connected</p>
          <p className="mt-1">
            Set <code className="rounded bg-red-100 px-1">DATA_BACKEND=appwrite</code> and the{" "}
            <code className="rounded bg-red-100 px-1">APPWRITE_*</code> env vars on this host
            (Netlify Site settings → Environment variables), then redeploy.
          </p>
        </div>
      )}

      {!inviteTableReady && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">One-time database setup required</p>
          <p className="mt-1">
            Run{" "}
            <code className="rounded bg-amber-100 px-1">npm run appwrite:setup</code>{" "}
            (see{" "}
            <code className="rounded bg-amber-100 px-1">scripts/appwrite/README.md</code>
            ), then refresh this page.
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isOwner ? "People" : "Owners & clients"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {users.length === 0 && (
            <p className="text-sm text-slate-500">
              {dbConfigured
                ? "No people found in the database yet."
                : "Connect Appwrite env vars to load people from the database."}
            </p>
          )}
          {users.map((u) => {
            const profile = isOwner ? profileByUser.get(u.id) : undefined;
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
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {u.role}
                    </Badge>
                    {isOwner && u.role === "sales" && (
                      <Badge variant={profile ? "success" : "warning"}>
                        {profile ? "Onboarded" : "Pending"}
                      </Badge>
                    )}
                    {isOwner && (
                      <RemoveMemberButton member={u} currentUserId={user.id} />
                    )}
                  </div>
                </div>
                {isOwner && u.role === "sales" && profile && (
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
              {isOwner
                ? "No users synced yet. Sign in once to create your owner account."
                : "No owners or clients to show yet."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
