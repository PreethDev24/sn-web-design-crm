import type { LeadStatus } from "@/lib/types";

export type LeadImportRow = {
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  source: string | null;
  estimated_value: number;
  notes: string | null;
  status: LeadStatus;
};

export type LeadImportParseResult = {
  rows: LeadImportRow[];
  skipped: { line: number; reason: string }[];
  headers: string[];
};

const HEADER_ALIASES: Record<keyof Omit<LeadImportRow, "status" | "estimated_value"> | "estimated_value" | "full_name" | "status", string[]> = {
  first_name: ["first_name", "firstname", "first", "first name", "given_name", "given name"],
  last_name: ["last_name", "lastname", "last", "last name", "surname", "family_name", "family name"],
  full_name: ["full_name", "fullname", "contact", "contact_name", "contact name", "lead_name", "lead name"],
  email: ["email", "email_address", "email address", "e-mail", "mail"],
  phone: ["phone", "phone_number", "phone number", "mobile", "cell", "telephone", "tel"],
  company_name: ["company_name", "company", "business", "business_name", "business name", "organization", "organisation"],
  source: ["source", "lead_source", "lead source", "origin", "channel"],
  estimated_value: ["estimated_value", "est_value", "est. value", "value", "amount", "deal_value", "deal value", "budget"],
  notes: ["notes", "note", "comments", "comment", "description", "details"],
  status: ["status", "stage", "pipeline_status"],
};

const VALID_STATUSES = new Set<LeadStatus>([
  "new",
  "contacted",
  "qualified",
  "proposal",
  "won",
  "lost",
]);

function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function resolveColumn(
  headers: string[],
  aliases: string[]
): number {
  const normalized = headers.map(normalizeHeader);
  const aliasSet = new Set(aliases.map(normalizeHeader));
  return normalized.findIndex((h) => aliasSet.has(h));
}

/** Minimal CSV parser with quoted-field support. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };
  const pushRow = () => {
    // skip fully empty trailing lines
    if (row.length === 1 && row[0] === "" && rows.length > 0) {
      row = [];
      return;
    }
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };

  const input = text.replace(/^\uFEFF/, "");
  while (i < input.length) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushCell();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushCell();
      pushRow();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  pushCell();
  pushRow();
  return rows;
}

function splitFullName(full: string): { first: string; last: string | null } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function parseMoney(raw: string): number {
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function cell(row: string[], index: number): string {
  if (index < 0) return "";
  return (row[index] ?? "").trim();
}

/**
 * Parse a lead CSV. Header row required. Flexible column names.
 * At least one of first name, full name, email, or company is required per row.
 */
export function parseLeadCsv(text: string): LeadImportParseResult {
  const table = parseCsv(text);
  if (table.length < 2) {
    throw new Error("CSV needs a header row and at least one lead row");
  }

  const headers = table[0].map((h) => h.trim());
  const cols = {
    first_name: resolveColumn(headers, HEADER_ALIASES.first_name),
    last_name: resolveColumn(headers, HEADER_ALIASES.last_name),
    full_name: resolveColumn(headers, HEADER_ALIASES.full_name),
    email: resolveColumn(headers, HEADER_ALIASES.email),
    phone: resolveColumn(headers, HEADER_ALIASES.phone),
    company_name: resolveColumn(headers, HEADER_ALIASES.company_name),
    source: resolveColumn(headers, HEADER_ALIASES.source),
    estimated_value: resolveColumn(headers, HEADER_ALIASES.estimated_value),
    notes: resolveColumn(headers, HEADER_ALIASES.notes),
    status: resolveColumn(headers, HEADER_ALIASES.status),
  };

  if (
    cols.first_name < 0 &&
    cols.full_name < 0 &&
    cols.email < 0 &&
    cols.company_name < 0
  ) {
    throw new Error(
      "CSV must include a First name, Name, Email, or Company column"
    );
  }

  const rows: LeadImportRow[] = [];
  const skipped: { line: number; reason: string }[] = [];

  for (let r = 1; r < table.length; r++) {
    const line = r + 1;
    const raw = table[r];
    let first = cell(raw, cols.first_name);
    let last = cell(raw, cols.last_name) || null;
    const full = cell(raw, cols.full_name);
    if (!first && full) {
      const split = splitFullName(full);
      first = split.first;
      last = last || split.last;
    }

    const email = cell(raw, cols.email) || null;
    const phone = cell(raw, cols.phone) || null;
    const company_name = cell(raw, cols.company_name) || null;
    const source = cell(raw, cols.source) || null;
    const notes = cell(raw, cols.notes) || null;
    const estimated_value = parseMoney(cell(raw, cols.estimated_value));
    const statusRaw = cell(raw, cols.status).toLowerCase();
    const status: LeadStatus =
      statusRaw && VALID_STATUSES.has(statusRaw as LeadStatus)
        ? (statusRaw as LeadStatus)
        : "new";

    if (!first && !email && !company_name) {
      skipped.push({
        line,
        reason: "Missing name, email, and company",
      });
      continue;
    }

    if (!first) {
      first = company_name || email?.split("@")[0] || "Lead";
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      skipped.push({ line, reason: `Invalid email: ${email}` });
      continue;
    }

    rows.push({
      first_name: first.slice(0, 128),
      last_name: last ? last.slice(0, 128) : null,
      email: email ? email.slice(0, 320).toLowerCase() : null,
      phone: phone ? phone.slice(0, 64) : null,
      company_name: company_name ? company_name.slice(0, 256) : null,
      source: source ? source.slice(0, 128) : null,
      estimated_value,
      notes: notes ? notes.slice(0, 10000) : null,
      status,
    });
  }

  return { rows, skipped, headers };
}

export const LEAD_CSV_TEMPLATE = `first_name,last_name,email,phone,company_name,source,estimated_value,notes
Jordan,Lee,jordan@acme.com,555-0100,Acme Coffee,Referral,4500,Wants a new booking site
Sam,Patel,sam@brightco.io,555-0101,Bright Co,Website,3200,
Alex,,alex@example.com,,Solo Studio,Cold outreach,1500,Instagram inquiry
`;
