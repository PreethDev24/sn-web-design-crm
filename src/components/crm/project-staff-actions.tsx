"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Project, ProjectStatus } from "@/lib/types";
import { PROJECT_STATUSES } from "@/lib/types";
import { createDeliverable, updateProjectStatus } from "@/lib/actions/projects";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ProjectStaffActions({
  project,
  canManage = true,
  canUpload = true,
}: {
  project: Project;
  canManage?: boolean;
  canUpload?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              defaultValue={project.status}
              onValueChange={(value) => {
                startTransition(async () => {
                  try {
                    await updateProjectStatus(project.id, value as ProjectStatus);
                    toast.success("Updated");
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
                {PROJECT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {canUpload && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload deliverable</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              action={(fd) => {
                fd.set("project_id", project.id);
                startTransition(async () => {
                  try {
                    await createDeliverable(fd);
                    toast.success("Deliverable uploaded");
                    router.refresh();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed");
                  }
                });
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" required placeholder="Homepage mockup v1" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="file">File</Label>
                <Input id="file" name="file" type="file" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="preview_url">Or preview URL</Label>
                <Input id="preview_url" name="preview_url" placeholder="https://…" />
              </div>
              <Button type="submit" disabled={pending} className="w-full">
                Send for review
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
