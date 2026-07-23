import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type {
  Activity,
  AuditLog,
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
  MaintenancePlan,
  Message,
  Project,
  SalesProfile,
} from "@/lib/types";

export type DemoStore = {
  users: DbUser[];
  leads: Lead[];
  deals: Deal[];
  clients: Client[];
  projects: Project[];
  deliverables: Deliverable[];
  feedback: Feedback[];
  contracts: Contract[];
  invoices: Invoice[];
  activities: Activity[];
  maintenance_plans: MaintenancePlan[];
  client_invite_requests: ClientInviteRequest[];
  sales_profiles: SalesProfile[];
  conversations: Conversation[];
  messages: Message[];
  audit_logs: AuditLog[];
};

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

function now() {
  return new Date().toISOString();
}

function seedStore(): DemoStore {
  const ts = now();
  const owner: DbUser = {
    id: "user-owner",
    clerk_id: "demo-owner",
    email: "owner@snwebdesign.test",
    first_name: "Sam",
    last_name: "Nguyen",
    role: "owner",
    phone: "555-0100",
    company_name: "SN Web Design",
    avatar_url: null,
    created_at: ts,
    updated_at: ts,
  };
  const sales: DbUser = {
    id: "user-sales",
    clerk_id: "demo-sales",
    email: "sales@snwebdesign.test",
    first_name: "Jordan",
    last_name: "Lee",
    role: "sales",
    phone: "555-0101",
    company_name: "SN Web Design",
    avatar_url: null,
    created_at: ts,
    updated_at: ts,
  };
  const clientUser: DbUser = {
    id: "user-client",
    clerk_id: "demo-client",
    email: "alex@acmecoffee.test",
    first_name: "Alex",
    last_name: "Rivera",
    role: "client",
    phone: "555-0200",
    company_name: "Acme Coffee",
    avatar_url: null,
    created_at: ts,
    updated_at: ts,
  };

  const client: Client = {
    id: "client-acme",
    name: "Acme Coffee",
    email: "alex@acmecoffee.test",
    phone: "555-0200",
    website: "https://acmecoffee.test",
    status: "active",
    primary_user_id: clientUser.id,
    notes: "Seeded demo client",
    created_by: owner.id,
    created_at: ts,
    updated_at: ts,
  };

  const lead: Lead = {
    id: "lead-1",
    first_name: "Morgan",
    last_name: "Blake",
    email: "morgan@bloomstudio.test",
    phone: "555-0300",
    company_name: "Bloom Studio",
    source: "Referral",
    status: "qualified",
    estimated_value: 4500,
    notes: "Needs a marketing site refresh",
    owner_id: sales.id,
    converted_client_id: null,
    created_at: ts,
    updated_at: ts,
  };

  const deal: Deal = {
    id: "deal-1",
    title: "Acme Coffee — Full site",
    lead_id: null,
    client_id: client.id,
    stage: "negotiation",
    amount: 6200,
    close_date: null,
    notes: "Open deal for upsell",
    owner_id: sales.id,
    created_at: ts,
    updated_at: ts,
  };

  const project: Project = {
    id: "ACME3847",
    name: "Acme Coffee Website",
    description: "Brand refresh and new online ordering pages",
    client_id: client.id,
    status: "design",
    progress: 40,
    start_date: ts.slice(0, 10),
    target_launch_date: null,
    assigned_to: sales.id,
    deal_id: deal.id,
    created_by: owner.id,
    created_at: ts,
    updated_at: ts,
  };

  const deliverable: Deliverable = {
    id: "deliv-1",
    project_id: project.id,
    title: "Homepage mockup v1",
    description: "Hero, menu preview, and location block",
    file_url: "https://placehold.co/1200x800/0f766e/ffffff?text=Homepage+Mockup",
    file_name: "homepage-v1.png",
    preview_url: "https://placehold.co/1200x800/0f766e/ffffff?text=Homepage+Mockup",
    version: 1,
    status: "in_review",
    uploaded_by: owner.id,
    approved_at: null,
    created_at: ts,
    updated_at: ts,
  };

  const contract: Contract = {
    id: "contract-1",
    title: "Acme Coffee Web Design Agreement",
    client_id: client.id,
    project_id: project.id,
    file_url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    file_name: "agreement.pdf",
    status: "sent",
    sent_at: ts,
    viewed_at: null,
    signed_at: null,
    signature_data: null,
    signer_ip: null,
    signer_user_agent: null,
    created_by: owner.id,
    created_at: ts,
    updated_at: ts,
  };

  const invoice: Invoice = {
    id: "invoice-1",
    invoice_number: "INV-DEMO-001",
    title: "Website design deposit",
    description: "50% deposit to begin design",
    client_id: client.id,
    project_id: project.id,
    amount: 3100,
    currency: "USD",
    status: "sent",
    due_date: ts.slice(0, 10),
    paid_at: null,
    stripe_checkout_session_id: null,
    stripe_payment_intent_id: null,
    created_by: owner.id,
    created_at: ts,
    updated_at: ts,
  };

  return {
    users: [owner, sales, clientUser],
    leads: [lead],
    deals: [deal],
    clients: [client],
    projects: [project],
    deliverables: [deliverable],
    feedback: [],
    contracts: [contract],
    invoices: [invoice],
    activities: [
      {
        id: "act-1",
        type: "note",
        body: "Intro call completed — interested in Q3 launch",
        lead_id: lead.id,
        deal_id: null,
        client_id: null,
        project_id: null,
        author_id: sales.id,
        created_at: ts,
      },
    ],
    maintenance_plans: [],
    client_invite_requests: [],
    sales_profiles: [
      {
        user_id: sales.id,
        full_name: "Riley Chen",
        email: "sales@snwebdesign.test",
        phone: "555-0101",
        calling_from: "Home office — Seattle, WA",
        calling_schedule: "Mon–Fri 9am–5pm PT",
        target_region: "West Coast",
        daily_call_goal: 40,
        weekly_meeting_goal: 6,
        completed_at: ts,
        created_at: ts,
        updated_at: ts,
      },
    ],
    conversations: [],
    messages: [],
    audit_logs: [],
  };
}

function ensureStore(): DemoStore {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    const seeded = seedStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(seeded, null, 2), "utf8");
    return seeded;
  }
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as DemoStore;
}

export function readStore(): DemoStore {
  const store = ensureStore();
  if (!store.client_invite_requests) store.client_invite_requests = [];
  if (!store.sales_profiles) store.sales_profiles = [];
  if (!store.conversations) store.conversations = [];
  if (!store.messages) store.messages = [];
  if (!store.audit_logs) store.audit_logs = [];
  return store;
}

export function writeStore(store: DemoStore) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export function mutateStore<T>(fn: (store: DemoStore) => T): T {
  const store = readStore();
  const result = fn(store);
  writeStore(store);
  return result;
}

export function newId(prefix = "id") {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export function touch() {
  return now();
}

export function resetDemoStore() {
  const seeded = seedStore();
  writeStore(seeded);
  return seeded;
}

export function getUserById(id: string): DbUser | null {
  return readStore().users.find((u) => u.id === id) ?? null;
}

export function getDemoUsers(): DbUser[] {
  return readStore().users;
}
