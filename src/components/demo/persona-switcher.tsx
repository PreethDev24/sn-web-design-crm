"use client";

import { useTransition } from "react";
import { resetDemoData, switchDemoPersona } from "@/lib/actions/demo";
import type { DbUser } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function DemoPersonaSwitcher({
  users,
  currentUserId,
}: {
  users: DbUser[];
  currentUserId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={currentUserId}
        disabled={pending}
        onValueChange={(id) => {
          startTransition(async () => {
            await switchDemoPersona(id);
          });
        }}
      >
        <SelectTrigger className="h-8 w-[200px] bg-white text-xs">
          <SelectValue placeholder="Switch persona" />
        </SelectTrigger>
        <SelectContent>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.first_name} ({u.role})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        className="h-8 text-xs"
        onClick={() => {
          startTransition(async () => {
            await resetDemoData();
          });
        }}
      >
        Reset data
      </Button>
    </div>
  );
}

export function DemoBanner({
  users,
  currentUserId,
}: {
  users: DbUser[];
  currentUserId: string;
}) {
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-amber-900">
          <span className="font-semibold">Demo mode</span> — local data, no Clerk / Supabase /
          Stripe required. Switch personas to test CRM vs client portal.
        </p>
        <DemoPersonaSwitcher users={users} currentUserId={currentUserId} />
      </div>
    </div>
  );
}
