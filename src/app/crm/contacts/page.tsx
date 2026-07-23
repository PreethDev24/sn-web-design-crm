import { requireStaff } from "@/lib/auth/roles";
import { listContactsForViewer } from "@/lib/db/queries";
import { ContactsDirectory } from "@/components/crm/contacts-directory";

export default async function ContactsPage() {
  const user = await requireStaff();
  const isOwner = user.role === "owner";
  const { users, salesProfiles } = await listContactsForViewer(user);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl">Contacts</h1>
        <p className="mt-1 text-slate-500">
          {isOwner
            ? "All people in the CRM — filter by role and review sales onboarding details"
            : "Owners and clients only — other sales reps are hidden"}
        </p>
      </div>
      <ContactsDirectory
        users={users}
        salesProfiles={salesProfiles}
        currentUserId={user.id}
        isOwner={isOwner}
      />
    </div>
  );
}
