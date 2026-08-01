"use client";

import { useEffect, useState } from "react";
import { useAuth, SignOutButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * After Clerk invite accept / sign-up, the first server render of /post-auth
 * often runs before the session cookie is readable. Waiting on the client
 * avoids bouncing forever between /post-auth and /sign-in.
 */
export function PostAuthWaiter() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);
  const [giveUp, setGiveUp] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn) {
      if (attempts >= 10) {
        setGiveUp(true);
        return;
      }
      const t = window.setTimeout(() => {
        setAttempts((n) => n + 1);
        router.refresh();
      }, attempts === 0 ? 200 : 400);
      return () => window.clearTimeout(t);
    }

    const t = window.setTimeout(() => setGiveUp(true), 5000);
    return () => window.clearTimeout(t);
  }, [isLoaded, isSignedIn, attempts, router]);

  if (giveUp) {
    return (
      <div className="mx-auto max-w-md space-y-4 text-center">
        <p className="text-sm font-medium text-slate-900">Sign-in didn’t finish</p>
        <p className="text-sm text-slate-600">
          Your browser session didn’t sync with the server. Sign out and open the invite link again.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <SignOutButton redirectUrl="/sign-in">
            <Button type="button">Sign out</Button>
          </SignOutButton>
          <Button asChild variant="outline">
            <Link href="/sign-in">Go to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-3 text-center">
      <p className="text-sm font-medium text-slate-800">Finishing sign-in…</p>
      <p className="text-xs text-slate-500">
        This usually takes a second after accepting an invite.
      </p>
    </div>
  );
}

export function PostAuthError({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-md space-y-4 text-center">
      <p className="text-sm font-medium text-slate-900">Couldn’t finish setup</p>
      <p className="text-sm text-slate-600">{message}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild variant="outline">
          <Link href="/post-auth">Try again</Link>
        </Button>
        <SignOutButton redirectUrl="/sign-in">
          <Button type="button" variant="secondary">
            Sign out
          </Button>
        </SignOutButton>
      </div>
    </div>
  );
}
