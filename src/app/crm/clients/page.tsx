import Link from "next/link";
import { requireStaff } from "@/lib/auth/roles";
import { listClients } from "@/lib/db/queries";
import { CreateClientDialog } from "@/components/crm/create-client-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function ClientsPage() {
  const user = await requireStaff();
  const clients = await listClients(user);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Clients</h1>
          <p className="mt-1 text-slate-500">Active accounts and maintenance</p>
        </div>
        <CreateClientDialog />
      </div>
      <div className="grid gap-3">
        {clients.map((client) => (
          <Link key={client.id} href={`/crm/clients/${client.id}`}>
            <Card className="transition-colors hover:border-teal-300">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{client.name}</p>
                  <p className="text-sm text-slate-500">{client.email || "No email"}</p>
                </div>
                <Badge variant={client.status === "active" ? "success" : "secondary"}>
                  {client.status}
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
        {clients.length === 0 && (
          <p className="text-sm text-slate-500">No clients yet. Convert a won deal or add one.</p>
        )}
      </div>
    </div>
  );
}
