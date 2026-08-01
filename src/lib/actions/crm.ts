"use server";

import { requireOwner, requireStaff } from "@/lib/auth/roles";
import { recordAuditLog } from "@/lib/audit/log";
import {
  isDataConfigured,
  createDocument,
  updateDocument,
  updateDocuments,
  deleteDocument,
  deleteDocuments,
  getDocument,
  listDocuments,
  findByEmailIlike,
  COLLECTIONS,
} from "@/lib/db/repo";
import { isDemoMode } from "@/lib/demo/mode";
import { ensureDemoInvite } from "@/lib/demo/auth";
import { mutateStore, newId, touch } from "@/lib/demo/store";
import { allocateDemoProjectId, allocateProjectId } from "@/lib/projects/allocate-project-id";
import { isMissingClientInviteTable } from "@/lib/db/queries";
import { syncClerkRoleByEmail } from "@/lib/auth/clerk-role";
import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import type {
  Activity,
  ActivityType,
  Client,
  ClientInviteRequest,
  Deal,
  DealStage,
  DbUser,
  Lead,
  LeadStatus,
  Project,
  UserRole,
} from "@/lib/types";

function assertDbReady() {
  if (!isDataConfigured()) {
    throw new Error("Database is not configured. Add credentials to .env.local");
  }
}

function authorId(userId: string) {
  return userId === "local-dev-user" ? null : userId;
}

const MAX_LEAD_IMPORT = 500;

