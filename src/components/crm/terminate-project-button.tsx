"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { terminateProject } from "@/lib/actions/projects";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function TerminateProjectButton({
  projectId,
  projectName,
  status,
}: {
  projectId: string;
  projectName: string;
  status: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (status === "terminated") return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm" className="gap-1.5">
          <Ban className="h-3.5 w-3.5" />
          Terminate project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Terminate project?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm text-slate-600">
          <p>
            End <strong className="text-slate-900">{projectName}</strong> and mark it as
            terminated.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Project status becomes terminated</li>
            <li>Deliverables and activity history are kept</li>
            <li>Sales reps will still see it as view-only history</li>
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
                    await terminateProject(projectId);
                    toast.success("Project terminated");
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
