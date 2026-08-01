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

const HEADER_ALIASES = {
  first_name: [
    "first_name",
    "firstname",
    "first",
    "first name",
    "given_name",
    "given name",
  ],
  last_name: [
    "last_name",
    "lastname",
    "last",
    "last name",
    "surname",
    "family_name",
    "family name",
  ],
  full_name: [
    "full_name",
    "full name",
    "name",
    "contact",
    "contact_name",
    "contact name",
    "lead_name",
    "lead name",
  ],
  email: ["email", "email_address", "email address", "e-mail", "mail"],
  phone: [
    "phone",
    "phone_number",
    "phone number",
    "mobile",
    "cell",
    "telephone",
    "tel",
  ],
  company_name: [
    "company_name",
    "company",
    "business",
    "business_name",
    "business name",
    "organization",
    "organisation",
    "business name",
  ],
  source: ["source", "lead_source", "lead source", "origin", "channel"],
  estimated_value: [
    "estimated_value",
    "est_value",
    "est. value",
    "value",
    "amount",
    "deal_value",
    "deal value",
    "budget",
  ],
  notes: ["notes", "note", "comments", "comment", "description", "details"],
  status: ["status", "stage", "pipeline_status"],
  // Cold-caller / Google Maps scrap lists (Name, Phone, Address, Category, …)
  category: ["category", "type", "service", "industry"],
  address: ["address", "location", "area"],
  rating: ["rating", "stars", "google_rating"],
  reviews: ["reviews", "review_count", "review count", "num_reviews"],
  has_website: ["website", "has_website", "has website"],
  maps_url: [
    "maps_url",
    "maps url",
    "google_maps",
    "google maps",
    "map_url",
    "map url",
    "maps link",
    "google maps url",
  ],
  cold_call_script: [
    "cold_call_script",
    "cold call script",
    "script",
    "call_script",
    "call script",
  ],
  website_prompt: [
    "website_prompt",
    "website prompt",
    "site_prompt",
    "prompt",
  ],
} as const;

const VALID_STATUSES = new Set<LeadStatus>([
  "new",
  "contacted",
  "qualified",
  "proposal",
  "won",
  "lost",
]);

function normalizeHeader(h: string) {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]+/g, "")
    .replace(/[\s-]+/g, "_");
}

function resolveColumn(headers: string[], aliases: readonly string[]): number {
  const normalized = headers.map(normalizeHeader);
  const aliasSet = new Set(aliases.map(normalizeHeader));
  return normalized.findIndex((h) => aliasSet.has(h));
}

/** Minimal CSV parser with quoted-field support (incl. newlines in quotes). */
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

function cleanMultiline(value: string) {
  return value.replace(/\s*\n\s*/g, " — ").replace(/\s+/g, " ").trim();
}

function isYesNo(value: string) {
  const v = value.trim().toLowerCase();
  return v === "yes" || v === "no" || v === "y" || v === "n" || v === "true" || v === "false";
}

/**
 * Google Maps / cold-caller exports use Name + Phone + Maps URL (etc.),
 * where Name is a business, not a person's name.
 */
function isColdCallerFormat(headers: string[]) {
  const normalized = headers.map(normalizeHeader);
  const has = (key: string) => normalized.includes(key);
  const hasNameLike = normalized.some(
    (h) =>
      h === "name" ||
      h === "business" ||
      h === "business_name" ||
      h === "company" ||
      h === "company_name"
  );
  const looksLikeMapsExport =
    has("maps_url") ||
    has("google_maps") ||
    has("maps") ||
    (has("category") && has("rating")) ||
    (has("phone") && has("address") && has("website")) ||
    (has("phone") && has("reviews") && has("rating"));

  // Name/Phone/Maps scrap lists, or Phone+Maps even if Name header is odd
  return looksLikeMapsExport && (hasNameLike || has("phone"));
}

/**
 * Resolve the business/person name column for scrap lists.
 * Falls back to the first column when headers are Name/Phone/Maps-style.
 */
function resolveNameColumn(headers: string[], scrapFormat: boolean): number {
  const byAlias = resolveColumn(headers, HEADER_ALIASES.full_name);
  if (byAlias >= 0) return byAlias;

  const normalized = headers.map(normalizeHeader);
  const direct = normalized.findIndex(
    (h) =>
      h === "name" ||
      h === "business" ||
      h === "business_name" ||
      h === "company" ||
      h === "company_name"
  );
  if (direct >= 0) return direct;

  // Cold-caller exports always put the business name first
  if (scrapFormat && headers.length > 0) return 0;
  return -1;
}

