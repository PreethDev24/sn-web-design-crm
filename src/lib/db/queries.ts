import {
  isDataConfigured,
  listDocuments,
  getDocument,
  findOneBy,
  findByEmailIlike,
  updateDocument,
  collectionReady,
  parseJsonField,
  COLLECTIONS,
} from "@/lib/db/repo";
import { isDemoMode } from "@/lib/demo/mode";
import { readStore } from "@/lib/demo/store";
import { canAccessInvoices } from "@/lib/auth/roles-shared";
import type {
  Activity,
  AuditLog,
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

function uniqueIds(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}

async function usersById(ids: string[]): Promise<DbUser[]> {
  if (!ids.length) return [];
  return listDocuments(COLLECTIONS.users, { equalAny: { id: ids } }) as unknown as (DbUser)[];
}

function withLeadRels(lead: Lead, users: DbUser[]): Lead {
  return {
    ...lead,
    assigned_to: lead.assigned_to ?? null,
    owner: users.find((u) => u.id === lead.owner_id) ?? null,
    assignee: lead.assigned_to
      ? users.find((u) => u.id === lead.assigned_to) ?? null
      : null,
  };
}

/** Sales only see leads assigned to them; owners see everything. */
export function canAccessLead(viewer: DbUser, lead: Pick<Lead, "assigned_to">) {
  if (viewer.role === "owner") return true;
  if (viewer.role === "sales") return lead.assigned_to === viewer.id;
  return false;
}

function filterLeadsForViewer(leads: Lead[], viewer: DbUser) {
  if (viewer.role === "owner") return leads;
  return leads.filter((l) => canAccessLead(viewer, l));
}

function withDealRels(deal: Deal, users: DbUser[], leads: Lead[]): Deal {
  return {
    ...deal,
    owner: users.find((u) => u.id === deal.owner_id) ?? null,
    lead: leads.find((l) => l.id === deal.lead_id) ?? null,
  };
}

function withDealRelsDemo(deal: Deal, store: ReturnType<typeof readStore>): Deal {
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
  return {
    ...contract,
    signature_data: parseJsonField(contract.signature_data, null),
    client: clients.find((c) => c.id === contract.client_id) ?? null,
  };
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

export async function listLeads(viewer: DbUser): Promise<Lead[]> {
  if (isDemoMode()) {
    const store = readStore();
    const leads = filterLeadsForViewer(
      store.leads.map((l) => withLeadRels(l, store.users)),
      viewer
    );
    return leads.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  if (!isDataConfigured()) return emptyResult();

  let leads: Lead[];
  if (viewer.role === "sales") {
    leads = (await listDocuments(COLLECTIONS.leads, {
      equal: { assigned_to: viewer.id },
      orderAttr: "updated_at",
      orderAsc: false,
    })) as unknown as Lead[];
  } else {
    leads = (await listDocuments(COLLECTIONS.leads, {
      orderAttr: "updated_at",
      orderAsc: false,
    })) as unknown as Lead[];
  }

  const users = await usersById(
    uniqueIds([
      ...leads.map((l) => l.owner_id),
      ...leads.map((l) => l.assigned_to),
    ])
  );
  return leads.map((l) => withLeadRels(l, users));
}

export async function getLead(id: string, viewer: DbUser): Promise<Lead | null> {
  if (isDemoMode()) {
    const store = readStore();
    const lead = store.leads.find((l) => l.id === id);
    if (!lead) return null;
    const withRels = withLeadRels(lead, store.users);
    return canAccessLead(viewer, withRels) ? withRels : null;
  }
  if (!isDataConfigured()) return null;
  const lead = (await getDocument(COLLECTIONS.leads, id)) as unknown as Lead | null;
  if (!lead) return null;
  if (!canAccessLead(viewer, lead)) return null;
  const users = await usersById(uniqueIds([lead.owner_id, lead.assigned_to]));
  return withLeadRels(lead, users);
}

export async function listDeals(viewer: DbUser): Promise<Deal[]> {
  if (isDemoMode()) {
    const store = readStore();
    const deals = store.deals.map((d) => withDealRelsDemo(d, store));
    return deals.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  if (!isDataConfigured()) return emptyResult();
  const deals = await listDocuments(COLLECTIONS.deals, {
    orderAttr: "updated_at",
    orderAsc: false,
  }) as unknown as (Deal)[];
  const [owners, leads] = await Promise.all([
    usersById(uniqueIds(deals.map((d) => d.owner_id))),
    uniqueIds(deals.map((d) => d.lead_id)).length
      ? listDocuments(COLLECTIONS.leads, {
          equalAny: { id: uniqueIds(deals.map((d) => d.lead_id)) },
        }) as unknown as (Lead)[]
      : Promise.resolve([] as Lead[]),
  ]);
  return deals.map((d) => withDealRels(d, owners, leads));
}

export async function getDeal(id: string, _viewer: DbUser): Promise<Deal | null> {
  if (isDemoMode()) {
    const store = readStore();
    const deal = store.deals.find((d) => d.id === id);
    if (!deal) return null;
    return withDealRelsDemo(deal, store);
  }
  if (!isDataConfigured()) return null;
  const deal = await getDocument(COLLECTIONS.deals, id) as unknown as (Deal) | null;
  if (!deal) return null;
  const [owner, lead] = await Promise.all([
    deal.owner_id ? getDocument(COLLECTIONS.users, deal.owner_id) as unknown as (DbUser) | null : Promise.resolve(null),
    deal.lead_id ? getDocument(COLLECTIONS.leads, deal.lead_id) as unknown as (Lead) | null : Promise.resolve(null),
  ]);
  return { ...deal, owner, lead };
}

export async function listClients(_viewer: DbUser): Promise<Client[]> {
  if (isDemoMode()) {
    const store = readStore();
    const clients = [...store.clients];
    return clients.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  if (!isDataConfigured()) return emptyResult();
  return listDocuments(COLLECTIONS.clients, {
    orderAttr: "updated_at",
    orderAsc: false,
  }) as unknown as (Client)[];
}

export async function getClient(id: string): Promise<Client | null> {
  if (isDemoMode()) {
    return readStore().clients.find((c) => c.id === id) ?? null;
  }
  if (!isDataConfigured()) return null;
  return getDocument(COLLECTIONS.clients, id) as unknown as (Client) | null;
}

export async function getClientForUser(userId: string): Promise<Client | null> {
  if (isDemoMode()) {
    return readStore().clients.find((c) => c.primary_user_id === userId) ?? null;
  }
  if (!isDataConfigured()) return null;
  const byPrimary = (await findOneBy(COLLECTIONS.clients, {
    primary_user_id: userId,
  })) as unknown as Client | null;
  if (byPrimary) return byPrimary;

  // Fallback: match client company email to the portal user (and heal the link)
  const user = (await getDocument(COLLECTIONS.users, userId)) as unknown as DbUser | null;
  if (!user?.email) return null;
  const byEmail = (await findByEmailIlike(COLLECTIONS.clients, user.email)) as unknown as
    | Client
    | null;
  if (!byEmail) return null;

  if (!byEmail.primary_user_id) {
    try {
      await updateDocument(COLLECTIONS.clients, byEmail.id, {
        primary_user_id: userId,
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn("Could not heal client primary_user_id:", e);
    }
  }
  return { ...byEmail, primary_user_id: byEmail.primary_user_id ?? userId };
}

export async function listProjects(_viewer: DbUser): Promise<Project[]> {
  if (isDemoMode()) {
    const store = readStore();
    const projects = store.projects.map((p) => withProjectClient(p, store.clients));
    return projects.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  if (!isDataConfigured()) return emptyResult();
  const projects = await listDocuments(COLLECTIONS.projects, {
    orderAttr: "updated_at",
    orderAsc: false,
  }) as unknown as (Project)[];
  const clients = await (async () => {
    const ids = uniqueIds(projects.map((p) => p.client_id));
    return ids.length
      ? listDocuments(COLLECTIONS.clients, { equalAny: { id: ids } }) as unknown as (Client)[]
      : [];
  })();
  return projects.map((p) => withProjectClient(p, clients));
}

export async function getProject(id: string): Promise<Project | null> {
  if (isDemoMode()) {
    const store = readStore();
    const project = store.projects.find((p) => p.id === id);
    if (!project) return null;
    return withProjectClient(project, store.clients);
  }
  if (!isDataConfigured()) return null;
  const project = await getDocument(COLLECTIONS.projects, id) as unknown as (Project) | null;
  if (!project) return null;
  const client = project.client_id
    ? await getDocument(COLLECTIONS.clients, project.client_id) as unknown as (Client) | null
    : null;
  return { ...project, client };
}

export async function listProjectsForClient(clientId: string): Promise<Project[]> {
  if (isDemoMode()) {
    const store = readStore();
    return store.projects
      .filter((p) => p.client_id === clientId)
      .map((p) => withProjectClient(p, store.clients))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  if (!isDataConfigured()) return emptyResult();
  const projects = await listDocuments(COLLECTIONS.projects, {
    equal: { client_id: clientId },
    orderAttr: "updated_at",
    orderAsc: false,
  }) as unknown as (Project)[];
  const client = await getDocument(COLLECTIONS.clients, clientId) as unknown as (Client) | null;
  return projects.map((p) => ({ ...p, client }));
}

export async function listDeliverables(projectId: string): Promise<Deliverable[]> {
  if (isDemoMode()) {
    return readStore()
      .deliverables.filter((d) => d.project_id === projectId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  if (!isDataConfigured()) return emptyResult();
  return listDocuments(COLLECTIONS.deliverables, {
    equal: { project_id: projectId },
    orderAttr: "created_at",
    orderAsc: false,
  }) as unknown as (Deliverable)[];
}

export async function getDeliverable(id: string): Promise<Deliverable | null> {
  if (isDemoMode()) {
    return readStore().deliverables.find((d) => d.id === id) ?? null;
  }
  if (!isDataConfigured()) return null;
  return getDocument(COLLECTIONS.deliverables, id) as unknown as (Deliverable) | null;
}

export async function listFeedback(deliverableId: string): Promise<Feedback[]> {
  if (isDemoMode()) {
    const store = readStore();
    return store.feedback
      .filter((f) => f.deliverable_id === deliverableId)
      .map((f) => withFeedbackAuthor(f, store.users))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  if (!isDataConfigured()) return emptyResult();
  const feedback = await listDocuments(COLLECTIONS.feedback, {
    equal: { deliverable_id: deliverableId },
    orderAttr: "created_at",
    orderAsc: true,
  }) as unknown as (Feedback)[];
  const authors = await usersById(uniqueIds(feedback.map((f) => f.author_id)));
  return feedback.map((f) => withFeedbackAuthor(f, authors));
}

export async function listContracts(_viewer: DbUser): Promise<Contract[]> {
  if (isDemoMode()) {
    const store = readStore();
    return store.contracts
      .map((c) => withContractClient(c, store.clients))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  if (!isDataConfigured()) return emptyResult();
  const contracts = await listDocuments(COLLECTIONS.contracts, {
    orderAttr: "updated_at",
    orderAsc: false,
  }) as unknown as (Contract)[];
  const clients = await usersOrClientsById(uniqueIds(contracts.map((c) => c.client_id)));
  return contracts.map((c) => withContractClient(c, clients));
}

async function usersOrClientsById(ids: string[]): Promise<Client[]> {
  if (!ids.length) return [];
  return listDocuments(COLLECTIONS.clients, { equalAny: { id: ids } }) as unknown as (Client)[];
}

export async function listContractsForClient(clientId: string): Promise<Contract[]> {
  if (isDemoMode()) {
    const store = readStore();
    return store.contracts
      .filter((c) => c.client_id === clientId)
      .map((c) => withContractClient(c, store.clients))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  if (!isDataConfigured()) return emptyResult();
  const contracts = await listDocuments(COLLECTIONS.contracts, {
    equal: { client_id: clientId },
    orderAttr: "updated_at",
    orderAsc: false,
  }) as unknown as (Contract)[];
  const client = await getDocument(COLLECTIONS.clients, clientId) as unknown as (Client) | null;
  return contracts.map((c) => ({
    ...c,
    signature_data: parseJsonField(c.signature_data, null),
    client,
  }));
}

export async function getContract(id: string): Promise<Contract | null> {
  if (isDemoMode()) {
    const store = readStore();
    const contract = store.contracts.find((c) => c.id === id);
    if (!contract) return null;
    return withContractClient(contract, store.clients);
  }
  if (!isDataConfigured()) return null;
  const contract = await getDocument(COLLECTIONS.contracts, id) as unknown as (Contract) | null;
  if (!contract) return null;
  const client = contract.client_id
    ? await getDocument(COLLECTIONS.clients, contract.client_id) as unknown as (Client) | null
    : null;
  return { ...contract, signature_data: parseJsonField(contract.signature_data, null), client };
}

export async function listInvoices(_viewer: DbUser): Promise<Invoice[]> {
  if (isDemoMode()) {
    const store = readStore();
    return store.invoices
      .map((i) => withInvoiceClient(i, store.clients))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  if (!isDataConfigured()) return emptyResult();
  const invoices = await listDocuments(COLLECTIONS.invoices, {
    orderAttr: "updated_at",
    orderAsc: false,
  }) as unknown as (Invoice)[];
  const clients = await usersOrClientsById(uniqueIds(invoices.map((i) => i.client_id)));
  return invoices.map((i) => withInvoiceClient(i, clients));
}

export async function listInvoicesForClient(clientId: string): Promise<Invoice[]> {
  if (isDemoMode()) {
    const store = readStore();
    return store.invoices
      .filter((i) => i.client_id === clientId)
      .map((i) => withInvoiceClient(i, store.clients))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  if (!isDataConfigured()) return emptyResult();
  const invoices = await listDocuments(COLLECTIONS.invoices, {
    equal: { client_id: clientId },
    orderAttr: "updated_at",
    orderAsc: false,
  }) as unknown as (Invoice)[];
  const client = await getDocument(COLLECTIONS.clients, clientId) as unknown as (Client) | null;
  return invoices.map((i) => ({ ...i, client }));
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  if (isDemoMode()) {
    const store = readStore();
    const invoice = store.invoices.find((i) => i.id === id);
    if (!invoice) return null;
    return withInvoiceClient(invoice, store.clients);
  }
  if (!isDataConfigured()) return null;
  const invoice = await getDocument(COLLECTIONS.invoices, id) as unknown as (Invoice) | null;
  if (!invoice) return null;
  const client = invoice.client_id
    ? await getDocument(COLLECTIONS.clients, invoice.client_id) as unknown as (Client) | null
    : null;
  return { ...invoice, client };
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
  if (!isDataConfigured()) return emptyResult();
  if (!filters.lead_id && !filters.deal_id && !filters.client_id && !filters.project_id) {
    return emptyResult();
  }
  const equal: Record<string, string> = {};
  if (filters.lead_id) equal.lead_id = filters.lead_id;
  if (filters.deal_id) equal.deal_id = filters.deal_id;
  if (filters.client_id) equal.client_id = filters.client_id;
  if (filters.project_id) equal.project_id = filters.project_id;
  const activities = await listDocuments(COLLECTIONS.activities, {
    equal,
    orderAttr: "created_at",
    orderAsc: false,
    limit: 50,
  }) as unknown as (Activity)[];
  const authors = await usersById(uniqueIds(activities.map((a) => a.author_id)));
  return activities.map((a) => withActivityAuthor(a, authors));
}

export async function listTeamUsers(viewer?: DbUser): Promise<DbUser[]> {
  let users: DbUser[] = [];

  if (isDemoMode()) {
    users = [...readStore().users].sort((a, b) => b.created_at.localeCompare(a.created_at));
  } else if (!isDataConfigured()) {
    return emptyResult();
  } else {
    // Fetch all users then filter in JS — more reliable than Appwrite multi-value
    // role queries across plan/index differences.
    try {
      users = (await listDocuments(COLLECTIONS.users, {
        orderAttr: "created_at",
        orderAsc: false,
        limit: 500,
      })) as unknown as DbUser[];
    } catch (e) {
      console.error("listTeamUsers failed:", e);
      users = (await listDocuments(COLLECTIONS.users, { limit: 500 })) as unknown as DbUser[];
    }
    users = users.filter((u) =>
      (["owner", "sales", "client"] as UserRole[]).includes(u.role)
    );
  }

  // Sales reps must not see other sales (or themselves) — only owners and clients
  if (viewer?.role === "sales") {
    return users.filter((u) => u.role === "owner" || u.role === "client");
  }

  return users;
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
  if (!isDataConfigured()) return emptyResult();
  try {
    const rows = await listDocuments(COLLECTIONS.client_invite_requests, {
      equal: viewer.role === "sales" ? { requested_by: viewer.id } : undefined,
      orderAttr: "created_at",
      orderAsc: false,
    }) as unknown as (ClientInviteRequest)[];
    const userIds = uniqueIds([
      ...rows.map((r) => r.requested_by),
      ...rows.map((r) => r.reviewed_by),
    ]);
    const users = await usersById(userIds);
    return rows.map((r) => withInviteRels(r, users));
  } catch (e) {
    const error = { message: e instanceof Error ? e.message : String(e) };
    if (isMissingClientInviteTable(error)) {
      console.warn(
        "client_invite_requests collection missing — run supabase/migrations/003_client_invite_requests.sql or create the Appwrite collection"
      );
      return emptyResult();
    }
    throw e;
  }
}

export function isMissingClientInviteTable(error: {
  message?: string;
  code?: string;
}): boolean {
  const message = error.message || "";
  return (
    error.code === "PGRST205" ||
    message.includes("client_invite_requests") ||
    message.includes("schema cache") ||
    /not found|could not be found|404|Could not find|does not exist/i.test(message)
  );
}

export async function clientInviteRequestsReady(): Promise<boolean> {
  if (isDemoMode()) return true;
  return collectionReady(COLLECTIONS.client_invite_requests);
}

export function isMissingSalesProfilesTable(error: {
  message?: string;
  code?: string;
}): boolean {
  const message = error.message || "";
  return (
    error.code === "PGRST205" ||
    message.includes("sales_profiles") ||
    (message.includes("schema cache") && message.includes("sales_profiles")) ||
    /not found|could not be found|404|Could not find|does not exist/i.test(message)
  );
}

export async function getSalesProfile(userId: string): Promise<SalesProfile | null> {
  if (isDemoMode()) {
    return readStore().sales_profiles.find((p) => p.user_id === userId) ?? null;
  }
  if (!isDataConfigured()) return null;
  try {
    const byId = (await getDocument(COLLECTIONS.sales_profiles, userId)) as unknown as
      | SalesProfile
      | null;
    if (byId) return { ...byId, user_id: byId.user_id ?? userId };
    return (await findOneBy(COLLECTIONS.sales_profiles, {
      user_id: userId,
    })) as unknown as SalesProfile | null;
  } catch (e) {
    const error = { message: e instanceof Error ? e.message : String(e) };
    if (isMissingSalesProfilesTable(error)) return null;
    throw e;
  }
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
  if (!isDataConfigured()) return emptyResult();
  try {
    const profiles = await listDocuments(COLLECTIONS.sales_profiles, {
      orderAttr: "completed_at",
      orderAsc: false,
    }) as unknown as (SalesProfile)[];
    const users = await usersById(uniqueIds(profiles.map((p) => p.user_id)));
    return profiles.map((p) => ({ ...p, user: users.find((u) => u.id === p.user_id) ?? null }));
  } catch (e) {
    const error = { message: e instanceof Error ? e.message : String(e) };
    if (isMissingSalesProfilesTable(error)) return emptyResult();
    throw e;
  }
}

export async function listContactsForViewer(viewer: DbUser): Promise<{
  users: DbUser[];
  salesProfiles: SalesProfile[];
}> {
  const users = await listTeamUsers(viewer);
  // Sales onboarding details are owner-only
  const salesProfiles =
    viewer.role === "owner" ? await listSalesProfiles() : [];
  return { users, salesProfiles };
}

/** @deprecated Prefer listContactsForViewer — kept for any older imports */
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
      (message.includes("conversations") || message.includes("messages"))) ||
    /not found|could not be found|404|Could not find|does not exist/i.test(message)
  );
}

export async function chatTablesReady(): Promise<boolean> {
  if (isDemoMode()) return true;
  return collectionReady(COLLECTIONS.conversations);
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
  } else if (!isDataConfigured()) {
    return emptyResult();
  } else {
    [users, clients, projects] = await Promise.all([
      listDocuments(COLLECTIONS.users, {
        equalAny: { role: roles },
        notEqual: { id: viewer.id },
      }) as unknown as (DbUser)[],
      listDocuments(COLLECTIONS.clients, {}) as unknown as (Client)[],
      listDocuments(COLLECTIONS.projects, {}) as unknown as (Project)[],
    ]);
  }

  return users
    .map((user) => withChatPartnerContext(user, clients, projects))
    .sort((a, b) => fullNameSort(a).localeCompare(fullNameSort(b)));
}

function pickPrimaryProject(projects: Project[]): Project | null {
  const open = projects.filter((p) => !["completed", "terminated"].includes(p.status));
  const pool = open.length ? open : projects;
  return (
    [...pool].sort((a, b) =>
      String(b.updated_at || "").localeCompare(String(a.updated_at || ""))
    )[0] ?? null
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
  if (!isDataConfigured()) return emptyResult();

  let rows: Conversation[];
  try {
    const [asOne, asTwo] = await Promise.all([
      listDocuments(COLLECTIONS.conversations, {
        equal: { participant_one_id: viewer.id },
      }) as unknown as (Conversation)[],
      listDocuments(COLLECTIONS.conversations, {
        equal: { participant_two_id: viewer.id },
      }) as unknown as (Conversation)[],
    ]);
    const byId = new Map<string, Conversation>();
    for (const row of [...asOne, ...asTwo]) byId.set(row.id, row);
    rows = [...byId.values()].sort((a, b) =>
      String(b.last_message_at || "").localeCompare(String(a.last_message_at || ""))
    );
  } catch (e) {
    const error = { message: e instanceof Error ? e.message : String(e) };
    if (isMissingChatTables(error)) return emptyResult();
    throw e;
  }

  if (!rows.length) return [];

  const partnerIds = uniqueIds(
    rows.map((c) =>
      c.participant_one_id === viewer.id ? c.participant_two_id : c.participant_one_id
    )
  );
  const conversationIds = rows.map((c) => c.id);

  const [users, allMessages, unreadMessages] = await Promise.all([
    usersById(partnerIds),
    conversationIds.length
      ? listDocuments(COLLECTIONS.messages, {
          equalAny: { conversation_id: conversationIds },
          orderAttr: "created_at",
          orderAsc: false,
          limit: 2000,
        }) as unknown as (Message)[]
      : Promise.resolve([] as Message[]),
    conversationIds.length
      ? listDocuments(COLLECTIONS.messages, {
          equalAny: { conversation_id: conversationIds },
          notEqual: { sender_id: viewer.id },
          isNull: ["read_at"],
          limit: 2000,
        }) as unknown as (Message)[]
      : Promise.resolve([] as Message[]),
  ]);

  const lastByConv = new Map<string, Message>();
  for (const msg of allMessages) {
    if (!lastByConv.has(msg.conversation_id)) {
      lastByConv.set(msg.conversation_id, msg);
    }
  }
  const unreadCount = new Map<string, number>();
  for (const row of unreadMessages) {
    unreadCount.set(row.conversation_id, (unreadCount.get(row.conversation_id) ?? 0) + 1);
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
  if (!isDataConfigured()) return null;

  let row: Conversation | null;
  try {
    row = await getDocument(COLLECTIONS.conversations, conversationId) as unknown as (Conversation) | null;
  } catch (e) {
    const error = { message: e instanceof Error ? e.message : String(e) };
    if (isMissingChatTables(error)) return null;
    throw e;
  }
  if (!row) return null;
  if (row.participant_one_id !== viewer.id && row.participant_two_id !== viewer.id) {
    return null;
  }

  const partnerId =
    row.participant_one_id === viewer.id ? row.participant_two_id : row.participant_one_id;
  const partner = await getDocument(COLLECTIONS.users, partnerId) as unknown as (DbUser) | null;

  return {
    ...row,
    partner: partner ?? null,
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
  if (!isDataConfigured()) return emptyResult();

  let messages: Message[];
  try {
    messages = await listDocuments(COLLECTIONS.messages, {
      equal: { conversation_id: conversationId },
      orderAttr: "created_at",
      orderAsc: true,
    }) as unknown as (Message)[];
  } catch (e) {
    const error = { message: e instanceof Error ? e.message : String(e) };
    if (isMissingChatTables(error)) return emptyResult();
    throw e;
  }
  const senders = await usersById(uniqueIds(messages.map((m) => m.sender_id)));
  return messages.map((m) => ({
    ...m,
    sender: senders.find((u) => u.id === m.sender_id) ?? null,
  }));
}

export function isMissingAuditLogsTable(error: {
  message?: string;
  code?: string;
}): boolean {
  const message = error.message || "";
  return (
    error.code === "PGRST205" ||
    message.includes("audit_logs") ||
    (message.includes("schema cache") && message.includes("audit_logs")) ||
    /not found|could not be found|404|Could not find|does not exist/i.test(message)
  );
}

export async function auditLogsReady(): Promise<boolean> {
  if (isDemoMode()) return true;
  return collectionReady(COLLECTIONS.audit_logs);
}

export async function listAuditLogs(limit = 200): Promise<AuditLog[]> {
  if (isDemoMode()) {
    const store = readStore();
    return [...(store.audit_logs ?? [])]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map((row) => ({
        ...row,
        actor: row.actor_id
          ? store.users.find((u) => u.id === row.actor_id) ?? null
          : null,
      }));
  }
  if (!isDataConfigured()) return emptyResult();

  let rows: AuditLog[];
  try {
    rows = await listDocuments(COLLECTIONS.audit_logs, {
      orderAttr: "created_at",
      orderAsc: false,
      limit,
    }) as unknown as (AuditLog)[];
  } catch (e) {
    const error = { message: e instanceof Error ? e.message : String(e) };
    if (isMissingAuditLogsTable(error)) return emptyResult();
    throw e;
  }
  const actors = await usersById(uniqueIds(rows.map((r) => r.actor_id)));
  return rows.map((row) => ({
    ...row,
    metadata: parseJsonField(row.metadata, {}),
    actor: row.actor_id ? actors.find((u) => u.id === row.actor_id) ?? null : null,
  }));
}

export { canChatRoles, orderedParticipantIds };
