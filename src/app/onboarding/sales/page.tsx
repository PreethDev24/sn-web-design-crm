import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/roles";
import { getSalesProfile } from "@/lib/db/queries";
import { fullName } from "@/lib/utils";
import { SalesOnboardingWizard } from "@/components/onboarding/sales-onboarding-wizard";

export default async function SalesOnboardingPage() {
  const user = await requireAuth();

  if (user.role !== "sales") {
    redirect(user.role === "client" ? "/portal/dashboard" : "/crm/dashboard");
  }

  const profile = await getSalesProfile(user.id);
  if (profile?.completed_at) {
    redirect("/crm/dashboard");
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 70% 45% at 10% 20%, #0f766e22, transparent), radial-gradient(ellipse 50% 40% at 90% 10%, #134e4a18, transparent), linear-gradient(180deg, #f8fafc 0%, #eef6f5 100%)",
        }}
      />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16 md:px-10">
        <p className="mb-8 text-sm font-medium uppercase tracking-[0.2em] text-teal-700">
          SN Web Design · Sales onboarding
        </p>
        <SalesOnboardingWizard
          initial={{
            full_name: fullName(user.first_name, user.last_name).replace(/^Unknown$/, ""),
            email: user.email || "",
            phone: user.phone || "",
          }}
        />
      </div>
    </div>
  );
}
