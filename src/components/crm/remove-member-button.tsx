"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import type { DbUser } from "@/lib/types";
import { removePortalMember } from "@/lib/actions/members";
import { fullName } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function RemoveMemberButton({
  member,
  currentUserId,
}: {
  member: DbUser;
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const removable = member.role === "sales" || member.role === "client";
  if (!removable || member.id === currentUserId) return null;

  const label = fullName(member.first_name, member.last_name);
  const roleLabel = member.role === "sales" ? "sales rep" : "client";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm" className="gap-1.5">
          <Trash2 className="h-3.5 w-3.5" />
          Remove
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {roleLabel}?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm text-slate-600">
          <p>
            This permanently removes <strong className="text-slate-900">{label}</strong> (
            {member.email}) from the portal.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Deletes their Clerk login account</li>
            <li>Removes their Supabase user record</li>
            <li>Revokes any pending invite for this email</li>
            {member.role === "client" && (
              <li>Unlinks them from any client company (company data stays)</li>
            )}
            {member.role === "sales" && (
              <li>Clears their sales onboarding profile</li>
            )}
          </ul>
          <p className="font-medium text-red-700">This cannot be undone.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  try {
                    await removePortalMember(member.id);
                    toast.success(`${label} removed`);
                    setOpen(false);
                    router.refresh();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed to remove");
                  }
                });
              }}
            >
              {pending ? "Removing…" : "Remove permanently"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
