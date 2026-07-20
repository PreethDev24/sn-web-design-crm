import { requireStaff } from "@/lib/auth/roles";
import { CrmSidebar } from "@/components/layout/sidebars";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoUsers } from "@/lib/demo/store";
import { DemoBanner } from "@/components/demo/persona-switcher";
import { HeaderSignOut } from "@/components/header-sign-out";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const demo = isDemoMode();

  return (
    <div className="flex min-h-screen flex-col">
      {demo && <DemoBanner users={getDemoUsers()} currentUserId={user.id} />}
      <div className="flex flex-1 flex-col lg:flex-row">
        <CrmSidebar isOwner={user.role === "owner"} demo={demo} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="hidden h-14 items-center justify-between border-b border-slate-200 bg-white px-6 lg:flex">
            <p className="text-sm text-slate-500">
              Signed in as{" "}
              <span className="font-medium text-slate-800">
                {user.first_name} {user.last_name}
              </span>{" "}
              · {user.role === "owner" ? "Owner" : "Sales"}
            </p>
            {!demo && <HeaderSignOut />}
          </header>
          <main className="min-w-0 flex-1 overflow-x-hidden p-4 md:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
