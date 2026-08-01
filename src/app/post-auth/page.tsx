import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { auth } from "@clerk/nextjs/server";
import { getOrCreateDbUser } from "@/lib/auth/roles";
import { hasCompletedSalesOnboarding } from "@/lib/db/queries";

/**
 * Post sign-in/sign-up router. New sales reps go to onboarding instead of
 * crashing on /crm/dashboard before their profile exists.
 */
export default async function PostAuthPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  try {
    const user = await getOrCreateDbUser();
    if (!user) redirect("/sign-in");

    if (user.role === "client") redirect("/portal/dashboard");

    if (user.role === "sales") {
      const done = await hasCompletedSalesOnboarding(user);
      redirect(done ? "/crm/dashboard" : "/onboarding/sales");
    }

    redirect("/crm/dashboard");
  } catch (e) {
    if (isRedirectError(e)) throw e;
    console.error("post-auth failed:", e);
    redirect("/sign-in");
  }
}
