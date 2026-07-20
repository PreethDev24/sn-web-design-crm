"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Lead, LeadStatus } from "@/lib/types";
import { LEAD_STATUSES } from "@/lib/types";
import { convertWonDeal, createDealFromLead, updateLeadStatus } from "@/lib/actions/crm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeleteLeadButton, EditLeadDialog } from "@/components/crm/edit-lead-dialog";

export function LeadDetailActions({ lead }: { lead: Lead }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manage lead</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <EditLeadDialog lead={lead} />
          <DeleteLeadButton leadId={lead.id} redirectToList />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status</CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            defaultValue={lead.status}
            onValueChange={(value) => {
              startTransition(async () => {
                try {
                  await updateLeadStatus(lead.id, value as LeadStatus);
                  toast.success("Status updated");
                  router.refresh();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                }
              });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAD_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Convert to client</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            action={(fd) => {
              startTransition(async () => {
                try {
                  const dealId = await createDealFromLead(lead.id, fd);
                  const result = await convertWonDeal(dealId, fd);
                  toast.success("Client created");
                  router.push(`/crm/clients/${result.clientId}`);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                }
              });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="client_name">Client name</Label>
              <Input
                id="client_name"
                name="client_name"
                defaultValue={lead.company_name || fullNameFallback(lead)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Client email</Label>
              <Input id="email" name="email" type="email" defaultValue={lead.email || ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="title">Project / deal title</Label>
              <Input
                id="title"
                name="title"
                defaultValue={`${lead.company_name || lead.first_name} — Website`}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                defaultValue={lead.estimated_value || 0}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project_name">Project name</Label>
              <Input
                id="project_name"
                name="project_name"
                defaultValue={`${lead.company_name || lead.first_name} Website`}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="create_project" defaultChecked className="rounded" />
              Create starter project
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="invite_client" className="rounded" />
              Invite client to portal
            </label>
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Converting…" : "Mark won & create client"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function fullNameFallback(lead: Lead) {
  return [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "New Client";
}
