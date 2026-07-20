"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addActivity } from "@/lib/actions/crm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";

export function ActivityForm({
  leadId,
  dealId,
  clientId,
  projectId,
}: {
  leadId?: string;
  dealId?: string;
  clientId?: string;
  projectId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState("note");

  return (
    <form
      className="space-y-2"
      action={(fd) => {
        fd.set("type", type);
        if (leadId) fd.set("lead_id", leadId);
        if (dealId) fd.set("deal_id", dealId);
        if (clientId) fd.set("client_id", clientId);
        if (projectId) fd.set("project_id", projectId);
        startTransition(async () => {
          try {
            await addActivity(fd);
            toast.success("Activity added");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed");
          }
        });
      }}
    >
      <Select value={type} onValueChange={setType}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="note">Note</SelectItem>
          <SelectItem value="call">Call</SelectItem>
          <SelectItem value="email">Email</SelectItem>
          <SelectItem value="meeting">Meeting</SelectItem>
        </SelectContent>
      </Select>
      <Textarea name="body" placeholder="Add a note…" required />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Add activity"}
      </Button>
    </form>
  );
}
