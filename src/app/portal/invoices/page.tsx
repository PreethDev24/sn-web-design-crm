import Link from "next/link";
import { requireClient } from "@/lib/auth/roles";
import { getClientForUser, listInvoicesForClient } from "@/lib/db/queries";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function PortalInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string }>;
}) {
  const user = await requireClient();
  const { paid } = await searchParams;
  const client = await getClientForUser(user.id);
  const invoices = client ? await listInvoicesForClient(client.id) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Invoices</h1>
        <p className="mt-1 text-slate-500">View and pay outstanding balances</p>
      </div>
      {paid === "1" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Payment received — thank you. Status updates when Stripe confirms.
        </div>
      )}
      <div className="grid gap-3">
        {invoices.map((inv) => (
          <Link key={inv.id} href={`/portal/invoices/${inv.id}`}>
            <Card className="hover:border-teal-300 transition-colors">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{inv.title}</p>
                  <p className="text-sm text-slate-500">
                    {inv.invoice_number} · Due {formatDate(inv.due_date)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(inv.amount, inv.currency)}</p>
                  <Badge
                    variant={inv.status === "paid" ? "success" : "secondary"}
                    className="mt-1"
                  >
                    {inv.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {invoices.length === 0 && (
          <p className="text-sm text-slate-500">No invoices yet.</p>
        )}
      </div>
    </div>
  );
}
