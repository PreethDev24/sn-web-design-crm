"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { requestClientInvite } from "@/lib/actions/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function RequestClientInviteForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4 max-w-md"
      action={(fd) => {
        startTransition(async () => {
          try {
            await requestClientInvite(fd);
            toast.success("Request sent — waiting for owner approval");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed");
          }
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="client_name">Client / company name</Label>
        <Input
          id="client_name"
          name="client_name"
          placeholder="Acme Coffee"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Client email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          placeholder="alex@company.com"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="note">Note for owner (optional)</Label>
        <Textarea
          id="note"
          name="note"
          rows={3}
          placeholder="Why they need portal access…"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Request client invite"}
      </Button>
    </form>
  );
}
