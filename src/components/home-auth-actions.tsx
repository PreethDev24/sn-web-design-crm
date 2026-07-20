"use client";

import Link from "next/link";
import { Show, SignInButton, SignOutButton, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export function HomeAuthActions() {
  return (
    <>
      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <span className="font-display text-xl tracking-tight">SN Web Design</span>
        <div className="flex items-center gap-3">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button variant="secondary" size="sm">
                Sign in
              </Button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <Button asChild size="sm">
              <Link href="/crm/dashboard">Open CRM</Link>
            </Button>
            <UserButton />
            <SignOutButton redirectUrl="/">
              <Button
                variant="outline"
                size="sm"
                className="border-slate-600 bg-transparent text-white hover:bg-slate-900"
              >
                Sign out
              </Button>
            </SignOutButton>
          </Show>
        </div>
      </header>
      <main className="relative z-10 mx-auto flex max-w-3xl flex-col items-start gap-6 px-6 pb-24 pt-24 md:px-10 md:pt-32">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-teal-400">
          Internal CRM
        </p>
        <h1 className="font-display text-4xl leading-tight tracking-tight md:text-6xl">
          SN Web Design
        </h1>
        <p className="max-w-xl text-lg text-slate-300">
          Run leads, projects, client approvals, contracts, and invoices in one place.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button size="lg">Sign in to continue</Button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <Button asChild size="lg">
              <Link href="/crm/dashboard">Go to dashboard</Link>
            </Button>
          </Show>
        </div>
      </main>
    </>
  );
}
