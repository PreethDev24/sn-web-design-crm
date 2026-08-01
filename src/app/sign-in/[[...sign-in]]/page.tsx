import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { SignIn } from "@clerk/nextjs";

export default async function SignInPage() {
  const { userId } = await auth();
  // Already signed in — route through post-auth (never bounce with forceRedirectUrl).
  if (userId) redirect("/post-auth");

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <SignIn fallbackRedirectUrl="/post-auth" signUpUrl="/sign-up" />
    </div>
  );
}
