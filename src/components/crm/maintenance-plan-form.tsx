"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createMaintenancePlan } from "@/lib/actions/billing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function MaintenancePlanForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Maintenance plan</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          action={(fd) => {
            fd.set("client_id", clientId);
            startTransition(async () => {
              try {
                await createMaintenancePlan(fd);
                toast.success("Plan added");
                router.refresh();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed");
              }
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="name">Plan name</Label>
            <Input id="name" name="name" placeholder="Care plan" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="monthly_amount">Monthly amount</Label>
            <Input id="monthly_amount" name="monthly_amount" type="number" step="0.01" required />
          </div>
          <Button type="submit" size="sm" disabled={pending} className="w-full">
            Add plan
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
