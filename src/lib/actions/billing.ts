"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import Stripe from "stripe";
import { requireClient, requireInvoiceAccess, requireContractAccess, requireStaff } from "@/lib/auth/roles";
import { recordAuditLog } from "@/lib/audit/log";
import {
  isDataConfigured,
  createDocument,
  updateDocument,
  getDocument,
  uploadToBucket,
  COLLECTIONS,
} from "@/lib/db/repo";
import { isDemoMode, isStripeConfigured } from "@/lib/demo/mode";
import { mutateStore, newId, touch } from "@/lib/demo/store";
import type { Client, Contract, Invoice, MaintenancePlan } from "@/lib/types";
import { nanoid } from "nanoid";
import fs from "fs";
import path from "path";

function assertDbReady() {
  if (!isDataConfigured()) {
    throw new Error("Database is not configured. Add credentials to .env.local");
  }
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key);
}

async function saveDemoFile(file: File, folder: string) {
  const dir = path.join(process.cwd(), ".data", "uploads", folder);
  fs.mkdirSync(dir, { recursive: true });
  const ext = file.name.split(".").pop() || "pdf";
  const filename = `${nanoid()}.${ext}`;
  fs.writeFileSync(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
  return `/api/demo/files/${folder}/${filename}`;
}

export async function createContract(formData: FormData) {
  const user = await requireContractAccess();
  const file = formData.get("file") as File | null;
  let fileUrl: string | null = null;
  let fileName: string | null = null;

  if (isDemoMode()) {
    if (file && file.size > 0) {
      fileUrl = await saveDemoFile(file, "contracts");
      fileName = file.name;
    } else {
      fileUrl = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
      fileName = "contract.pdf";
    }
    mutateStore((store) => {
      const contract: Contract = {
        id: newId("contract"),
        title: String(formData.get("title") || "").trim(),
        client_id: String(formData.get("client_id") || ""),
        project_id: String(formData.get("project_id") || "") || null,
        file_url: fileUrl,
        file_name: fileName,
        status: "draft",
        sent_at: null,
        viewed_at: null,
        signed_at: null,
        signature_data: null,
        signer_ip: null,
        signer_user_agent: null,
        created_by: user.id,
        created_at: touch(),
        updated_at: touch(),
      };
      store.contracts.push(contract);
    });
    revalidatePath("/crm/contracts");
    return;
  }

  assertDbReady();
  const now = new Date().toISOString();
  if (file && file.size > 0) {
    const storagePath = `${nanoid()}.${file.name.split(".").pop() || "pdf"}`;
    try {
      const uploaded = await uploadToBucket("contracts", storagePath, file, file.name);
      fileUrl = uploaded.publicUrl;
      fileName = file.name;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`Upload failed: ${message}. Create a storage bucket named "contracts".`);
    }
  }

  await createDocument(COLLECTIONS.contracts, {
    title: String(formData.get("title") || "").trim(),
    client_id: String(formData.get("client_id") || ""),
    project_id: String(formData.get("project_id") || "") || null,
    file_url: fileUrl,
    file_name: fileName,
    status: "draft",
    sent_at: null,
    viewed_at: null,
    signed_at: null,
    signature_data: null,
    signer_ip: null,
    signer_user_agent: null,
    created_by: user.id === "local-dev-user" ? null : user.id,
    created_at: now,
    updated_at: now,
  });
  revalidatePath("/crm/contracts");
}

export async function sendContract(contractId: string) {
  const user = await requireContractAccess();

  if (isDemoMode()) {
    const title = mutateStore((store) => {
      const c = store.contracts.find((x) => x.id === contractId);
      if (!c) throw new Error("Contract not found");
      c.status = "sent";
      c.sent_at = touch();
      c.updated_at = touch();
      return c.title;
    });
    revalidatePath("/crm/contracts");
    revalidatePath("/portal/contracts");
    await recordAuditLog({
      action: "contract.sent",
      actor: user,
      targetType: "contract",
      targetId: contractId,
      targetLabel: title,
      summary: `Sent contract ${title}`,
    });
    return;
  }

  assertDbReady();
  const now = new Date().toISOString();
  const contract = await getDocument(COLLECTIONS.contracts, contractId) as unknown as ({ id: string; title: string }) | null;
  await updateDocument(COLLECTIONS.contracts, contractId, {
    status: "sent",
    sent_at: now,
    updated_at: now,
  });
  revalidatePath("/crm/contracts");
  revalidatePath("/portal/contracts");
  await recordAuditLog({
    action: "contract.sent",
    actor: user,
    targetType: "contract",
    targetId: contractId,
    targetLabel: contract?.title ?? contractId,
    summary: `Sent contract ${contract?.title ?? contractId}`,
  });
}

