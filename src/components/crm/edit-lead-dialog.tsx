"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import type { Lead } from "@/lib/types";
import { deleteLead, updateLead } from "@/lib/actions/crm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function EditLeadDialog({
  lead,
  trigger,
}: {
  lead: Lead;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" size="sm" className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit lead</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          action={(fd) => {
            startTransition(async () => {
              try {
                await updateLead(lead.id, fd);
                toast.success("Lead updated");
                setOpen(false);
                router.refresh();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed to update");
              }
            });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`edit_first_${lead.id}`}>First name</Label>
              <Input
                id={`edit_first_${lead.id}`}
                name="first_name"
                required
                defaultValue={lead.first_name}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`edit_last_${lead.id}`}>Last name</Label>
              <Input
                id={`edit_last_${lead.id}`}
                name="last_name"
                defaultValue={lead.last_name || ""}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit_email_${lead.id}`}>Email</Label>
            <Input
              id={`edit_email_${lead.id}`}
              name="email"
              type="email"
              defaultValue={lead.email || ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit_phone_${lead.id}`}>Phone</Label>
            <Input
              id={`edit_phone_${lead.id}`}
              name="phone"
              defaultValue={lead.phone || ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit_company_${lead.id}`}>Company</Label>
            <Input
              id={`edit_company_${lead.id}`}
              name="company_name"
              defaultValue={lead.company_name || ""}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`edit_source_${lead.id}`}>Source</Label>
              <Input
                id={`edit_source_${lead.id}`}
                name="source"
                defaultValue={lead.source || ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`edit_value_${lead.id}`}>Est. value ($)</Label>
              <Input
                id={`edit_value_${lead.id}`}
                name="estimated_value"
                type="number"
                step="0.01"
                defaultValue={lead.estimated_value || 0}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit_notes_${lead.id}`}>Notes</Label>
            <Textarea
              id={`edit_notes_${lead.id}`}
              name="notes"
              defaultValue={lead.notes || ""}
            />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteLeadButton({
  leadId,
  redirectToList = false,
  compact = false,
}: {
  leadId: string;
  redirectToList?: boolean;
  compact?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      type="button"
      variant={compact ? "ghost" : "destructive"}
      size={compact ? "icon" : "sm"}
      className={compact ? "h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700" : "gap-1.5"}
      disabled={pending}
      onClick={() => {
        if (!confirm("Delete this lead? This cannot be undone.")) return;
        startTransition(async () => {
          try {
            await deleteLead(leadId);
            toast.success("Lead deleted");
            if (redirectToList) router.push("/crm/leads");
            else router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to delete");
          }
        });
      }}
    >
      <Trash2 className="h-3.5 w-3.5" />
      {!compact && (pending ? "Deleting…" : "Delete")}
    </Button>
  );
}
