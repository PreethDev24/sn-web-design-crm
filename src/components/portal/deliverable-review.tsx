"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addFeedback, approveDeliverable } from "@/lib/actions/projects";
import type { Deliverable, Feedback } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export function DeliverableReview({
  deliverable,
  feedback,
  projectId,
}: {
  deliverable: Deliverable;
  feedback: Feedback[];
  projectId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{deliverable.title}</h3>
          <p className="text-sm text-slate-500">{deliverable.description}</p>
        </div>
        <Badge
          variant={
            deliverable.status === "approved"
              ? "success"
              : deliverable.status === "changes_requested"
                ? "warning"
                : "secondary"
          }
        >
          {deliverable.status}
        </Badge>
      </div>

      {(deliverable.preview_url || deliverable.file_url) && (
        <a
          href={deliverable.preview_url || deliverable.file_url || "#"}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-sm text-teal-700 hover:underline"
        >
          Open preview / file
        </a>
      )}

      {deliverable.status !== "approved" && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                try {
                  await approveDeliverable(deliverable.id, projectId);
                  toast.success("Deliverable approved");
                  router.refresh();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                }
              });
            }}
          >
            Approve
          </Button>
        </div>
      )}

      <div className="space-y-2 border-t border-slate-100 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Feedback</p>
        <ul className="space-y-2">
          {feedback.map((f) => (
            <li key={f.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
              {f.comment}
            </li>
          ))}
        </ul>
        {deliverable.status !== "approved" && (
          <form
            className="space-y-2"
            action={(fd) => {
              fd.set("deliverable_id", deliverable.id);
              fd.set("project_id", projectId);
              startTransition(async () => {
                try {
                  await addFeedback(fd);
                  toast.success("Feedback sent");
                  router.refresh();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                }
              });
            }}
          >
            <Textarea name="comment" placeholder="Leave feedback…" required />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="request_changes" className="rounded" />
              Request changes
            </label>
            <Button type="submit" size="sm" variant="secondary" disabled={pending}>
              Submit feedback
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