export async function signContract(contractId: string, signatureData: string) {
  const clientUser = await requireClient();
  const hdrs = await headers();

  if (isDemoMode()) {
    const title = mutateStore((store) => {
      const c = store.contracts.find((x) => x.id === contractId);
      if (!c) throw new Error("Contract not found");
      c.status = "signed";
      c.signed_at = touch();
      c.signature_data = { signature: signatureData, typedAt: touch() };
      c.signer_ip = hdrs.get("x-forwarded-for") || "127.0.0.1";
      c.signer_user_agent = hdrs.get("user-agent");
      c.updated_at = touch();
      return c.title;
    });
    revalidatePath("/portal/contracts");
    revalidatePath(`/portal/contracts/${contractId}`);
    revalidatePath("/crm/contracts");
    await recordAuditLog({
      action: "contract.signed",
      actor: clientUser,
      targetType: "contract",
      targetId: contractId,
      targetLabel: title,
      summary: `Contract ${title} signed by ${clientUser.email}`,
    });
    return;
  }

  assertDbReady();
  const now = new Date().toISOString();
  const contract = await getDocument(COLLECTIONS.contracts, contractId) as unknown as (Contract) | null;
  if (!contract) throw new Error("Contract not found");

  await updateDocument(COLLECTIONS.contracts, contractId, {
    status: "signed",
    signed_at: now,
    signature_data: { signature: signatureData, typedAt: now },
    signer_ip: hdrs.get("x-forwarded-for") || hdrs.get("x-real-ip"),
    signer_user_agent: hdrs.get("user-agent"),
    updated_at: now,
  });
  revalidatePath("/portal/contracts");
  revalidatePath(`/portal/contracts/${contractId}`);
  revalidatePath("/crm/contracts");
  await recordAuditLog({
    action: "contract.signed",
    actor: clientUser,
    targetType: "contract",
    targetId: contractId,
    targetLabel: contract.title,
    summary: `Contract ${contract.title} signed by ${clientUser.email}`,
  });
}

export async function createInvoice(formData: FormData) {
  const user = await requireInvoiceAccess();
  const invoiceNumber = `INV-${new Date().getFullYear()}-${nanoid(6).toUpperCase()}`;

  if (isDemoMode()) {
    mutateStore((store) => {
      const invoice: Invoice = {
        id: newId("invoice"),
        invoice_number: invoiceNumber,
        title: String(formData.get("title") || "").trim(),
        description: String(formData.get("description") || "").trim() || null,
        client_id: String(formData.get("client_id") || ""),
        project_id: String(formData.get("project_id") || "") || null,
        amount: Number(formData.get("amount") || 0),
        currency: String(formData.get("currency") || "USD"),
        due_date: String(formData.get("due_date") || "") || null,
        status: "draft",
        paid_at: null,
        stripe_checkout_session_id: null,
        stripe_payment_intent_id: null,
        created_by: user.id,
        created_at: touch(),
        updated_at: touch(),
      };
      store.invoices.push(invoice);
    });
    revalidatePath("/crm/invoices");
    await recordAuditLog({
      action: "invoice.created",
      actor: user,
      targetType: "invoice",
      targetLabel: invoiceNumber,
      summary: `Created invoice ${invoiceNumber}`,
      metadata: {
        title: String(formData.get("title") || "").trim(),
        amount: Number(formData.get("amount") || 0),
      },
    });
    return;
  }

  assertDbReady();
  const now = new Date().toISOString();
  await createDocument(COLLECTIONS.invoices, {
    invoice_number: invoiceNumber,
    title: String(formData.get("title") || "").trim(),
    description: String(formData.get("description") || "").trim() || null,
    client_id: String(formData.get("client_id") || ""),
    project_id: String(formData.get("project_id") || "") || null,
    amount: Number(formData.get("amount") || 0),
    currency: String(formData.get("currency") || "USD"),
    due_date: String(formData.get("due_date") || "") || null,
    status: "draft",
    paid_at: null,
    stripe_checkout_session_id: null,
    stripe_payment_intent_id: null,
    created_by: user.id === "local-dev-user" ? null : user.id,
    created_at: now,
    updated_at: now,
  });
  revalidatePath("/crm/invoices");
  await recordAuditLog({
    action: "invoice.created",
    actor: user,
    targetType: "invoice",
    targetLabel: invoiceNumber,
    summary: `Created invoice ${invoiceNumber}`,
    metadata: {
      title: String(formData.get("title") || "").trim(),
      amount: Number(formData.get("amount") || 0),
    },
  });
}

