import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClient } from "@/lib/auth/roles";
import { getClientForUser, getContract } from "@/lib/db/queries";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/db/supabase";
import { isDemoMode } from "@/lib/demo/mode";
import { mutateStore, touch } from "@/lib/demo/store";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignContractForm } from "@/components/portal/sign-contract-form";

export default async function PortalContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireClient();
  const { id } = await params;
  const client = await getClientForUser(user.id);
  const contract = await getContract(id);
  if (!contract || !client || contract.client_id !== client.id) notFound();

  if (contract.status === "sent") {
    if (isDemoMode()) {
      mutateStore((store) => {
        const c = store.contracts.find((x) => x.id === id);
        if (c) {
          c.status = "viewed";
          c.viewed_at = touch();
          c.updated_at = touch();
        }
      });
    } else if (isSupabaseConfigured()) {
      await getSupabaseAdmin()
        .from("contracts")
        .update({ status: "viewed", viewed_at: new Date().toISOString() })
        .eq("id", id);
    }
  }

  const canSign = ["sent", "viewed"].includes(contract.status);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/contracts" className="text-sm text-teal-700 hover:underline">
          ← Contracts
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl">{contract.title}</h1>
          <Badge>{contract.status}</Badge>
        </div>
        <p className="text-slate-500">
          {contract.signed_at
            ? `Signed ${formatDate(contract.signed_at)}`
            : `Sent ${formatDate(contract.sent_at)}`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Document</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {contract.file_url ? (
            <a
              href={contract.file_url}
              target="_blank"
              rel="noreferrer"
              className="text-teal-700 hover:underline"
            >
              {contract.file_name || "Open contract file"}
            </a>
          ) : (
            <p className="text-sm text-slate-500">No file attached.</p>
          )}
          {canSign && <SignContractForm contractId={contract.id} />}
          {contract.status === "signed" && (
            <p className="text-sm text-emerald-700">This contract has been signed.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
