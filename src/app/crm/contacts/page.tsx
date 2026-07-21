import { requireOwner } from "@/lib/auth/roles";
import { listContactsForOwner } from "@/lib/db/queries";
import { ContactsDirectory } from "@/components/crm/contacts-directory";

export default async function ContactsPage() {
  const owner = await requireOwner();
  const { users, salesProfiles } = await listContactsForOwner();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl">Contacts</h1>
        <p className="mt-1 text-slate-500">
          All people in the CRM — filter by role and review sales onboarding details
        </p>
      </div>
      <ContactsDirectory
        users={users}
        salesProfiles={salesProfiles}
        currentUserId={owner.id}
      />
    </div>
  );
}
