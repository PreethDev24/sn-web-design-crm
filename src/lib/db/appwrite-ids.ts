/** Fixed Appwrite resource IDs for SN Web Design CRM */

export const APPWRITE_DATABASE_ID =
  process.env.APPWRITE_DATABASE_ID?.trim() || "sn_crm";

export const COLLECTIONS = {
  users: "users",
  clients: "clients",
  leads: "leads",
  deals: "deals",
  projects: "projects",
  deliverables: "deliverables",
  feedback: "feedback",
  contracts: "contracts",
  invoices: "invoices",
  activities: "activities",
  maintenance_plans: "maintenance_plans",
  client_invite_requests: "client_invite_requests",
  sales_profiles: "sales_profiles",
  conversations: "conversations",
  messages: "messages",
  audit_logs: "audit_logs",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export const BUCKETS = {
  deliverables: "deliverables",
  contracts: "contracts",
} as const;
