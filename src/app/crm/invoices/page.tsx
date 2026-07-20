import { requireInvoiceAccess } from "@/lib/auth/roles";
import { listClients, listInvoices, listProjects } from "@/lib/db/queries";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  CreateInvoiceDialog,
  SendInvoiceButton,
} from "@/components/crm/create-invoice-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function InvoicesPage() {
  const user = await requireInvoiceAccess();
  const [invoices, clients, projects] = await Promise.all([
    listInvoices(user),
    listClients(user),
    listProjects(user),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Invoices</h1>
          <p className="mt-1 text-slate-500">Bill clients and track payments</p>
        </div>
        <CreateInvoiceDialog clients={clients} projects={projects} />
      </div>
      <div className="grid gap-3">
        {invoices.map((inv) => (
          <Card key={inv.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">
                  {inv.invoice_number} · {inv.title}
                </p>
                <p className="text-sm text-slate-500">
                  {inv.client?.name} · Due {formatDate(inv.due_date)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold">{formatCurrency(inv.amount, inv.currency)}</span>
                <Badge
                  variant={
                    inv.status === "paid"
                      ? "success"
                      : inv.status === "overdue"
                        ? "danger"
                        : "secondary"
                  }
                >
                  {inv.status}
                </Badge>
                <SendInvoiceButton invoiceId={inv.id} status={inv.status} />
              </div>
            </CardContent>
          </Card>
        ))}
        {invoices.length === 0 && (
          <p className="text-sm text-slate-500">No invoices yet.</p>
        )}
      </div>
    </div>
  );
}