function buildScrapNotes(parts: Record<string, string>): string | null {
  const lines: string[] = [];
  if (parts.category) lines.push(`Category: ${cleanMultiline(parts.category)}`);
  if (parts.address) {
    // In these exports "Address" is often the service line (e.g. "Pressure washing service")
    lines.push(`Service/area: ${cleanMultiline(parts.address)}`);
  }
  if (parts.rating) {
    const reviews = parts.reviews ? ` (${parts.reviews} reviews)` : "";
    lines.push(`Rating: ${parts.rating}${reviews}`);
  } else if (parts.reviews) {
    lines.push(`Reviews: ${parts.reviews}`);
  }
  if (parts.has_website) {
    lines.push(
      isYesNo(parts.has_website)
        ? `Has website: ${parts.has_website}`
        : `Website: ${parts.has_website}`
    );
  }
  if (parts.maps_url) lines.push(`Maps: ${parts.maps_url}`);
  if (parts.cold_call_script) {
    lines.push(`Cold call script:\n${parts.cold_call_script}`);
  }
  if (parts.website_prompt) {
    lines.push(`Website prompt:\n${parts.website_prompt}`);
  }
  if (parts.extra_notes) lines.push(parts.extra_notes);
  const text = lines.join("\n").trim();
  return text ? text.slice(0, 10000) : null;
}

/**
 * Parse a lead CSV. Header row required. Flexible column names.
 * Supports CRM templates and cold-caller scrap lists (Name/Phone/Maps URL/…).
 * At least one of first name, full name, email, or company is required per row.
 */
export function parseLeadCsv(text: string): LeadImportParseResult {
  const table = parseCsv(text);
  if (table.length < 2) {
    throw new Error("CSV needs a header row and at least one lead row");
  }

  const headers = table[0].map((h) => h.trim());
  const scrapFormat = isColdCallerFormat(headers);

  const cols = {
    first_name: scrapFormat
      ? -1
      : resolveColumn(headers, HEADER_ALIASES.first_name),
    last_name: scrapFormat
      ? -1
      : resolveColumn(headers, HEADER_ALIASES.last_name),
    full_name: resolveNameColumn(headers, scrapFormat),
    email: resolveColumn(headers, HEADER_ALIASES.email),
    phone: resolveColumn(headers, HEADER_ALIASES.phone),
    company_name: scrapFormat
      ? -1
      : resolveColumn(headers, HEADER_ALIASES.company_name),
    source: resolveColumn(headers, HEADER_ALIASES.source),
    estimated_value: resolveColumn(headers, HEADER_ALIASES.estimated_value),
    notes: resolveColumn(headers, HEADER_ALIASES.notes),
    status: resolveColumn(headers, HEADER_ALIASES.status),
    category: resolveColumn(headers, HEADER_ALIASES.category),
    address: resolveColumn(headers, HEADER_ALIASES.address),
    rating: resolveColumn(headers, HEADER_ALIASES.rating),
    reviews: resolveColumn(headers, HEADER_ALIASES.reviews),
    has_website: resolveColumn(headers, HEADER_ALIASES.has_website),
    maps_url: resolveColumn(headers, HEADER_ALIASES.maps_url),
    cold_call_script: resolveColumn(headers, HEADER_ALIASES.cold_call_script),
    website_prompt: resolveColumn(headers, HEADER_ALIASES.website_prompt),
  };

  if (
    cols.first_name < 0 &&
    cols.full_name < 0 &&
    cols.email < 0 &&
    cols.company_name < 0
  ) {
    throw new Error(
      `CSV must include a Name, First name, Email, or Company column (found: ${headers.join(", ") || "none"})`
    );
  }

  const rows: LeadImportRow[] = [];
  const skipped: { line: number; reason: string }[] = [];

  for (let r = 1; r < table.length; r++) {
    const line = r + 1;
    const raw = table[r];

    const nameField = cell(raw, cols.full_name);
    let first = cell(raw, cols.first_name);
    let last = cell(raw, cols.last_name) || null;
    let company_name = cell(raw, cols.company_name) || null;

    if (scrapFormat && nameField) {
      company_name = company_name || nameField;
      if (!first) {
        first = nameField.slice(0, 128);
        last = null;
      }
    } else if (!first && nameField) {
      const split = splitFullName(nameField);
      first = split.first;
      last = last || split.last;
    }

    const email = cell(raw, cols.email) || null;
    const phone = cell(raw, cols.phone) || null;
    const source = cell(raw, cols.source) || null;
    const estimated_value = parseMoney(cell(raw, cols.estimated_value));
    const statusRaw = cell(raw, cols.status).toLowerCase();
    const status: LeadStatus =
      statusRaw && VALID_STATUSES.has(statusRaw as LeadStatus)
        ? (statusRaw as LeadStatus)
        : "new";

    const scrapNotes = scrapFormat
      ? buildScrapNotes({
          category: cell(raw, cols.category),
          address: cell(raw, cols.address),
          rating: cell(raw, cols.rating),
          reviews: cell(raw, cols.reviews),
          has_website: cell(raw, cols.has_website),
          maps_url: cell(raw, cols.maps_url),
          cold_call_script: cell(raw, cols.cold_call_script),
          website_prompt: cell(raw, cols.website_prompt),
          extra_notes: cell(raw, cols.notes),
        })
      : null;

    const notes = scrapNotes || cell(raw, cols.notes) || null;

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
      source: source
        ? source.slice(0, 128)
        : scrapFormat
          ? "Cold outreach"
          : null,
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