export async function importLeadsCsv(csvText: string, defaultSource?: string) {
  const user = await requireOwner();
  const text = String(csvText || "").trim();
  if (!text) throw new Error("Upload a CSV file with leads");

  const { parseLeadCsv } = await import("@/lib/leads/csv");
  const parsed = parseLeadCsv(text);
  if (parsed.rows.length === 0) {
    throw new Error(
      parsed.skipped.length
        ? `No valid leads found (${parsed.skipped.length} row(s) skipped)`
        : "No lead rows found in the CSV"
    );
  }
  if (parsed.rows.length > MAX_LEAD_IMPORT) {
    throw new Error(`CSV is too large — max ${MAX_LEAD_IMPORT} leads per upload`);
  }

  const sourceFallback = String(defaultSource || "").trim() || null;
  const now = new Date().toISOString();
  let created = 0;
  const errors: { index: number; message: string }[] = [];

  if (isDemoMode()) {
    mutateStore((store) => {
      for (const row of parsed.rows) {
        store.leads.push({
          id: newId("lead"),
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          phone: row.phone,
          company_name: row.company_name,
          source: row.source || sourceFallback,
          estimated_value: row.estimated_value,
          notes: row.notes,
          status: row.status,
          owner_id: user.id,
          converted_client_id: null,
          created_at: touch(),
          updated_at: touch(),
        });
        created += 1;
      }
    });
  } else {
    assertDbReady();
    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i];
      try {
        await createDocument(COLLECTIONS.leads, {
          first_name: row.first_name,
          last_name: row.last_name || "",
          email: row.email || "",
          phone: row.phone || "",
          company_name: row.company_name || "",
          source: row.source || sourceFallback || "",
          estimated_value: row.estimated_value,
          notes: row.notes || "",
          status: row.status,
          owner_id: authorId(user.id) || "",
          converted_client_id: "",
          created_at: now,
          updated_at: now,
        });
        created += 1;
      } catch (e) {
        errors.push({
          index: i + 2,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  revalidatePath("/crm/leads");
  await recordAuditLog({
    action: "lead.imported",
    actor: user,
    targetType: "lead",
    targetLabel: `${created} leads`,
    summary: `Imported ${created} lead(s) from CSV`,
    metadata: {
      created,
      skipped: parsed.skipped.length,
      failed: errors.length,
      defaultSource: sourceFallback,
    },
  });

  return {
    created,
    skipped: parsed.skipped,
    failed: errors,
  };
}

export async function createLead(formData: FormData) {
  // Both owner and sales reps can create leads
  const user = await requireStaff();
  if (user.role !== "owner" && user.role !== "sales") {
    throw new Error("Only owners and sales reps can add leads");
  }

  if (isDemoMode()) {
    mutateStore((store) => {
      const lead: Lead = {
        id: newId("lead"),
        first_name: String(formData.get("first_name") || "").trim(),
        last_name: String(formData.get("last_name") || "").trim() || null,
        email: String(formData.get("email") || "").trim() || null,
        phone: String(formData.get("phone") || "").trim() || null,
        company_name: String(formData.get("company_name") || "").trim() || null,
        source: String(formData.get("source") || "").trim() || null,
        estimated_value: Number(formData.get("estimated_value") || 0),
        notes: String(formData.get("notes") || "").trim() || null,
        status: "new",
        owner_id: user.id,
        converted_client_id: null,
        created_at: touch(),
        updated_at: touch(),
      };
      store.leads.push(lead);
    });
    revalidatePath("/crm/leads");
    return;
  }

  assertDbReady();
  const now = new Date().toISOString();
  await createDocument(COLLECTIONS.leads, {
    first_name: String(formData.get("first_name") || "").trim(),
    last_name: String(formData.get("last_name") || "").trim() || null,
    email: String(formData.get("email") || "").trim() || null,
    phone: String(formData.get("phone") || "").trim() || null,
    company_name: String(formData.get("company_name") || "").trim() || null,
    source: String(formData.get("source") || "").trim() || null,
    estimated_value: Number(formData.get("estimated_value") || 0),
    notes: String(formData.get("notes") || "").trim() || null,
    status: "new",
    owner_id: authorId(user.id),
    converted_client_id: null,
    created_at: now,
    updated_at: now,
  });
  revalidatePath("/crm/leads");
}

export async function updateLeadStatus(leadId: string, status: LeadStatus) {
  const user = await requireStaff();

  if (isDemoMode()) {
    mutateStore((store) => {
      const lead = store.leads.find((l) => l.id === leadId);
      if (!lead) throw new Error("Lead not found");
      lead.status = status;
      lead.updated_at = touch();
      store.activities.unshift({
        id: newId("act"),
        type: "status_change",
        body: `Lead status changed to ${status}`,
        lead_id: leadId,
        deal_id: null,
        client_id: null,
        project_id: null,
        author_id: user.id,
        created_at: touch(),
      });
    });
    revalidatePath("/crm/leads");
    revalidatePath(`/crm/leads/${leadId}`);
    return;
  }

  assertDbReady();
  const now = new Date().toISOString();
  await updateDocument(COLLECTIONS.leads, leadId, { status, updated_at: now });
  await createDocument(COLLECTIONS.activities, {
    type: "status_change" satisfies ActivityType,
    body: `Lead status changed to ${status}`,
    lead_id: leadId,
    deal_id: null,
    client_id: null,
    project_id: null,
    author_id: authorId(user.id),
    created_at: now,
  });
  revalidatePath("/crm/leads");
  revalidatePath(`/crm/leads/${leadId}`);
}

export async function updateLead(leadId: string, formData: FormData) {
  await requireStaff();
  const patch = {
    first_name: String(formData.get("first_name") || "").trim(),
    last_name: String(formData.get("last_name") || "").trim() || null,
    email: String(formData.get("email") || "").trim() || null,
    phone: String(formData.get("phone") || "").trim() || null,
    company_name: String(formData.get("company_name") || "").trim() || null,
    source: String(formData.get("source") || "").trim() || null,
    estimated_value: Number(formData.get("estimated_value") || 0),
    notes: String(formData.get("notes") || "").trim() || null,
  };

  if (isDemoMode()) {
    mutateStore((store) => {
      const lead = store.leads.find((l) => l.id === leadId);
      if (!lead) throw new Error("Lead not found");
      Object.assign(lead, patch, { updated_at: touch() });
    });
    revalidatePath(`/crm/leads/${leadId}`);
    revalidatePath("/crm/leads");
    return;
  }

  assertDbReady();
  await updateDocument(COLLECTIONS.leads, leadId, {
    ...patch,
    updated_at: new Date().toISOString(),
  });
  revalidatePath(`/crm/leads/${leadId}`);
  revalidatePath("/crm/leads");
}

export async function deleteLead(leadId: string) {
  await requireStaff();

  if (isDemoMode()) {
    mutateStore((store) => {
      store.leads = store.leads.filter((l) => l.id !== leadId);
      store.activities = store.activities.filter((a) => a.lead_id !== leadId);
      store.deals = store.deals.map((d) =>
        d.lead_id === leadId ? { ...d, lead_id: null, updated_at: touch() } : d
      );
    });
    revalidatePath("/crm/leads");
    return;
  }

  assertDbReady();
  // Clear lead link on deals first (FK may be SET NULL already)
  await deleteDocuments(COLLECTIONS.activities, { lead_id: leadId });
  await deleteDocument(COLLECTIONS.leads, leadId);
  revalidatePath("/crm/leads");
}

export async function createDealFromLead(leadId: string, formData: FormData) {
  const user = await requireStaff();

  if (isDemoMode()) {
    const dealId = mutateStore((store) => {
      const lead = store.leads.find((l) => l.id === leadId);
      if (!lead) throw new Error("Lead not found");
      const title =
        String(formData.get("title") || "").trim() ||
        `${lead.company_name || lead.first_name} — Website`;
      const deal: Deal = {
        id: newId("deal"),
        title,
        lead_id: leadId,
        client_id: null,
        amount: Number(formData.get("amount") || lead.estimated_value || 0),
        stage: "discovery",
        close_date: null,
        notes: String(formData.get("notes") || "").trim() || null,
        owner_id: user.id,
        created_at: touch(),
        updated_at: touch(),
      };
      store.deals.push(deal);
      lead.status = "proposal";
      lead.updated_at = touch();
      store.activities.unshift({
        id: newId("act"),
        type: "system",
        body: `Deal created: ${title}`,
        lead_id: leadId,
        deal_id: deal.id,
        client_id: null,
        project_id: null,
        author_id: user.id,
        created_at: touch(),
      });
      return deal.id;
    });
    revalidatePath("/crm/deals");
    revalidatePath(`/crm/leads/${leadId}`);
    return dealId;
  }

  assertDbReady();
  const now = new Date().toISOString();
  const lead = await getDocument(COLLECTIONS.leads, leadId) as unknown as (Lead) | null;
  if (!lead) throw new Error("Lead not found");
  const title =
    String(formData.get("title") || "").trim() ||
    `${lead.company_name || lead.first_name} — Website`;
  const deal = await createDocument(COLLECTIONS.deals, {
    title,
    lead_id: leadId,
    client_id: null,
    amount: Number(formData.get("amount") || lead.estimated_value || 0),
    stage: "discovery",
    close_date: null,
    notes: String(formData.get("notes") || "").trim() || null,
    owner_id: authorId(user.id),
    created_at: now,
    updated_at: now,
  }) as unknown as (Deal);
  await updateDocument(COLLECTIONS.leads, leadId, { status: "proposal", updated_at: now });
  await createDocument(COLLECTIONS.activities, {
    type: "system",
    body: `Deal created: ${title}`,
    lead_id: leadId,
    deal_id: deal.id,
    client_id: null,
    project_id: null,
    author_id: authorId(user.id),
    created_at: now,
  });
  revalidatePath("/crm/deals");
  revalidatePath(`/crm/leads/${leadId}`);
  return deal.id as string;
}

export async function updateDealStage(dealId: string, stage: DealStage) {
  const user = await requireStaff();

  if (isDemoMode()) {
    mutateStore((store) => {
      const deal = store.deals.find((d) => d.id === dealId);
      if (!deal) throw new Error("Deal not found");
      deal.stage = stage;
      deal.updated_at = touch();
      store.activities.unshift({
        id: newId("act"),
        type: "status_change",
        body: `Deal stage changed to ${stage}`,
        lead_id: null,
        deal_id: dealId,
        client_id: null,
        project_id: null,
        author_id: user.id,
        created_at: touch(),
      });
    });
    revalidatePath("/crm/deals");
    revalidatePath(`/crm/deals/${dealId}`);
    return;
  }

  assertDbReady();
  const now = new Date().toISOString();
  await updateDocument(COLLECTIONS.deals, dealId, { stage, updated_at: now });
  await createDocument(COLLECTIONS.activities, {
    type: "status_change",
    body: `Deal stage changed to ${stage}`,
    lead_id: null,
    deal_id: dealId,
    client_id: null,
    project_id: null,
    author_id: authorId(user.id),
    created_at: now,
  });
  revalidatePath("/crm/deals");
  revalidatePath(`/crm/deals/${dealId}`);
}

export async function createDeal(formData: FormData) {
  const user = await requireStaff();

  if (isDemoMode()) {
    mutateStore((store) => {
      store.deals.push({
        id: newId("deal"),
        title: String(formData.get("title") || "").trim(),
        amount: Number(formData.get("amount") || 0),
        stage: "discovery",
        close_date: String(formData.get("close_date") || "") || null,
        notes: String(formData.get("notes") || "").trim() || null,
        lead_id: String(formData.get("lead_id") || "") || null,
        client_id: null,
        owner_id: user.id,
        created_at: touch(),
        updated_at: touch(),
      });
    });
    revalidatePath("/crm/deals");
    return;
  }

  assertDbReady();
  const now = new Date().toISOString();
  await createDocument(COLLECTIONS.deals, {
    title: String(formData.get("title") || "").trim(),
    amount: Number(formData.get("amount") || 0),
    stage: "discovery",
    close_date: String(formData.get("close_date") || "") || null,
    notes: String(formData.get("notes") || "").trim() || null,
    lead_id: String(formData.get("lead_id") || "") || null,
    client_id: null,
    owner_id: authorId(user.id),
    created_at: now,
    updated_at: now,
  });
  revalidatePath("/crm/deals");
}

export async function convertWonDeal(dealId: string, formData: FormData) {
  const user = await requireStaff();

  if (isDemoMode()) {
    const result = mutateStore((store) => {
      const deal = store.deals.find((d) => d.id === dealId);
      if (!deal) throw new Error("Deal not found");
      const lead = deal.lead_id ? store.leads.find((l) => l.id === deal.lead_id) : null;
      const companyName =
        String(formData.get("client_name") || "").trim() ||
        lead?.company_name ||
        `${lead?.first_name || "New"} Client`;
      const email = String(formData.get("email") || "").trim() || lead?.email || null;
      const createProjectFlag = formData.get("create_project") === "on";
      const projectName =
        String(formData.get("project_name") || "").trim() || `${companyName} Website`;
      const inviteClient = formData.get("invite_client") === "on";

      const client: Client = {
        id: newId("client"),
        name: companyName,
        email,
        phone: lead?.phone || null,
        website: null,
        status: "active",
        primary_user_id: null,
        created_by: user.id,
        notes: `Converted from deal: ${deal.title}`,
        created_at: touch(),
        updated_at: touch(),
      };
      store.clients.push(client);
      deal.stage = "won";
      deal.client_id = client.id;
      deal.updated_at = touch();
      if (lead) {
        lead.status = "won";
        lead.converted_client_id = client.id;
        lead.updated_at = touch();
      }

      let projectId: string | null = null;
      if (createProjectFlag) {
        const project: Project = {
          id: allocateDemoProjectId(
            companyName,
            store.projects.map((p) => p.id)
          ),
          name: projectName,
          description: null,
          client_id: client.id,
          status: "discovery",
          progress: 10,
          start_date: null,
          target_launch_date: null,
          assigned_to: user.id,
          deal_id: dealId,
          created_by: user.id,
          created_at: touch(),
          updated_at: touch(),
        };
        store.projects.push(project);
        projectId = project.id;
      }

      store.activities.unshift({
        id: newId("act"),
        type: "system",
        body: `Deal won — client "${companyName}" created`,
        lead_id: null,
        deal_id: dealId,
        client_id: client.id,
        project_id: projectId,
        author_id: user.id,
        created_at: touch(),
      } satisfies Activity);

      return { clientId: client.id, projectId, email, inviteClient, companyName };
    });

    if (result.inviteClient && result.email) {
      const invited = await ensureDemoInvite(result.email, "client", result.companyName);
      mutateStore((store) => {
        const client = store.clients.find((c) => c.id === result.clientId);
        if (client) {
          client.primary_user_id = invited.id;
          client.updated_at = touch();
        }
      });
    }

    revalidatePath("/crm/deals");
    revalidatePath("/crm/clients");
    revalidatePath("/crm/projects");
    revalidatePath(`/crm/deals/${dealId}`);
    return { clientId: result.clientId, projectId: result.projectId };
  }

  assertDbReady();
  const now = new Date().toISOString();
  const deal = await getDocument(COLLECTIONS.deals, dealId) as unknown as (Deal) | null;
  if (!deal) throw new Error("Deal not found");
  const lead = deal.lead_id ? await getDocument(COLLECTIONS.leads, deal.lead_id) as unknown as (Lead) | null : null;

  const companyName =
    String(formData.get("client_name") || "").trim() ||
    lead?.company_name ||
    `${lead?.first_name || "New"} Client`;
  const email = String(formData.get("email") || "").trim() || lead?.email || null;
  const createProject = formData.get("create_project") === "on";
  const projectName =
    String(formData.get("project_name") || "").trim() || `${companyName} Website`;
  const inviteClient = formData.get("invite_client") === "on";

  if (inviteClient && email) {
    try {
      await sendRoleInvitation(email, "client");
    } catch (e) {
      console.error("Invite failed:", e);
    }
  }

  const clientRow = await createDocument(COLLECTIONS.clients, {
    name: companyName,
    email,
    phone: lead?.phone || null,
    website: null,
    status: "active",
    primary_user_id: null,
    created_by: authorId(user.id),
    notes: `Converted from deal: ${deal.title}`,
    created_at: now,
    updated_at: now,
  }) as unknown as (Client);

  await updateDocument(COLLECTIONS.deals, dealId, {
    stage: "won",
    client_id: clientRow.id,
    updated_at: now,
  });
  if (deal.lead_id) {
    await updateDocument(COLLECTIONS.leads, deal.lead_id, {
      status: "won",
      converted_client_id: clientRow.id,
      updated_at: now,
    });
  }

  let projectId: string | null = null;
  if (createProject) {
    const id = await allocateProjectId(companyName);
    const project = await createDocument(
      COLLECTIONS.projects,
      {
        name: projectName,
        description: null,
        client_id: clientRow.id,
        status: "discovery",
        progress: 10,
        start_date: null,
        target_launch_date: null,
        deal_id: dealId,
        assigned_to: authorId(user.id),
        created_by: authorId(user.id),
        created_at: now,
        updated_at: now,
      },
      id
    ) as unknown as (Project);
    projectId = project.id;
  }

  await createDocument(COLLECTIONS.activities, {
    type: "system",
    body: `Deal won — client "${companyName}" created`,
    lead_id: null,
    deal_id: dealId,
    client_id: clientRow.id,
    project_id: projectId,
    author_id: authorId(user.id),
    created_at: now,
  });

  revalidatePath("/crm/deals");
  revalidatePath("/crm/clients");
  revalidatePath("/crm/projects");
  revalidatePath(`/crm/deals/${dealId}`);
  return { clientId: clientRow.id as string, projectId };
}

export async function addActivity(formData: FormData) {
  const user = await requireStaff();

  if (isDemoMode()) {
    mutateStore((store) => {
      store.activities.unshift({
        id: newId("act"),
        type: (String(formData.get("type") || "note") as ActivityType) || "note",
        body: String(formData.get("body") || "").trim(),
        lead_id: String(formData.get("lead_id") || "") || null,
        deal_id: String(formData.get("deal_id") || "") || null,
        client_id: String(formData.get("client_id") || "") || null,
        project_id: String(formData.get("project_id") || "") || null,
        author_id: user.id,
        created_at: touch(),
      });
    });
    revalidatePath("/crm/leads");
    revalidatePath("/crm/deals");
    revalidatePath("/crm/clients");
    revalidatePath("/crm/projects");
    return;
  }

  assertDbReady();
  await createDocument(COLLECTIONS.activities, {
    type: (String(formData.get("type") || "note") as ActivityType) || "note",
    body: String(formData.get("body") || "").trim(),
    lead_id: String(formData.get("lead_id") || "") || null,
    deal_id: String(formData.get("deal_id") || "") || null,
    client_id: String(formData.get("client_id") || "") || null,
    project_id: String(formData.get("project_id") || "") || null,
    author_id: authorId(user.id),
    created_at: new Date().toISOString(),
  });
  revalidatePath("/crm/leads");
  revalidatePath("/crm/deals");
  revalidatePath("/crm/clients");
  revalidatePath("/crm/projects");
}

export async function createClient(formData: FormData) {
  const user = await requireStaff();

  if (isDemoMode()) {
    mutateStore((store) => {
      store.clients.push({
        id: newId("client"),
        name: String(formData.get("name") || "").trim(),
        email: String(formData.get("email") || "").trim() || null,
        phone: String(formData.get("phone") || "").trim() || null,
        website: String(formData.get("website") || "").trim() || null,
        notes: String(formData.get("notes") || "").trim() || null,
        status: "active",
        primary_user_id: null,
        created_by: user.id,
        created_at: touch(),
        updated_at: touch(),
      });
    });
    revalidatePath("/crm/clients");
    return;
  }

  assertDbReady();
  const now = new Date().toISOString();
  await createDocument(COLLECTIONS.clients, {
    name: String(formData.get("name") || "").trim(),
    email: String(formData.get("email") || "").trim() || null,
    phone: String(formData.get("phone") || "").trim() || null,
    website: String(formData.get("website") || "").trim() || null,
    notes: String(formData.get("notes") || "").trim() || null,
    status: "active",
    primary_user_id: null,
    created_by: authorId(user.id),
    created_at: now,
    updated_at: now,
  });
  revalidatePath("/crm/clients");
}

export async function terminateClient(clientId: string) {
  const owner = await requireOwner();
  if (!clientId) throw new Error("Client id is required");

  if (isDemoMode()) {
    const label = mutateStore((store) => {
      const client = store.clients.find((c) => c.id === clientId);
      if (!client) throw new Error("Client not found");
      if (client.status === "churned") throw new Error("Client is already terminated");
      client.status = "churned";
      client.updated_at = touch();
      for (const project of store.projects) {
        if (
          project.client_id === clientId &&
          project.status !== "completed" &&
          project.status !== "terminated"
        ) {
          project.status = "terminated";
          project.updated_at = touch();
        }
      }
      store.activities.unshift({
        id: newId("act"),
        type: "system",
        body: "Client terminated by owner",
        lead_id: null,
        deal_id: null,
        client_id: clientId,
        project_id: null,
        author_id: null,
        created_at: touch(),
      });
      return client.name;
    });
    revalidatePath("/crm/clients");
    revalidatePath(`/crm/clients/${clientId}`);
    revalidatePath("/crm/projects");
    await recordAuditLog({
      action: "client.terminated",
      actor: owner,
      targetType: "client",
      targetId: clientId,
      targetLabel: label,
      summary: `Terminated client ${label}`,
    });
    return;
  }

  assertDbReady();
  const now = new Date().toISOString();
  const client = await getDocument(COLLECTIONS.clients, clientId) as unknown as (Client) | null;
  if (!client) throw new Error("Client not found");
  if (client.status === "churned") throw new Error("Client is already terminated");

  await updateDocument(COLLECTIONS.clients, clientId, { status: "churned", updated_at: now });

  await updateDocuments(
    COLLECTIONS.projects,
    { client_id: clientId },
    { status: "terminated", updated_at: now },
    { notIn: { attr: "status", values: ["completed", "terminated"] } }
  );

  await createDocument(COLLECTIONS.activities, {
    type: "system",
    body: "Client terminated by owner",
    lead_id: null,
    deal_id: null,
    client_id: clientId,
    project_id: null,
    author_id: null,
    created_at: now,
  });

  revalidatePath("/crm/clients");
  revalidatePath(`/crm/clients/${clientId}`);
  revalidatePath("/crm/projects");
  await recordAuditLog({
    action: "client.terminated",
    actor: owner,
    targetType: "client",
    targetId: clientId,
    targetLabel: client.name,
    summary: `Terminated client ${client.name}`,
  });
}

export async function reactivateClient(clientId: string) {
  const owner = await requireOwner();
  if (!clientId) throw new Error("Client id is required");

  if (isDemoMode()) {
    const label = mutateStore((store) => {
      const client = store.clients.find((c) => c.id === clientId);
      if (!client) throw new Error("Client not found");
      client.status = "active";
      client.updated_at = touch();
      store.activities.unshift({
        id: newId("act"),
        type: "system",
        body: "Client reactivated by owner",
        lead_id: null,
        deal_id: null,
        client_id: clientId,
        project_id: null,
        author_id: null,
        created_at: touch(),
      });
      return client.name;
    });
    revalidatePath("/crm/clients");
    revalidatePath(`/crm/clients/${clientId}`);
    await recordAuditLog({
      action: "client.reactivated",
      actor: owner,
      targetType: "client",
      targetId: clientId,
      targetLabel: label,
      summary: `Reactivated client ${label}`,
    });
    return;
  }

  assertDbReady();
  const now = new Date().toISOString();
  const client = await getDocument(COLLECTIONS.clients, clientId) as unknown as (Client) | null;
  await updateDocument(COLLECTIONS.clients, clientId, { status: "active", updated_at: now });

  await createDocument(COLLECTIONS.activities, {
    type: "system",
    body: "Client reactivated by owner",
    lead_id: null,
    deal_id: null,
    client_id: clientId,
    project_id: null,
    author_id: null,
    created_at: now,
  });

  revalidatePath("/crm/clients");
  revalidatePath(`/crm/clients/${clientId}`);
  await recordAuditLog({
    action: "client.reactivated",
    actor: owner,
    targetType: "client",
    targetId: clientId,
    targetLabel: client?.name ?? clientId,
    summary: `Reactivated client ${client?.name ?? clientId}`,
  });
}

export async function inviteTeamMember(formData: FormData) {
  const owner = await requireOwner();
  const email = String(formData.get("email") || "").trim();
  const role = String(formData.get("role") || "sales") as UserRole;
  if (!email) throw new Error("Email is required");
  if (role !== "sales" && role !== "client" && role !== "owner") {
    throw new Error("Invalid role");
  }

  try {
    await sendRoleInvitation(email, role);
  } catch (e) {
    // Ensure production surfaces a readable message (not a digest-only RSC error)
    throw new Error(e instanceof Error ? e.message : formatClerkInviteError(e));
  }
  revalidatePath("/crm/team");
  await recordAuditLog({
    action: "member.invited",
    actor: owner,
    targetType: "user",
    targetLabel: email,
    summary: `Invited ${email} as ${role}`,
    metadata: { email, role },
  });
}

async function sendRoleInvitation(email: string, role: UserRole) {
  if (isDemoMode()) {
    await ensureDemoInvite(email, role);
    return;
  }

  const client = await clerkClient();
  const normalized = email.trim().toLowerCase();

  // If they already have an account, update their role instead of inviting again
  const { data: existingUsers } = await client.users.getUserList({
    emailAddress: [normalized],
  });
  if (existingUsers.length > 0) {
    await Promise.all(
      existingUsers.map((user) =>
        client.users.updateUserMetadata(user.id, {
          publicMetadata: { role },
        })
      )
    );
    if (isDataConfigured()) {
      const existing = await findByEmailIlike(COLLECTIONS.users, normalized) as unknown as (DbUser) | null;
      if (existing) {
        await updateDocument(COLLECTIONS.users, existing.id, {
          role,
          updated_at: new Date().toISOString(),
        });
      }
    }
    return;
  }

  // Revoke any pending invite for this email so a fresh email can be sent.
  // Also pass ignoreExisting below — Clerk blocks re-invites when older
  // accepted/revoked invites exist (error text often says "pending" incorrectly).
  try {
    const clientInvites = await clerkClient();
    const pages = await Promise.all([
      clientInvites.invitations.getInvitationList({
        query: normalized,
        limit: 100,
      }),
      clientInvites.invitations.getInvitationList({
        status: "pending",
        limit: 100,
      }),
    ]);
    const seen = new Set<string>();
    const toRevoke = pages
      .flatMap((p) => p.data)
      .filter((inv) => {
        if (seen.has(inv.id)) return false;
        seen.add(inv.id);
        return (
          inv.emailAddress.toLowerCase() === normalized && inv.status === "pending"
        );
      });
    await Promise.all(
      toRevoke.map((inv) => clientInvites.invitations.revokeInvitation(inv.id))
    );
  } catch (e) {
    console.warn("Could not revoke prior invitations:", e);
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );

  try {
    await client.invitations.createInvitation({
      emailAddress: normalized,
      publicMetadata: { role },
      notify: true,
      ignoreExisting: true,
      // Land on SignUp; after accept, SignUp forceRedirectUrl → /post-auth
      // which sends sales → onboarding and clients → portal.
      redirectUrl: `${appUrl}/sign-up`,
    });
  } catch (e) {
    throw new Error(formatClerkInviteError(e));
  }

  try {
    await syncClerkRoleByEmail(normalized, role);
  } catch (e) {
    console.warn("Could not sync Clerk role for existing user:", e);
  }

  if (isDataConfigured()) {
    const existing = await findByEmailIlike(COLLECTIONS.users, normalized) as unknown as (DbUser) | null;
    if (existing) {
      await updateDocument(COLLECTIONS.users, existing.id, {
        role,
        updated_at: new Date().toISOString(),
      });
    }
  }
}

function formatClerkInviteError(error: unknown): string {
  if (!error || typeof error !== "object") return "Failed to send invitation";
  const err = error as {
    message?: string;
    errors?: { message?: string; long_message?: string; code?: string }[];
    status?: number;
  };
  const first = err.errors?.[0];
  const code = first?.code;
  const detail = first?.long_message || first?.message || err.message;
  if (code === "dev_monthly_email_limit_exceeded") {
    return (
      "Clerk development email limit reached. Use a +clerk_test address " +
      "(see https://clerk.com/docs/guides/development/testing/test-emails) or wait for the monthly reset."
    );
  }
  if (code === "duplicate_record") {
    return (
      "Clerk still has an old invitation for this email. Try again — we now force a resend. " +
      "If it keeps failing, revoke invites for this email in Clerk → Users → Invitations."
    );
  }
  return detail || "Failed to send invitation";
}

export async function requestClientInvite(formData: FormData) {
  const user = await requireStaff();
  if (user.role !== "sales") {
    throw new Error("Only sales reps can request client invites");
  }

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const clientName = String(formData.get("client_name") || "").trim() || null;
  const note = String(formData.get("note") || "").trim() || null;
  if (!email) throw new Error("Email is required");

  if (isDemoMode()) {
    mutateStore((store) => {
      const duplicate = store.client_invite_requests.find(
        (r) => r.email.toLowerCase() === email && r.status === "pending"
      );
      if (duplicate) throw new Error("A pending request already exists for this email");

      store.client_invite_requests.unshift({
        id: newId("invite-req"),
        email,
        client_name: clientName,
        note,
        status: "pending",
        requested_by: user.id,
        reviewed_by: null,
        reviewed_at: null,
        review_note: null,
        created_at: touch(),
        updated_at: touch(),
      });
    });
    revalidatePath("/crm/team");
    await recordAuditLog({
      action: "client_invite.requested",
      actor: user,
      targetType: "invite_request",
      targetLabel: email,
      summary: `Requested client invite for ${email}`,
      metadata: { email, clientName },
    });
    return;
  }

  assertDbReady();
  const now = new Date().toISOString();
  try {
    const pending = await listDocuments(COLLECTIONS.client_invite_requests, {
      equal: { status: "pending" },
    }) as unknown as (ClientInviteRequest)[];
    const existing = pending.find((r) => r.email.toLowerCase() === email);
    if (existing) throw new Error("A pending request already exists for this email");
  } catch (e) {
    if (e instanceof Error && e.message === "A pending request already exists for this email") {
      throw e;
    }
    const error = { message: e instanceof Error ? e.message : String(e) };
    if (isMissingClientInviteTable(error)) {
      throw new Error(
        "Database setup incomplete. Run supabase/migrations/003_client_invite_requests.sql (or create the Appwrite client_invite_requests collection), then try again."
      );
    }
    throw e;
  }

  try {
    await createDocument(COLLECTIONS.client_invite_requests, {
      email,
      client_name: clientName,
      note,
      status: "pending",
      requested_by: authorId(user.id),
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
      created_at: now,
      updated_at: now,
    });
  } catch (e) {
    const error = { message: e instanceof Error ? e.message : String(e) };
    if (isMissingClientInviteTable(error)) {
      throw new Error(
        "Database setup incomplete. Run supabase/migrations/003_client_invite_requests.sql (or create the Appwrite client_invite_requests collection), then try again."
      );
    }
    throw e;
  }
  revalidatePath("/crm/team");
  await recordAuditLog({
    action: "client_invite.requested",
    actor: user,
    targetType: "invite_request",
    targetLabel: email,
    summary: `Requested client invite for ${email}`,
    metadata: { email, clientName },
  });
}

export async function approveClientInviteRequest(requestId: string) {
  const owner = await requireOwner();

  if (isDemoMode()) {
    const email = mutateStore((store) => {
      const row = store.client_invite_requests.find((r) => r.id === requestId);
      if (!row) throw new Error("Request not found");
      if (row.status !== "pending") throw new Error("Request is no longer pending");
      row.status = "approved";
      row.reviewed_by = owner.id;
      row.reviewed_at = touch();
      row.updated_at = touch();
      return row.email;
    });
    await sendRoleInvitation(email, "client");
    revalidatePath("/crm/team");
    await recordAuditLog({
      action: "client_invite.approved",
      actor: owner,
      targetType: "invite_request",
      targetId: requestId,
      targetLabel: email,
      summary: `Approved client invite for ${email}`,
    });
    return;
  }

  assertDbReady();
  const row = await getDocument(COLLECTIONS.client_invite_requests, requestId) as unknown as (ClientInviteRequest) | null;
  if (!row) throw new Error("Request not found");
  if (row.status !== "pending") throw new Error("Request is no longer pending");

  await sendRoleInvitation(row.email, "client");

  await updateDocument(COLLECTIONS.client_invite_requests, requestId, {
    status: "approved",
    reviewed_by: authorId(owner.id),
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  revalidatePath("/crm/team");
  await recordAuditLog({
    action: "client_invite.approved",
    actor: owner,
    targetType: "invite_request",
    targetId: requestId,
    targetLabel: row.email,
    summary: `Approved client invite for ${row.email}`,
  });
}

export async function rejectClientInviteRequest(requestId: string, reviewNote?: string) {
  const owner = await requireOwner();

  if (isDemoMode()) {
    const email = mutateStore((store) => {
      const row = store.client_invite_requests.find((r) => r.id === requestId);
      if (!row) throw new Error("Request not found");
      if (row.status !== "pending") throw new Error("Request is no longer pending");
      row.status = "rejected";
      row.reviewed_by = owner.id;
      row.reviewed_at = touch();
      row.review_note = reviewNote?.trim() || null;
      row.updated_at = touch();
      return row.email;
    });
    revalidatePath("/crm/team");
    await recordAuditLog({
      action: "client_invite.rejected",
      actor: owner,
      targetType: "invite_request",
      targetId: requestId,
      targetLabel: email,
      summary: `Rejected client invite for ${email}`,
      metadata: { reviewNote: reviewNote?.trim() || null },
    });
    return;
  }

  assertDbReady();
  const row = await getDocument(COLLECTIONS.client_invite_requests, requestId) as unknown as (ClientInviteRequest) | null;
  if (!row) throw new Error("Request not found");
  if (row.status !== "pending") throw new Error("Request is no longer pending");

  await updateDocument(COLLECTIONS.client_invite_requests, requestId, {
    status: "rejected",
    reviewed_by: authorId(owner.id),
    reviewed_at: new Date().toISOString(),
    review_note: reviewNote?.trim() || null,
    updated_at: new Date().toISOString(),
  });
  revalidatePath("/crm/team");
  await recordAuditLog({
    action: "client_invite.rejected",
    actor: owner,
    targetType: "invite_request",
    targetId: requestId,
    targetLabel: row.email,
    summary: `Rejected client invite for ${row.email}`,
    metadata: { reviewNote: reviewNote?.trim() || null },
  });
}