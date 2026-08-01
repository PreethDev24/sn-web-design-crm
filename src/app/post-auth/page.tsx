import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { auth } from "@clerk/nextjs/server";
import { getOrCreateDbUser } from "@/lib/auth/roles";
import { hasCompletedSalesOnboarding } from "@/lib/db/queries";
import { PostAuthError, PostAuthWaiter } from "@/components/auth/post-auth-waiter";

/**
 * Post sign-in/sign-up router. New sales reps go to onboarding instead of
 * crashing on /crm/dashboard before their profile exists.
 *
 * Important: never redirect a signed-in user to /sign-in from here — SignIn
 * immediately sends them back to /post-auth and creates an infinite loop.
 */
export default async function PostAuthPage() {
  const { userId } = await auth();
  if (!userId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <PostAuthWaiter />
      </div>
    );
  }

  try {
    const user = await getOrCreateDbUser();
    if (!user) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
          <PostAuthError message="Your account signed in, but we couldn’t load your profile. Try again or sign out." />
        </div>
      );
    }

    if (user.role === "client") redirect("/portal/dashboard");

    if (user.role === "sales") {
      const done = await hasCompletedSalesOnboarding(user);
      redirect(done ? "/crm/dashboard" : "/onboarding/sales");
    }

    redirect("/crm/dashboard");
  } catch (e) {
    if (isRedirectError(e)) throw e;
    console.error("post-auth failed:", e);
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <PostAuthError
          message={
            e instanceof Error
              ? e.message
              : "Something went wrong while routing your account."
          }
        />
      </div>
    );
  }
}
