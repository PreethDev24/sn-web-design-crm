import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/db/supabase";
import { isDemoMode } from "@/lib/demo/mode";
import { readStore } from "@/lib/demo/store";
import { canAccessInvoices } from "@/lib/auth/roles-shared";
import type {
  Activity,
  ChatPartnerOption,
  Client,
  ClientInviteRequest,
  Contract,
  Conversation,
  DbUser,
  Deal,
  Deliverable,
  Feedback,
  Invoice,
  Lead,
  Message,
  Project,
  SalesProfile,
  UserRole,
} from "@/lib/types";
import {
  canChatRoles,
  chatPartnerRolesFor,
  orderedParticipantIds,
} from "@/lib/chat/permissions";

function emptyResult<T>(): T[] {
  return [];
}

function withOwner(lead: Lead, users: DbUser[]): Lead {
  return { ...lead, owner: users.find((u) => u.id === lead.owner_id) ?? null };
}

function withDealRels(deal: Deal, store: ReturnType<typeof readStore>): Deal {
  return {
    ...deal,
    owner: store.users.find((u) => u.id === deal.owner_id) ?? null,
    lead: store.leads.find((l) => l.id === deal.lead_id) ?? null,
  };
}

function withProjectClient(project: Project, clients: Client[]): Project {
  return { ...project, client: clients.find((c) => c.id === project.client_id) ?? null };
}

function withContractClient(contract: Contract, clients: Client[]): Contract {
  return { ...contract, client: clients.find((c) => c.id === contract.client_id) ?? null };
}

function withInvoiceClient(invoice: Invoice, clients: Client[]): Invoice {
  return { ...invoice, client: clients.find((c) => c.id === invoice.client_id) ?? null };
}

function withFeedbackAuthor(item: Feedback, users: DbUser[]): Feedback {
  return { ...item, author: users.find((u) => u.id === item.author_id) ?? null };
}

function withActivityAuthor(item: Activity, users: DbUser[]): Activity {
  return { ...item, author: users.find((u) => u.id === item.author_id) ?? null };
}