export async function sendInvoice(invoiceId: string) {
  const user = await requireInvoiceAccess();

  if (isDemoMode()) {
    const label = mutateStore((store) => {
      const inv = store.invoices.find((i) => i.id === invoiceId);
      if (!inv) throw new Error("Invoice not found");
      inv.status = "sent";
      inv.updated_at = touch();
      return inv.invoice_number;
    });
    revalidatePath("/crm/invoices");
    revalidatePath("/portal/invoices");
    await recordAuditLog({
      action: "invoice.sent",
      actor: user,
      targetType: "invoice",
      targetId: invoiceId,
      targetLabel: label,
      summary: `Sent invoice ${label}`,
    });
    return;
  }

  assertDbReady();
  const now = new Date().toISOString();
  const inv = await getDocument(
    COLLECTIONS.invoices,
    invoiceId
  ) as unknown as ({ id: string; invoice_number: string }) | null;
  await updateDocument(COLLECTIONS.invoices, invoiceId, { status: "sent", updated_at: now });
  revalidatePath("/crm/invoices");
  revalidatePath("/portal/invoices");
  await recordAuditLog({
    action: "invoice.sent",
    actor: user,
    targetType: "invoice",
    targetId: invoiceId,
    targetLabel: inv?.invoice_number ?? invoiceId,
    summary: `Sent invoice ${inv?.invoice_number ?? invoiceId}`,
  });
}

export async function createCheckoutSession(invoiceId: string) {
  await requireClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Demo / no Stripe: mark paid immediately and return success URL
  if (isDemoMode() || !isStripeConfigured()) {
    if (isDemoMode()) {
      mutateStore((store) => {
        const inv = store.invoices.find((i) => i.id === invoiceId);
        if (!inv) throw new Error("Invoice not found");
        if (inv.status === "paid") throw new Error("Invoice already paid");
        inv.status = "paid";
        inv.paid_at = touch();
        inv.stripe_checkout_session_id = `demo_${nanoid()}`;
        inv.updated_at = touch();
      });
    } else if (isDataConfigured()) {
      const invoice = await getDocument(COLLECTIONS.invoices, invoiceId) as unknown as (Invoice) | null;
      if (!invoice) throw new Error("Invoice not found");
      if (invoice.status === "paid") throw new Error("Invoice already paid");
      await updateDocument(COLLECTIONS.invoices, invoiceId, {
        status: "paid",
        paid_at: new Date().toISOString(),
        stripe_checkout_session_id: `demo_${nanoid()}`,
        updated_at: new Date().toISOString(),
      });
    }
    revalidatePath("/portal/invoices");
    revalidatePath("/crm/invoices");
    return `${appUrl}/portal/invoices?paid=1`;
  }

  assertDbReady();
  const stripe = getStripe();
  const invoice = await getDocument(COLLECTIONS.invoices, invoiceId) as unknown as (Invoice) | null;
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "paid") throw new Error("Invoice already paid");
  const client = invoice.client_id
    ? await getDocument(COLLECTIONS.clients, invoice.client_id) as unknown as (Client) | null
    : null;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: client?.email || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: (invoice.currency || "USD").toLowerCase(),
          unit_amount: Math.round(Number(invoice.amount) * 100),
          product_data: {
            name: invoice.title,
            description: invoice.invoice_number,
          },
        },
      },
    ],
    metadata: { invoice_id: invoice.id },
    success_url: `${appUrl}/portal/invoices?paid=1`,
    cancel_url: `${appUrl}/portal/invoices/${invoice.id}`,
  });

  await updateDocument(COLLECTIONS.invoices, invoiceId, {
    stripe_checkout_session_id: session.id,
    status: invoice.status === "draft" ? "sent" : invoice.status,
    updated_at: new Date().toISOString(),
  });

  return session.url;
}

export async function createMaintenancePlan(formData: FormData) {
  await requireStaff();

  if (isDemoMode()) {
    mutateStore((store) => {
      const plan: MaintenancePlan = {
        id: newId("maint"),
        client_id: String(formData.get("client_id") || ""),
        name: String(formData.get("name") || "").trim(),
        monthly_amount: Number(formData.get("monthly_amount") || 0),
        notes: String(formData.get("notes") || "").trim() || null,
        status: "active",
        created_at: touch(),
        updated_at: touch(),
      };
      store.maintenance_plans.push(plan);
    });
    revalidatePath("/crm/clients");
    return;
  }

  assertDbReady();
  const now = new Date().toISOString();
  await createDocument(COLLECTIONS.maintenance_plans, {
    client_id: String(formData.get("client_id") || ""),
    name: String(formData.get("name") || "").trim(),
    monthly_amount: Number(formData.get("monthly_amount") || 0),
    notes: String(formData.get("notes") || "").trim() || null,
    status: "active",
    created_at: now,
    updated_at: now,
  });
  revalidatePath("/crm/clients");
}
