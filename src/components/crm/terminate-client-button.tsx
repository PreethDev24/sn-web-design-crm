"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, RotateCcw } from "lucide-react";
import { terminateClient, reactivateClient } from "@/lib/actions/crm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function TerminateClientButton({
  clientId,
  clientName,
  status,
}: {
  clientId: string;
  clientName: string;
  status: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (status === "churned") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            try {
              await reactivateClient(clientId);
              toast.success("Client reactivated");
              router.refresh();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed");
            }
          });
        }}
      >
        <RotateCcw className="h-3.5 w-3.5" />
        {pending ? "Reactivating…" : "Reactivate"}
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm" className="gap-1.5">
          <Ban className="h-3.5 w-3.5" />
          Terminate client
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Terminate client?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm text-slate-600">
          <p>
            Mark <strong className="text-slate-900">{clientName}</strong> as terminated
            (churned).
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Client status becomes churned</li>
            <li>Open projects for this client are set to terminated</li>
            <li>History, contracts, and invoices are kept</li>
          </ul>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  try {
                    await terminateClient(clientId);
                    toast.success("Client terminated");
                    setOpen(false);
                    router.refresh();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed");
                  }
                });
              }}
            >
              {pending ? "Terminating…" : "Terminate"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
