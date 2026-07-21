"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import Stripe from "stripe";
import { requireClient, requireInvoiceAccess, requireContractAccess, requireStaff } from "@/lib/auth/roles";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/db/supabase";
import { isDemoMode, isStripeConfigured } from "@/lib/demo/mode";
import { mutateStore, newId, touch } from "@/lib/demo/store";
import type { Contract, Invoice, MaintenancePlan } from "@/lib/types";
import { nanoid } from "nanoid";
import fs from "fs";
import path from "path";

function requireDb() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured. Add credentials to .env.local");
  }
  return getSupabaseAdmin();
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

  const supabase = requireDb();
  if (file && file.size > 0) {
    const storagePath = `${nanoid()}.${file.name.split(".").pop() || "pdf"}`;
    const { error: uploadError } = await supabase.storage
      .from("contracts")
      .upload(storagePath, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) {
      throw new Error(
        `Upload failed: ${uploadError.message}. Create a Storage bucket named "contracts".`
      );
    }
    fileUrl = supabase.storage.from("contracts").getPublicUrl(storagePath).data.publicUrl;
    fileName = file.name;
  }

  const { error } = await supabase.from("contracts").insert({
    title: String(formData.get("title") || "").trim(),
    client_id: String(formData.get("client_id") || ""),
    project_id: String(formData.get("project_id") || "") || null,
    file_url: fileUrl,
    file_name: fileName,
    status: "draft",
    created_by: user.id === "local-dev-user" ? null : user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/crm/contracts");
}

export async function sendContract(contractId: string) {
  await requireContractAccess();

  if (isDemoMode()) {
    mutateStore((store) => {
      const c = store.contracts.find((x) => x.id === contractId);
      if (!c) throw new Error("Contract not found");
      c.status = "sent";
      c.sent_at = touch();
      c.updated_at = touch();
    });
    revalidatePath("/crm/contracts");
    revalidatePath("/portal/contracts");
    return;
  }

  const supabase = requireDb();
  const { error } = await supabase
    .from("contracts")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", contractId);
  if (error) throw new Error(error.message);
  revalidatePath("/crm/contracts");
  revalidatePath("/portal/contracts");
}

export async function signContract(contractId: string, signatureData: string) {
  await requireClient();
  const hdrs = await headers();

  if (isDemoMode()) {
    mutateStore((store) => {
      const c = store.contracts.find((x) => x.id === contractId);
      if (!c) throw new Error("Contract not found");
      c.status = "signed";
      c.signed_at = touch();
      c.signature_data = { signature: signatureData, typedAt: touch() };
      c.signer_ip = hdrs.get("x-forwarded-for") || "127.0.0.1";
      c.signer_user_agent = hdrs.get("user-agent");
      c.updated_at = touch();
    });
    revalidatePath("/portal/contracts");
    revalidatePath(`/portal/contracts/${contractId}`);
    revalidatePath("/crm/contracts");
    return;
  }

  const supabase = requireDb();
  const { data: contract } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", contractId)
    .single();
  if (!contract) throw new Error("Contract not found");

  const { error } = await supabase
    .from("contracts")
    .update({
      status: "signed",
      signed_at: new Date().toISOString(),
      signature_data: { signature: signatureData, typedAt: new Date().toISOString() },
      signer_ip: hdrs.get("x-forwarded-for") || hdrs.get("x-real-ip"),
      signer_user_agent: hdrs.get("user-agent"),
    })
    .eq("id", contractId);
  if (error) throw new Error(error.message);
  revalidatePath("/portal/contracts");
  revalidatePath(`/portal/contracts/${contractId}`);
  revalidatePath("/crm/contracts");
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
    return;
  }

  const supabase = requireDb();
  const { error } = await supabase.from("invoices").insert({
    invoice_number: invoiceNumber,
    title: String(formData.get("title") || "").trim(),
    description: String(formData.get("description") || "").trim() || null,
    client_id: String(formData.get("client_id") || ""),
    project_id: String(formData.get("project_id") || "") || null,
    amount: Number(formData.get("amount") || 0),
    currency: String(formData.get("currency") || "USD"),
    due_date: String(formData.get("due_date") || "") || null,
    status: "draft",
    created_by: user.id === "local-dev-user" ? null : user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/crm/invoices");
}

export async function sendInvoice(invoiceId: string) {
  await requireInvoiceAccess();

  if (isDemoMode()) {
    mutateStore((store) => {
      const inv = store.invoices.find((i) => i.id === invoiceId);
      if (!inv) throw new Error("Invoice not found");
      inv.status = "sent";
      inv.updated_at = touch();
    });
    revalidatePath("/crm/invoices");
    revalidatePath("/portal/invoices");
    return;
  }

  const supabase = requireDb();
  const { error } = await supabase
    .from("invoices")
    .update({ status: "sent" })
    .eq("id", invoiceId);
  if (error) throw new Error(error.message);
  revalidatePath("/crm/invoices");
  revalidatePath("/portal/invoices");
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
    } else if (isSupabaseConfigured()) {
      const supabase = requireDb();
      const { data: invoice } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();
      if (!invoice) throw new Error("Invoice not found");
      if (invoice.status === "paid") throw new Error("Invoice already paid");
      await supabase
        .from("invoices")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          stripe_checkout_session_id: `demo_${nanoid()}`,
        })
        .eq("id", invoiceId);
    }
    revalidatePath("/portal/invoices");
    revalidatePath("/crm/invoices");
    return `${appUrl}/portal/invoices?paid=1`;
  }

  const supabase = requireDb();
  const stripe = getStripe();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, client:clients(*)")
    .eq("id", invoiceId)
    .single();
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "paid") throw new Error("Invoice already paid");

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: invoice.client?.email || undefined,
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

  await supabase
    .from("invoices")
    .update({
      stripe_checkout_session_id: session.id,
      status: invoice.status === "draft" ? "sent" : invoice.status,
    })
    .eq("id", invoiceId);

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

  const supabase = requireDb();
  const { error } = await supabase.from("maintenance_plans").insert({
    client_id: String(formData.get("client_id") || ""),
    name: String(formData.get("name") || "").trim(),
    monthly_amount: Number(formData.get("monthly_amount") || 0),
    notes: String(formData.get("notes") || "").trim() || null,
    status: "active",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/crm/clients");
}
