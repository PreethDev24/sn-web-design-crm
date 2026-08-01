import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { SignUp } from "@clerk/nextjs";

export default async function SignUpPage() {
  const { userId } = await auth();
  // Invite accept can leave a fresh session here — finish routing via post-auth.
  if (userId) redirect("/post-auth");

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <SignUp fallbackRedirectUrl="/post-auth" signInUrl="/sign-in" />
    </div>
  );
}
