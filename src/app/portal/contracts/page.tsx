import Link from "next/link";
import { requireClient } from "@/lib/auth/roles";
import { getClientForUser, listContractsForClient } from "@/lib/db/queries";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function PortalContractsPage() {
  const user = await requireClient();
  const client = await getClientForUser(user.id);
  const contracts = client ? await listContractsForClient(client.id) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Contracts</h1>
        <p className="mt-1 text-slate-500">Review and sign agreements</p>
      </div>
      <div className="grid gap-3">
        {contracts.map((c) => (
          <Link key={c.id} href={`/portal/contracts/${c.id}`}>
            <Card className="hover:border-teal-300 transition-colors">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{c.title}</p>
                  <p className="text-sm text-slate-500">{formatDate(c.created_at)}</p>
                </div>
                <Badge
                  variant={c.status === "signed" ? "success" : "secondary"}
                >
                  {c.status}
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
        {contracts.length === 0 && (
          <p className="text-sm text-slate-500">No contracts yet.</p>
        )}
      </div>
    </div>
  );
}