export async function listLeads(_viewer: DbUser): Promise<Lead[]> {
  // Owner and sales both access the shared leads pipeline; sales can add leads too.
  if (isDemoMode()) {
    const store = readStore();
    const leads = store.leads.map((l) => withOwner(l, store.users));
    return leads.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  if (!isSupabaseConfigured()) return emptyResult();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("leads")
    .select("*, owner:users!owner_id(*)")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Lead[];
}

export async function getLead(id: string, _viewer: DbUser): Promise<Lead | null> {
  if (isDemoMode()) {
    const store = readStore();
    const lead = store.leads.find((l) => l.id === id);
    if (!lead) return null;
    return withOwner(lead, store.users);
  }
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("leads")
    .select("*, owner:users!owner_id(*)")
    .eq("id", id)
    .maybeSingle();
  return data as Lead | null;
}

export async function listDeals(viewer: DbUser): Promise<Deal[]> {
  if (isDemoMode()) {
    const store = readStore();
    const deals = store.deals.map((d) => withDealRels(d, store));
    return deals.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  if (!isSupabaseConfigured()) return emptyResult();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("deals")
    .select("*, owner:users!owner_id(*), lead:leads(*)")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Deal[];
}

export async function getDeal(id: string, _viewer: DbUser): Promise<Deal | null> {
  if (isDemoMode()) {
    const store = readStore();
    const deal = store.deals.find((d) => d.id === id);
    if (!deal) return null;
    return withDealRels(deal, store);
  }
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("deals")
    .select("*, owner:users!owner_id(*), lead:leads(*)")
    .eq("id", id)
    .maybeSingle();
  return data as Deal | null;
}

export async function listClients(_viewer: DbUser): Promise<Client[]> {
  if (isDemoMode()) {
    const store = readStore();
    const clients = [...store.clients];
    return clients.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  if (!isSupabaseConfigured()) return emptyResult();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("clients").select("*").order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Client[];
}

export async function getClient(id: string): Promise<Client | null> {
  if (isDemoMode()) {
    return readStore().clients.find((c) => c.id === id) ?? null;
  }
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabaseAdmin().from("clients").select("*").eq("id", id).maybeSingle();
  return data as Client | null;
}

export async function getClientForUser(userId: string): Promise<Client | null> {
  if (isDemoMode()) {
    return readStore().clients.find((c) => c.primary_user_id === userId) ?? null;
  }
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabaseAdmin()
    .from("clients")
    .select("*")
    .eq("primary_user_id", userId)
    .maybeSingle();
  return data as Client | null;
}

export async function listProjects(_viewer: DbUser): Promise<Project[]> {
  if (isDemoMode()) {
    const store = readStore();
    const projects = store.projects.map((p) => withProjectClient(p, store.clients));
    return projects.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  if (!isSupabaseConfigured()) return emptyResult();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("projects")
    .select("*, client:clients(*)")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Project[];
}

export async function getProject(id: string): Promise<Project | null> {
  if (isDemoMode()) {
    const store = readStore();
    const project = store.projects.find((p) => p.id === id);
    if (!project) return null;
    return withProjectClient(project, store.clients);
  }
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabaseAdmin()
    .from("projects")
    .select("*, client:clients(*)")
    .eq("id", id)
    .maybeSingle();
  return data as Project | null;
}

export async function listProjectsForClient(clientId: string): Promise<Project[]> {
  if (isDemoMode()) {
    const store = readStore();
    return store.projects
      .filter((p) => p.client_id === clientId)
      .map((p) => withProjectClient(p, store.clients))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  if (!isSupabaseConfigured()) return emptyResult();
  const { data, error } = await getSupabaseAdmin()
    .from("projects")
    .select("*, client:clients(*)")
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Project[];
}

export async function listDeliverables(projectId: string): Promise<Deliverable[]> {
  if (isDemoMode()) {
    return readStore()
      .deliverables.filter((d) => d.project_id === projectId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  if (!isSupabaseConfigured()) return emptyResult();
  const { data, error } = await getSupabaseAdmin()
    .from("deliverables")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Deliverable[];
}

export async function getDeliverable(id: string): Promise<Deliverable | null> {
  if (isDemoMode()) {
    return readStore().deliverables.find((d) => d.id === id) ?? null;
  }
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabaseAdmin()
    .from("deliverables")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data as Deliverable | null;
}

export async function listFeedback(deliverableId: string): Promise<Feedback[]> {
  if (isDemoMode()) {
    const store = readStore();
    return store.feedback
      .filter((f) => f.deliverable_id === deliverableId)
      .map((f) => withFeedbackAuthor(f, store.users))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  if (!isSupabaseConfigured()) return emptyResult();
  const { data, error } = await getSupabaseAdmin()
    .from("feedback")
    .select("*, author:users!author_id(*)")
    .eq("deliverable_id", deliverableId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Feedback[];
}

export async function listContracts(_viewer: DbUser): Promise<Contract[]> {
  if (isDemoMode()) {
    const store = readStore();
    return store.contracts
      .map((c) => withContractClient(c, store.clients))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  if (!isSupabaseConfigured()) return emptyResult();
  const { data, error } = await getSupabaseAdmin()
    .from("contracts")
    .select("*, client:clients(*)")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Contract[];
}

export async function listContractsForClient(clientId: string): Promise<Contract[]> {
  if (isDemoMode()) {
    const store = readStore();
    return store.contracts
      .filter((c) => c.client_id === clientId)
      .map((c) => withContractClient(c, store.clients))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  if (!isSupabaseConfigured()) return emptyResult();
  const { data, error } = await getSupabaseAdmin()
    .from("contracts")
    .select("*, client:clients(*)")
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Contract[];
}

export async function getContract(id: string): Promise<Contract | null> {
  if (isDemoMode()) {
    const store = readStore();
    const contract = store.contracts.find((c) => c.id === id);
    if (!contract) return null;
    return withContractClient(contract, store.clients);
  }
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabaseAdmin()
    .from("contracts")
    .select("*, client:clients(*)")
    .eq("id", id)
    .maybeSingle();
  return data as Contract | null;
}

export async function listInvoices(_viewer: DbUser): Promise<Invoice[]> {
  if (isDemoMode()) {
    const store = readStore();
    return store.invoices
      .map((i) => withInvoiceClient(i, store.clients))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  if (!isSupabaseConfigured()) return emptyResult();
  const { data, error } = await getSupabaseAdmin()
    .from("invoices")
    .select("*, client:clients(*)")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Invoice[];
}

export async function listInvoicesForClient(clientId: string): Promise<Invoice[]> {
  if (isDemoMode()) {
    const store = readStore();
    return store.invoices
      .filter((i) => i.client_id === clientId)
      .map((i) => withInvoiceClient(i, store.clients))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  if (!isSupabaseConfigured()) return emptyResult();
  const { data, error } = await getSupabaseAdmin()
    .from("invoices")
    .select("*, client:clients(*)")
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Invoice[];
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  if (isDemoMode()) {
    const store = readStore();
    const invoice = store.invoices.find((i) => i.id === id);
    if (!invoice) return null;
    return withInvoiceClient(invoice, store.clients);
  }
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabaseAdmin()
    .from("invoices")
    .select("*, client:clients(*)")
    .eq("id", id)
    .maybeSingle();
  return data as Invoice | null;
}

export async function listActivities(filters: {
  lead_id?: string;
  deal_id?: string;
  client_id?: string;
  project_id?: string;
}): Promise<Activity[]> {
  if (isDemoMode()) {
    const store = readStore();
    return store.activities
      .filter((a) => {
        if (filters.lead_id && a.lead_id !== filters.lead_id) return false;
        if (filters.deal_id && a.deal_id !== filters.deal_id) return false;
        if (filters.client_id && a.client_id !== filters.client_id) return false;
        if (filters.project_id && a.project_id !== filters.project_id) return false;
        return Boolean(
          filters.lead_id || filters.deal_id || filters.client_id || filters.project_id
        );
      })
      .map((a) => withActivityAuthor(a, store.users))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 50);
  }
  if (!isSupabaseConfigured()) return emptyResult();
  let query = getSupabaseAdmin()
    .from("activities")
    .select("*, author:users!author_id(*)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (filters.lead_id) query = query.eq("lead_id", filters.lead_id);
  if (filters.deal_id) query = query.eq("deal_id", filters.deal_id);
  if (filters.client_id) query = query.eq("client_id", filters.client_id);
  if (filters.project_id) query = query.eq("project_id", filters.project_id);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Activity[];
}

export async function listTeamUsers(): Promise<DbUser[]> {
  if (isDemoMode()) {
    return [...readStore().users].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  if (!isSupabaseConfigured()) return emptyResult();
  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .select("*")
    .in("role", ["owner", "sales", "client"] satisfies UserRole[])
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as DbUser[];
}

function withInviteRels(
  row: ClientInviteRequest,
  users: DbUser[]
): ClientInviteRequest {
  return {
    ...row,
    requester: users.find((u) => u.id === row.requested_by) ?? null,
    reviewer: users.find((u) => u.id === row.reviewed_by) ?? null,
  };
}

export async function listClientInviteRequests(
  viewer: DbUser
): Promise<ClientInviteRequest[]> {
  if (isDemoMode()) {
    const store = readStore();
    let rows = [...store.client_invite_requests];
    if (viewer.role === "sales") {
      rows = rows.filter((r) => r.requested_by === viewer.id);
    }
    return rows
      .map((r) => withInviteRels(r, store.users))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  if (!isSupabaseConfigured()) return emptyResult();
  let query = getSupabaseAdmin()
    .from("client_invite_requests")
    .select(
      "*, requester:users!requested_by(*), reviewer:users!reviewed_by(*)"
    )
    .order("created_at", { ascending: false });
  if (viewer.role === "sales") {
    query = query.eq("requested_by", viewer.id);
  }
  const { data, error } = await query;
  if (error) {
    if (isMissingClientInviteTable(error)) {
      console.warn(
        "client_invite_requests table missing — run supabase/migrations/003_client_invite_requests.sql"
      );
      return emptyResult();
    }
    throw new Error(error.message);
  }
  return (data ?? []) as ClientInviteRequest[];
}

export function isMissingClientInviteTable(error: {
  message?: string;
  code?: string;
}): boolean {
  const message = error.message || "";
  return (
    error.code === "PGRST205" ||
    message.includes("client_invite_requests") ||
    message.includes("schema cache")
  );
}

export async function clientInviteRequestsReady(): Promise<boolean> {
  if (isDemoMode()) return true;
  if (!isSupabaseConfigured()) return false;
  const { error } = await getSupabaseAdmin()
    .from("client_invite_requests")
    .select("id")
    .limit(1);
  return !error || !isMissingClientInviteTable(error);
}

export function isMissingSalesProfilesTable(error: {
  message?: string;
  code?: string;
}): boolean {
  const message = error.message || "";
  return (
    error.code === "PGRST205" ||
    message.includes("sales_profiles") ||
    (message.includes("schema cache") && message.includes("sales_profiles"))
  );
}

export async function getSalesProfile(userId: string): Promise<SalesProfile | null> {
  if (isDemoMode()) {
    return readStore().sales_profiles.find((p) => p.user_id === userId) ?? null;
  }
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("sales_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingSalesProfilesTable(error)) return null;
    throw new Error(error.message);
  }
  return data as SalesProfile | null;
}

export async function hasCompletedSalesOnboarding(user: DbUser): Promise<boolean> {
  if (user.role !== "sales") return true;
  const profile = await getSalesProfile(user.id);
  return Boolean(profile?.completed_at);
}

export async function listSalesProfiles(): Promise<SalesProfile[]> {
  if (isDemoMode()) {
    const store = readStore();
    return store.sales_profiles
      .map((p) => ({
        ...p,
        user: store.users.find((u) => u.id === p.user_id) ?? null,
      }))
      .sort((a, b) => b.completed_at.localeCompare(a.completed_at));
  }
  if (!isSupabaseConfigured()) return emptyResult();
  const { data, error } = await getSupabaseAdmin()
    .from("sales_profiles")
    .select("*, user:users!user_id(*)")
    .order("completed_at", { ascending: false });
  if (error) {
    if (isMissingSalesProfilesTable(error)) return emptyResult();
    throw new Error(error.message);
  }
  return (data ?? []) as SalesProfile[];
}

export async function listContactsForOwner(): Promise<{
  users: DbUser[];
  salesProfiles: SalesProfile[];
}> {
  const [users, salesProfiles] = await Promise.all([listTeamUsers(), listSalesProfiles()]);
  return { users, salesProfiles };
}

export async function getDashboardStats(viewer: DbUser) {
  const [leads, deals, projects, invoices] = await Promise.all([
    listLeads(viewer),
    listDeals(viewer),
    listProjects(viewer),
    canAccessInvoices(viewer.role) ? listInvoices(viewer) : Promise.resolve([]),
  ]);

  const openLeads = leads.filter((l) => !["won", "lost"].includes(l.status)).length;
  const pipelineValue = deals
    .filter((d) => !["won", "lost"].includes(d.stage))
    .reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const activeProjects = projects.filter(
    (p) => !["completed", "on_hold"].includes(p.status)
  ).length;
  const openInvoicesList = invoices.filter((i) =>
    ["draft", "sent", "viewed", "overdue"].includes(i.status)
  );

  return {
    openLeads,
    pipelineValue,
    activeProjects,
    openInvoices: openInvoicesList.length,
    openInvoiceAmount: openInvoicesList.reduce((s, i) => s + Number(i.amount || 0), 0),
  };
}

export function isMissingChatTables(error: {
  message?: string;
  code?: string;
}): boolean {
  const message = error.message || "";
  return (
    error.code === "PGRST205" ||
    message.includes("conversations") ||
    message.includes("messages") ||
    (message.includes("schema cache") &&
      (message.includes("conversations") || message.includes("messages")))
  );
}

export async function chatTablesReady(): Promise<boolean> {
  if (isDemoMode()) return true;
  if (!isSupabaseConfigured()) return false;
  const { error } = await getSupabaseAdmin().from("conversations").select("id").limit(1);
  return !error || !isMissingChatTables(error);
}

export async function listChatPartners(viewer: DbUser): Promise<ChatPartnerOption[]> {
  const roles = chatPartnerRolesFor(viewer.role);
  if (!roles.length) return [];

  let users: DbUser[] = [];
  let clients: Client[] = [];
  let projects: Project[] = [];

  if (isDemoMode()) {
    const store = readStore();
    users = store.users.filter((u) => u.id !== viewer.id && roles.includes(u.role));
    clients = store.clients;
    projects = store.projects;
  } else if (!isSupabaseConfigured()) {
    return emptyResult();
  } else {
    const supabase = getSupabaseAdmin();
    const [usersRes, clientsRes, projectsRes] = await Promise.all([
      supabase
        .from("users")
        .select("*")
        .in("role", roles)
        .neq("id", viewer.id)
        .order("first_name", { ascending: true }),
      supabase.from("clients").select("*"),
      supabase.from("projects").select("*"),
    ]);
    if (usersRes.error) throw new Error(usersRes.error.message);
    if (clientsRes.error) throw new Error(clientsRes.error.message);
    if (projectsRes.error) throw new Error(projectsRes.error.message);
    users = (usersRes.data ?? []) as DbUser[];
    clients = (clientsRes.data ?? []) as Client[];
    projects = (projectsRes.data ?? []) as Project[];
  }

  return users
    .map((user) => withChatPartnerContext(user, clients, projects))
    .sort((a, b) => fullNameSort(a).localeCompare(fullNameSort(b)));
}

function pickPrimaryProject(projects: Project[]): Project | null {
  const open = projects.filter((p) => !["completed", "terminated"].includes(p.status));
  const pool = open.length ? open : projects;
  return (
    [...pool].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null
  );
}

function withChatPartnerContext(
  user: DbUser,
  clients: Client[],
  projects: Project[]
): ChatPartnerOption {
  if (user.role === "client") {
    const client =
      clients.find((c) => c.primary_user_id === user.id) ??
      clients.find(
        (c) => c.email && user.email && c.email.toLowerCase() === user.email.toLowerCase()
      ) ??
      null;
    const clientProjects = client
      ? projects.filter((p) => p.client_id === client.id)
      : [];
    const primary = pickPrimaryProject(clientProjects);
    const context_label = primary
      ? `${primary.id} · ${primary.name}`
      : client?.name ?? user.company_name ?? null;
    return {
      ...user,
      context_label,
      project_id: primary?.id ?? null,
      project_name: primary?.name ?? null,
      client_name: client?.name ?? user.company_name ?? null,
    };
  }

  if (user.role === "sales") {
    const assigned = projects.filter((p) => p.assigned_to === user.id);
    const primary = pickPrimaryProject(assigned);
    const context_label = primary
      ? `${primary.id} · ${primary.name}`
      : user.company_name ?? "Sales";
    return {
      ...user,
      context_label,
      project_id: primary?.id ?? null,
      project_name: primary?.name ?? null,
      client_name: null,
    };
  }

  return {
    ...user,
    context_label: user.company_name ?? "SN Web Design",
    project_id: null,
    project_name: null,
    client_name: null,
  };
}

function fullNameSort(u: DbUser) {
  return [u.first_name, u.last_name, u.email].filter(Boolean).join(" ").toLowerCase();
}

function isPartnerTyping(row: Conversation, viewerId: string): boolean {
  if (!row.typing_user_id || !row.typing_until) return false;
  if (row.typing_user_id === viewerId) return false;
  return new Date(row.typing_until).getTime() > Date.now();
}

function enrichConversation(
  row: Conversation,
  viewer: DbUser,
  users: DbUser[],
  messages: Message[]
): Conversation {
  const partnerId =
    row.participant_one_id === viewer.id ? row.participant_two_id : row.participant_one_id;
  const thread = messages
    .filter((m) => m.conversation_id === row.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const last = thread[thread.length - 1] ?? null;
  const unread = thread.filter(
    (m) => m.sender_id !== viewer.id && !m.read_at
  ).length;
  return {
    ...row,
    partner: users.find((u) => u.id === partnerId) ?? null,
    last_message: last,
    unread_count: unread,
    partner_is_typing: isPartnerTyping(row, viewer.id),
  };
}

export async function listConversations(viewer: DbUser): Promise<Conversation[]> {
  if (isDemoMode()) {
    const store = readStore();
    return store.conversations
      .filter(
        (c) =>
          c.participant_one_id === viewer.id || c.participant_two_id === viewer.id
      )
      .map((c) => enrichConversation(c, viewer, store.users, store.messages))
      .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
  }
  if (!isSupabaseConfigured()) return emptyResult();

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .or(`participant_one_id.eq.${viewer.id},participant_two_id.eq.${viewer.id}`)
    .order("last_message_at", { ascending: false });

  if (error) {
    if (isMissingChatTables(error)) return emptyResult();
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Conversation[];
  if (!rows.length) return [];

  const partnerIds = [
    ...new Set(
      rows.map((c) =>
        c.participant_one_id === viewer.id ? c.participant_two_id : c.participant_one_id
      )
    ),
  ];
  const conversationIds = rows.map((c) => c.id);

  const [{ data: partners }, { data: recentMsgs }, { data: unreadRows }] =
    await Promise.all([
      supabase.from("users").select("*").in("id", partnerIds),
      supabase
        .from("messages")
        .select("*")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("messages")
        .select("conversation_id")
        .in("conversation_id", conversationIds)
        .neq("sender_id", viewer.id)
        .is("read_at", null),
    ]);

  const users = (partners ?? []) as DbUser[];
  const allMessages = (recentMsgs ?? []) as Message[];
  const lastByConv = new Map<string, Message>();
  for (const msg of allMessages) {
    if (!lastByConv.has(msg.conversation_id)) {
      lastByConv.set(msg.conversation_id, msg);
    }
  }
  const unreadCount = new Map<string, number>();
  for (const row of unreadRows ?? []) {
    const id = (row as { conversation_id: string }).conversation_id;
    unreadCount.set(id, (unreadCount.get(id) ?? 0) + 1);
  }

  return rows.map((c) => {
    const partnerId =
      c.participant_one_id === viewer.id ? c.participant_two_id : c.participant_one_id;
    return {
      ...c,
      partner: users.find((u) => u.id === partnerId) ?? null,
      last_message: lastByConv.get(c.id) ?? null,
      unread_count: unreadCount.get(c.id) ?? 0,
      partner_is_typing: isPartnerTyping(c, viewer.id),
    };
  });
}

export async function getConversationForViewer(
  conversationId: string,
  viewer: DbUser
): Promise<Conversation | null> {
  if (isDemoMode()) {
    const store = readStore();
    const row = store.conversations.find((c) => c.id === conversationId);
    if (!row) return null;
    if (row.participant_one_id !== viewer.id && row.participant_two_id !== viewer.id) {
      return null;
    }
    return enrichConversation(row, viewer, store.users, store.messages);
  }
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) {
    if (isMissingChatTables(error)) return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  const row = data as Conversation;
  if (row.participant_one_id !== viewer.id && row.participant_two_id !== viewer.id) {
    return null;
  }

  const partnerId =
    row.participant_one_id === viewer.id ? row.participant_two_id : row.participant_one_id;
  const { data: partner } = await getSupabaseAdmin()
    .from("users")
    .select("*")
    .eq("id", partnerId)
    .maybeSingle();

  return {
    ...row,
    partner: (partner as DbUser) ?? null,
    partner_is_typing: isPartnerTyping(row, viewer.id),
  };
}

export async function getConversationTyping(
  conversationId: string,
  viewer: DbUser
): Promise<{ isTyping: boolean; name: string | null }> {
  const conversation = await getConversationForViewer(conversationId, viewer);
  if (!conversation) return { isTyping: false, name: null };
  if (!isPartnerTyping(conversation, viewer.id)) {
    return { isTyping: false, name: null };
  }
  const name = conversation.partner
    ? [conversation.partner.first_name, conversation.partner.last_name]
        .filter(Boolean)
        .join(" ") || conversation.partner.email
    : null;
  return { isTyping: true, name };
}

export async function listMessages(
  conversationId: string,
  viewer: DbUser
): Promise<Message[]> {
  const conversation = await getConversationForViewer(conversationId, viewer);
  if (!conversation) return [];

  if (isDemoMode()) {
    const store = readStore();
    return store.messages
      .filter((m) => m.conversation_id === conversationId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((m) => ({
        ...m,
        sender: store.users.find((u) => u.id === m.sender_id) ?? null,
      }));
  }
  if (!isSupabaseConfigured()) return emptyResult();

  const { data, error } = await getSupabaseAdmin()
    .from("messages")
    .select("*, sender:users!sender_id(*)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) {
    if (isMissingChatTables(error)) return emptyResult();
    throw new Error(error.message);
  }
  return (data ?? []) as Message[];
}

export { canChatRoles, orderedParticipantIds };
