"use client";

import { SignOutButton } from "@clerk/nextjs";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HeaderSignOut() {
  return (
    <SignOutButton redirectUrl="/">
      <Button type="button" variant="outline" size="sm" className="gap-2">
        <LogOut className="h-4 w-4" />
        Sign out
      </Button>
    </SignOutButton>
  );
}
