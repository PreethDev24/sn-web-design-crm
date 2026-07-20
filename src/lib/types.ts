export type UserRole = "owner" | "sales" | "client";

export type LeadStatus = "new" | "contacted" | "qualified" | "proposal" | "won" | "lost";
export type DealStage = "discovery" | "proposal" | "negotiation" | "won" | "lost";
export type ClientStatus = "active" | "maintenance" | "churned";
export type ProjectStatus =
  | "discovery"
  | "wireframing"
  | "design"
  | "development"
  | "revisions"
  | "launch"
  | "maintenance"
  | "completed"
  | "on_hold";
export type DeliverableStatus = "draft" | "in_review" | "changes_requested" | "approved";
export type ContractStatus = "draft" | "sent" | "viewed" | "signed" | "expired";
export type InvoiceStatus = "draft" | "sent" | "viewed" | "paid" | "overdue" | "cancelled";
export type ActivityType = "note" | "call" | "email" | "meeting" | "status_change" | "system";
export type ClientInviteRequestStatus = "pending" | "approved" | "rejected";

export interface DbUser {
  id: string;
  clerk_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: UserRole;
  phone: string | null;
  company_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  source: string | null;
  status: LeadStatus;
  estimated_value: number;
  notes: string | null;
  owner_id: string | null;
  converted_client_id: string | null;
  created_at: string;
  updated_at: string;
  owner?: DbUser | null;
}

export interface Deal {
  id: string;
  title: string;
  lead_id: string | null;
  client_id: string | null;
  stage: DealStage;
  amount: number;
  close_date: string | null;
  notes: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  owner?: DbUser | null;
  lead?: Lead | null;
}

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  status: ClientStatus;
  primary_user_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  client_id: string;
  status: ProjectStatus;
  progress: number;
  start_date: string | null;
  target_launch_date: string | null;
  assigned_to: string | null;
  deal_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  client?: Client | null;
}

export interface Deliverable {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  file_url: string | null;
  file_name: string | null;
  preview_url: string | null;
  version: number;
  status: DeliverableStatus;
  uploaded_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Feedback {
  id: string;
  deliverable_id: string;
  author_id: string;
  comment: string;
  resolved: boolean;
  created_at: string;
  author?: DbUser | null;
}

export interface Contract {
  id: string;
  title: string;
  client_id: string;
  project_id: string | null;
  file_url: string | null;
  file_name: string | null;
  status: ContractStatus;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  signature_data: Record<string, unknown> | null;
  signer_ip: string | null;
  signer_user_agent: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  client?: Client | null;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  title: string;
  description: string | null;
  client_id: string;
  project_id: string | null;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  due_date: string | null;
  paid_at: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  client?: Client | null;
}

export interface Activity {
  id: string;
  type: ActivityType;
  body: string;
  lead_id: string | null;
  deal_id: string | null;
  client_id: string | null;
  project_id: string | null;
  author_id: string | null;
  created_at: string;
  author?: DbUser | null;
}

export interface MaintenancePlan {
  id: string;
  client_id: string;
  name: string;
  monthly_amount: number;
  status: "active" | "paused" | "cancelled";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientInviteRequest {
  id: string;
  email: string;
  client_name: string | null;
  note: string | null;
  status: ClientInviteRequestStatus;
  requested_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  requester?: DbUser | null;
  reviewer?: DbUser | null;
}

export interface SalesProfile {
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  calling_from: string | null;
  calling_schedule: string | null;
  target_region: string | null;
  daily_call_goal: number | null;
  weekly_meeting_goal: number | null;
  completed_at: string;
  created_at: string;
  updated_at: string;
  user?: DbUser | null;
}

export const SALES_TARGET_REGIONS = [
  "West Coast",
  "Southwest",
  "Midwest",
  "Southeast",
  "Northeast",
  "National / Remote",
  "Other",
] as const;

export type SalesTargetRegion = (typeof SALES_TARGET_REGIONS)[number];

export const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "won",
  "lost",
];

export const DEAL_STAGES: DealStage[] = [
  "discovery",
  "proposal",
  "negotiation",
  "won",
  "lost",
];

export const PROJECT_STATUSES: ProjectStatus[] = [
  "discovery",
  "wireframing",
  "design",
  "development",
  "revisions",
  "launch",
  "maintenance",
  "completed",
  "on_hold",
];
