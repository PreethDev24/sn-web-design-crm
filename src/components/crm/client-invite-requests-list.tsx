"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ClientInviteRequest } from "@/lib/types";
import {
  approveClientInviteRequest,
  rejectClientInviteRequest,
} from "@/lib/actions/crm";
import { fullName, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function statusVariant(status: ClientInviteRequest["status"]) {
  if (status === "approved") return "success" as const;
  if (status === "rejected") return "danger" as const;
  return "secondary" as const;
}

export function ClientInviteRequestsList({
  requests,
  isOwner,
}: {
  requests: ClientInviteRequest[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (requests.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        {isOwner
          ? "No client invite requests yet."
          : "You haven’t requested any client invites yet."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((req) => (
        <div
          key={req.id}
          className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-slate-100 px-3 py-3"
        >
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-slate-900">
                {req.client_name || req.email}
              </p>
              <Badge variant={statusVariant(req.status)} className="capitalize">
                {req.status}
              </Badge>
            </div>
            <p className="text-xs text-slate-500">{req.email}</p>
            {req.note && <p className="text-sm text-slate-600">{req.note}</p>}
            <p className="text-xs text-slate-400">
              Requested by{" "}
              {fullName(req.requester?.first_name, req.requester?.last_name) ||
                "Sales"}{" "}
              · {formatDate(req.created_at)}
            </p>
            {req.status !== "pending" && req.reviewed_at && (
              <p className="text-xs text-slate-400">
                {req.status === "approved" ? "Approved" : "Rejected"}{" "}
                {formatDate(req.reviewed_at)}
                {req.review_note ? ` — ${req.review_note}` : ""}
              </p>
            )}
          </div>

          {isOwner && req.status === "pending" && (
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    try {
                      await approveClientInviteRequest(req.id);
                      toast.success("Invite sent to client");
                      router.refresh();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed");
                    }
                  });
                }}
              >
                Approve
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    try {
                      await rejectClientInviteRequest(req.id);
                      toast.success("Request rejected");
                      router.refresh();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed");
                    }
                  });
                }}
              >
                Reject
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
