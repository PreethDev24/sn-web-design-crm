"use server";

import { requireOwner, requireStaff } from "@/lib/auth/roles";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/db/supabase";
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
  Deal,
  DealStage,
  Lead,
  LeadStatus,
  Project,
  UserRole,
} from "@/lib/types";

function requireDb() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured. Add credentials to .env.local");
  }
  return getSupabaseAdmin();
}

function authorId(userId: string) {
  return userId === "local-dev-user" ? null : userId;
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

  const supabase = requireDb();
  const { error } = await supabase.from("leads").insert({
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
  });
  if (error) throw new Error(error.message);
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

  const supabase = requireDb();
  const { error } = await supabase.from("leads").update({ status }).eq("id", leadId);
  if (error) throw new Error(error.message);
  await supabase.from("activities").insert({
    type: "status_change" satisfies ActivityType,
    body: `Lead status changed to ${status}`,
    lead_id: leadId,
    author_id: authorId(user.id),
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

  const supabase = requireDb();
  const { error } = await supabase.from("leads").update(patch).eq("id", leadId);
  if (error) throw new Error(error.message);
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

  const supabase = requireDb();
  // Clear lead link on deals first (FK may be SET NULL already)
  await supabase.from("activities").delete().eq("lead_id", leadId);
  const { error } = await supabase.from("leads").delete().eq("id", leadId);
  if (error) throw new Error(error.message);
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

  const supabase = requireDb();
  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).single();
  if (!lead) throw new Error("Lead not found");
  const title =
    String(formData.get("title") || "").trim() ||
    `${lead.company_name || lead.first_name} — Website`;
  const { data: deal, error } = await supabase
    .from("deals")
    .insert({
      title,
      lead_id: leadId,
      amount: Number(formData.get("amount") || lead.estimated_value || 0),
      stage: "discovery",
      notes: String(formData.get("notes") || "").trim() || null,
      owner_id: authorId(user.id),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await supabase.from("leads").update({ status: "proposal" }).eq("id", leadId);
  await supabase.from("activities").insert({
    type: "system",
    body: `Deal created: ${title}`,
    lead_id: leadId,
    deal_id: deal.id,
    author_id: authorId(user.id),
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

  const supabase = requireDb();
  const { error } = await supabase.from("deals").update({ stage }).eq("id", dealId);
  if (error) throw new Error(error.message);
  await supabase.from("activities").insert({
    type: "status_change",
    body: `Deal stage changed to ${stage}`,
    deal_id: dealId,
    author_id: authorId(user.id),
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

  const supabase = requireDb();
  const { error } = await supabase.from("deals").insert({
    title: String(formData.get("title") || "").trim(),
    amount: Number(formData.get("amount") || 0),
    stage: "discovery",
    close_date: String(formData.get("close_date") || "") || null,
    notes: String(formData.get("notes") || "").trim() || null,
    lead_id: String(formData.get("lead_id") || "") || null,
    owner_id: authorId(user.id),
  });
  if (error) throw new Error(error.message);
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

  const supabase = requireDb();
  const { data: deal } = await supabase
    .from("deals")
    .select("*, lead:leads(*)")
    .eq("id", dealId)
    .single();
  if (!deal) throw new Error("Deal not found");

  const companyName =
    String(formData.get("client_name") || "").trim() ||
    deal.lead?.company_name ||
    `${deal.lead?.first_name || "New"} Client`;
  const email = String(formData.get("email") || "").trim() || deal.lead?.email || null;
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

  const { data: clientRow, error: clientError } = await supabase
    .from("clients")
    .insert({
      name: companyName,
      email,
      phone: deal.lead?.phone || null,
      status: "active",
      primary_user_id: null,
      created_by: authorId(user.id),
      notes: `Converted from deal: ${deal.title}`,
    })
    .select("*")
    .single();
  if (clientError) throw new Error(clientError.message);

  await supabase.from("deals").update({ stage: "won", client_id: clientRow.id }).eq("id", dealId);
  if (deal.lead_id) {
    await supabase
      .from("leads")
      .update({ status: "won", converted_client_id: clientRow.id })
      .eq("id", deal.lead_id);
  }

  let projectId: string | null = null;
  if (createProject) {
    const id = await allocateProjectId(supabase, companyName);
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        id,
        name: projectName,
        client_id: clientRow.id,
        status: "discovery",
        deal_id: dealId,
        assigned_to: authorId(user.id),
        created_by: authorId(user.id),
      })
      .select("*")
      .single();
    if (projectError) throw new Error(projectError.message);
    projectId = project.id;
  }

  await supabase.from("activities").insert({
    type: "system",
    body: `Deal won — client "${companyName}" created`,
    deal_id: dealId,
    client_id: clientRow.id,
    project_id: projectId,
    author_id: authorId(user.id),
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

  const supabase = requireDb();
  const { error } = await supabase.from("activities").insert({
    type: (String(formData.get("type") || "note") as ActivityType) || "note",
    body: String(formData.get("body") || "").trim(),
    lead_id: String(formData.get("lead_id") || "") || null,
    deal_id: String(formData.get("deal_id") || "") || null,
    client_id: String(formData.get("client_id") || "") || null,
    project_id: String(formData.get("project_id") || "") || null,
    author_id: authorId(user.id),
  });
  if (error) throw new Error(error.message);
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

  const supabase = requireDb();
  const { error } = await supabase.from("clients").insert({
    name: String(formData.get("name") || "").trim(),
    email: String(formData.get("email") || "").trim() || null,
    phone: String(formData.get("phone") || "").trim() || null,
    website: String(formData.get("website") || "").trim() || null,
    notes: String(formData.get("notes") || "").trim() || null,
    status: "active",
    created_by: authorId(user.id),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/crm/clients");
}

export async function inviteTeamMember(formData: FormData) {
  await requireOwner();
  const email = String(formData.get("email") || "").trim();
  const role = String(formData.get("role") || "sales") as UserRole;
  if (!email) throw new Error("Email is required");
  if (role !== "sales" && role !== "client" && role !== "owner") {
    throw new Error("Invalid role");
  }

  await sendRoleInvitation(email, role);
  revalidatePath("/crm/team");
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
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseAdmin();
      await supabase.from("users").update({ role }).ilike("email", normalized);
    }
    return;
  }

  try {
    await client.invitations.createInvitation({
      emailAddress: normalized,
      publicMetadata: { role },
      // Clerk returns 400 if this email was invited before (even accepted). Allow resend.
      ignoreExisting: true,
      redirectUrl:
        role === "client"
          ? `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/portal/dashboard`
          : `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/crm/dashboard`,
    });
  } catch (e) {
    throw new Error(formatClerkInviteError(e));
  }

  try {
    await syncClerkRoleByEmail(normalized, role);
  } catch (e) {
    console.warn("Could not sync Clerk role for existing user:", e);
  }

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    await supabase.from("users").update({ role }).ilike("email", normalized);
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
  const detail = first?.long_message || first?.message || err.message;
  if (first?.code === "duplicate_record") {
    return (
      detail ||
      "This email already has an invitation. Check Clerk → Users → Invitations, or ask them to check their inbox."
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
    return;
  }

  const supabase = requireDb();
  const { data: existing, error: existingError } = await supabase
    .from("client_invite_requests")
    .select("id")
    .eq("status", "pending")
    .ilike("email", email)
    .maybeSingle();
  if (existingError) {
    if (isMissingClientInviteTable(existingError)) {
      throw new Error(
        "Database setup incomplete. Run supabase/migrations/003_client_invite_requests.sql in the Supabase SQL Editor, then try again."
      );
    }
    throw new Error(existingError.message);
  }
  if (existing) throw new Error("A pending request already exists for this email");

  const { error } = await supabase.from("client_invite_requests").insert({
    email,
    client_name: clientName,
    note,
    status: "pending",
    requested_by: authorId(user.id),
  });
  if (error) {
    if (isMissingClientInviteTable(error)) {
      throw new Error(
        "Database setup incomplete. Run supabase/migrations/003_client_invite_requests.sql in the Supabase SQL Editor, then try again."
      );
    }
    throw new Error(error.message);
  }
  revalidatePath("/crm/team");
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
    return;
  }

  const supabase = requireDb();
  const { data: row, error: fetchError } = await supabase
    .from("client_invite_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!row) throw new Error("Request not found");
  if (row.status !== "pending") throw new Error("Request is no longer pending");

  await sendRoleInvitation(row.email, "client");

  const { error } = await supabase
    .from("client_invite_requests")
    .update({
      status: "approved",
      reviewed_by: authorId(owner.id),
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (error) throw new Error(error.message);
  revalidatePath("/crm/team");
}

export async function rejectClientInviteRequest(requestId: string, reviewNote?: string) {
  const owner = await requireOwner();

  if (isDemoMode()) {
    mutateStore((store) => {
      const row = store.client_invite_requests.find((r) => r.id === requestId);
      if (!row) throw new Error("Request not found");
      if (row.status !== "pending") throw new Error("Request is no longer pending");
      row.status = "rejected";
      row.reviewed_by = owner.id;
      row.reviewed_at = touch();
      row.review_note = reviewNote?.trim() || null;
      row.updated_at = touch();
    });
    revalidatePath("/crm/team");
    return;
  }

  const supabase = requireDb();
  const { data: row, error: fetchError } = await supabase
    .from("client_invite_requests")
    .select("id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);
  if (!row) throw new Error("Request not found");
  if (row.status !== "pending") throw new Error("Request is no longer pending");

  const { error } = await supabase
    .from("client_invite_requests")
    .update({
      status: "rejected",
      reviewed_by: authorId(owner.id),
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote?.trim() || null,
    })
    .eq("id", requestId);
  if (error) throw new Error(error.message);
  revalidatePath("/crm/team");
}
