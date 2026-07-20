import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClient } from "@/lib/auth/roles";
import { getClientForUser, getInvoice } from "@/lib/db/queries";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PayInvoiceButton } from "@/components/portal/pay-invoice-button";

export default async function PortalInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireClient();
  const { id } = await params;
  const client = await getClientForUser(user.id);
  const invoice = await getInvoice(id);
  if (!invoice || !client || invoice.client_id !== client.id) notFound();

  const payable = !["paid", "cancelled"].includes(invoice.status);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/invoices" className="text-sm text-teal-700 hover:underline">
          ← Invoices
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl">{invoice.title}</h1>
          <Badge variant={invoice.status === "paid" ? "success" : "secondary"}>
            {invoice.status}
          </Badge>
        </div>
        <p className="text-slate-500">{invoice.invoice_number}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Amount due</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-3xl font-semibold">
            {formatCurrency(invoice.amount, invoice.currency)}
          </p>
          <p className="text-sm text-slate-500">Due {formatDate(invoice.due_date)}</p>
          {invoice.description && (
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{invoice.description}</p>
          )}
          {payable && <PayInvoiceButton invoiceId={invoice.id} />}
          {invoice.status === "paid" && invoice.paid_at && (
            <p className="text-sm text-emerald-700">Paid {formatDate(invoice.paid_at)}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
