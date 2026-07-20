import Link from "next/link";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoUsers } from "@/lib/demo/store";
import { getDemoUser } from "@/lib/demo/auth";
import { DemoPersonaSwitcher } from "@/components/demo/persona-switcher";
import { HomeAuthActions } from "@/components/home-auth-actions";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  if (isDemoMode()) {
    const [users, current] = await Promise.all([
      Promise.resolve(getDemoUsers()),
      getDemoUser(),
    ]);
    const crmHref = current.role === "client" ? "/portal/dashboard" : "/crm/dashboard";

    return (
      <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 80% 50% at 20% 40%, #0f766e55, transparent), radial-gradient(ellipse 60% 40% at 80% 20%, #164e6355, transparent)",
          }}
        />
        <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-6 py-5 md:px-10">
          <span className="font-display text-xl tracking-tight">SN Web Design</span>
          <DemoPersonaSwitcher users={users} currentUserId={current.id} />
        </header>
        <main className="relative z-10 mx-auto flex max-w-3xl flex-col items-start gap-6 px-6 pb-24 pt-20 md:px-10">
          <p className="rounded-md bg-amber-400/20 px-3 py-1 text-sm font-medium text-amber-200">
            Demo mode — no integrations required
          </p>
          <h1 className="font-display text-4xl leading-tight tracking-tight md:text-6xl">
            SN Web Design
          </h1>
          <p className="max-w-xl text-lg text-slate-300">
            Test the full CRM locally. Switch between Owner, Sales, and Client personas from the
            banner to walk the entire client lifecycle.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild size="lg">
              <Link href={crmHref}>
                {current.role === "client" ? "Open client portal" : "Open CRM"}
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-slate-600 bg-transparent text-white hover:bg-slate-900"
            >
              <Link href="/crm/leads">Leads pipeline</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 50% at 20% 40%, #0f766e55, transparent), radial-gradient(ellipse 60% 40% at 80% 20%, #164e6355, transparent)",
        }}
      />
      <HomeAuthActions />
    </div>
  );
}
