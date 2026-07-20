import { requireClient } from "@/lib/auth/roles";
import { PortalSidebar } from "@/components/layout/sidebars";
import { isDemoMode } from "@/lib/demo/mode";
import { getDemoUsers } from "@/lib/demo/store";
import { DemoBanner } from "@/components/demo/persona-switcher";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireClient();
  const demo = isDemoMode();

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f7f6]">
      {demo && <DemoBanner users={getDemoUsers()} currentUserId={user.id} />}
      <div className="flex flex-1 flex-col lg:flex-row">
        <PortalSidebar demo={demo} />
        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
