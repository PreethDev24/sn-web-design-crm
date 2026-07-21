import { requireContractAccess } from "@/lib/auth/roles";
import { listClients, listContracts, listProjects } from "@/lib/db/queries";
import { formatDate } from "@/lib/utils";
import { CreateContractDialog } from "@/components/crm/create-contract-dialog";
import { SendContractButton } from "@/components/crm/send-contract-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function ContractsPage() {
  const user = await requireContractAccess();
  const [contracts, clients, projects] = await Promise.all([
    listContracts(user),
    listClients(user),
    listProjects(user),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Contracts</h1>
          <p className="mt-1 text-slate-500">Upload, send, and track signatures</p>
        </div>
        <CreateContractDialog clients={clients} projects={projects} />
      </div>
      <div className="grid gap-3">
        {contracts.map((c) => (
          <Card key={c.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{c.title}</p>
                <p className="text-sm text-slate-500">
                  {c.client?.name} · {formatDate(c.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    c.status === "signed" ? "success" : c.status === "sent" ? "default" : "secondary"
                  }
                >
                  {c.status}
                </Badge>
                <SendContractButton contractId={c.id} status={c.status} />
                {c.file_url && (
                  <a
                    href={c.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-teal-700 hover:underline"
                  >
                    View file
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {contracts.length === 0 && (
          <p className="text-sm text-slate-500">No contracts yet.</p>
        )}
      </div>
    </div>
  );
}
