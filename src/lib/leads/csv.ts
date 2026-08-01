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

function normalizeHeader(h: string) {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]+/g, "")
    .replace(/[\s-]+/g, "_");
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

function cell(row: string[], index: number): string {
  if (index < 0) return "";
  return (row[index] ?? "").trim();
}

function cleanMultiline(value: string) {
  return value.replace(/\s*\n\s*/g, " — ").replace(/\s+/g, " ").trim();
}

function digitCount(value: string) {
  return (value.match(/\d/g) || []).length;
}

/** True if the value looks like a phone number (not a rating, zip-only, etc.). */
function looksLikePhone(value: string) {
  const v = value.trim();
  if (!v) return false;
  if (/^https?:\/\//i.test(v)) return false;
  if (/@/.test(v)) return false;
  const digits = digitCount(v);
  // US-style and intl: at least 7 digits, allow formatting chars
  if (digits < 7 || digits > 15) return false;
  return /^[\d\s()+.\-extEXT#]+$/.test(v);
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function parseMoney(raw: string): number {
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function scoreBusinessNameHeader(h: string): number {
  const n = normalizeHeader(h);
  if (!n) return 0;
  if (n === "name" || n === "business" || n === "business_name" || n === "company" || n === "company_name") {
    return 100;
  }
  if (n.includes("business") && n.includes("name")) return 90;
  if (n.includes("company") && n.includes("name")) return 90;
  if (n === "organization" || n === "organisation" || n === "org") return 80;
  if (n.includes("business")) return 70;
  if (n.includes("company")) return 70;
  // Prefer plain "name" over first_name / last_name
  if (n === "lead_name" || n === "contact_name" || n === "account_name") return 60;
  if (n.endsWith("_name") && !n.includes("first") && !n.includes("last") && !n.includes("file")) {
    return 40;
  }
  if (n.includes("name") && !n.includes("first") && !n.includes("last") && !n.includes("user")) {
    return 30;
  }
  return 0;
}

function scorePhoneHeader(h: string): number {
  const n = normalizeHeader(h);
  if (!n) return 0;
  if (n === "phone" || n === "phone_number" || n === "telephone" || n === "mobile" || n === "cell" || n === "tel") {
    return 100;
  }
  if (n.includes("phone") || n.includes("mobile") || n.includes("telephone") || n.includes("cell")) {
    return 80;
  }
  if (n === "tel" || n.endsWith("_tel")) return 70;
  return 0;
}

function scoreEmailHeader(h: string): number {
  const n = normalizeHeader(h);
  if (n === "email" || n === "email_address" || n === "e_mail") return 100;
  if (n.includes("email") || n.includes("e_mail")) return 80;
  return 0;
}

function bestColumn(headers: string[], scorer: (h: string) => number): number {
  let bestIdx = -1;
  let bestScore = 0;
  headers.forEach((h, i) => {
    const score = scorer(h);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  });
  return bestScore > 0 ? bestIdx : -1;
}

/** Infer phone column from row values when headers are unclear. */
function inferPhoneColumn(dataRows: string[][], colCount: number, exclude: number): number {
  let bestIdx = -1;
  let bestHits = 0;
  for (let c = 0; c < colCount; c++) {
    if (c === exclude) continue;
    let hits = 0;
    const sample = dataRows.slice(0, Math.min(25, dataRows.length));
    for (const row of sample) {
      if (looksLikePhone(cell(row, c))) hits += 1;
    }
    if (hits > bestHits) {
      bestHits = hits;
      bestIdx = c;
    }
  }
  // Need a clear majority of sample rows looking like phones
  const threshold = Math.max(1, Math.ceil(Math.min(25, dataRows.length) * 0.4));
  return bestHits >= threshold ? bestIdx : -1;
}

/** Infer business-name column: prefer first text-heavy non-phone column. */
function inferBusinessColumn(
  dataRows: string[][],
  colCount: number,
  phoneIdx: number
): number {
  let bestIdx = -1;
  let bestHits = 0;
  for (let c = 0; c < colCount; c++) {
    if (c === phoneIdx) continue;
    let hits = 0;
    const sample = dataRows.slice(0, Math.min(25, dataRows.length));
    for (const row of sample) {
      const v = cell(row, c);
      if (!v) continue;
      if (looksLikePhone(v) || looksLikeEmail(v) || /^https?:\/\//i.test(v)) continue;
      if (v.length >= 2) hits += 1;
    }
    if (hits > bestHits) {
      bestHits = hits;
      bestIdx = c;
    }
  }
  if (bestIdx >= 0) return bestIdx;
  // Absolute fallback: column 0 unless it's the phone column
  return phoneIdx === 0 ? (colCount > 1 ? 1 : -1) : 0;
}

function buildExtraNotes(
  headers: string[],
  row: string[],
  usedCols: Set<number>
): string | null {
  const lines: string[] = [];
  headers.forEach((header, i) => {
    if (usedCols.has(i)) return;
    const value = cleanMultiline(cell(row, i));
    if (!value) return;
    const label = header.trim() || `Column ${i + 1}`;
    lines.push(`${label}: ${value}`);
  });
  const text = lines.join("\n").trim();
  return text ? text.slice(0, 10000) : null;
}

/**
 * Parse a lead CSV in almost any format.
 * Required per row: business name + phone number.
 * Extra columns (maps URL, rating, notes, etc.) are stored in notes.
 */
export function parseLeadCsv(text: string): LeadImportParseResult {
  const table = parseCsv(text);
  if (table.length < 2) {
    throw new Error("CSV needs a header row and at least one data row");
  }

  const headers = table[0].map((h) => h.trim());
  const dataRows = table.slice(1);
  const colCount = Math.max(headers.length, ...dataRows.map((r) => r.length));

  let businessIdx = bestColumn(headers, scoreBusinessNameHeader);
  let phoneIdx = bestColumn(headers, scorePhoneHeader);
  const emailIdx = bestColumn(headers, scoreEmailHeader);
  const sourceIdx = bestColumn(headers, (h) => {
    const n = normalizeHeader(h);
    if (n === "source" || n === "lead_source" || n === "channel" || n === "origin") return 100;
    if (n.includes("source")) return 50;
    return 0;
  });
  const valueIdx = bestColumn(headers, (h) => {
    const n = normalizeHeader(h);
    if (
      n.includes("estimated") ||
      n === "value" ||
      n === "amount" ||
      n === "budget" ||
      n.includes("deal_value")
    ) {
      return 80;
    }
    return 0;
  });
  const firstNameIdx = bestColumn(headers, (h) => {
    const n = normalizeHeader(h);
    if (n === "first_name" || n === "firstname" || n === "first") return 100;
    if (n.includes("first") && n.includes("name")) return 80;
    return 0;
  });
  const lastNameIdx = bestColumn(headers, (h) => {
    const n = normalizeHeader(h);
    if (n === "last_name" || n === "lastname" || n === "surname") return 100;
    if (n.includes("last") && n.includes("name")) return 80;
    return 0;
  });

  if (phoneIdx < 0) {
    phoneIdx = inferPhoneColumn(dataRows, colCount, businessIdx);
  }
  if (businessIdx < 0) {
    businessIdx = inferBusinessColumn(dataRows, colCount, phoneIdx);
  }

  // CRM-style first/last only (no company/name): treat combined person name as business label
  if (businessIdx < 0 && firstNameIdx >= 0) {
    businessIdx = firstNameIdx;
  }

  if (businessIdx < 0 || phoneIdx < 0) {
    throw new Error(
      `CSV must have a business name column and a phone column. Found headers: ${
        headers.filter(Boolean).join(", ") || "(none)"
      }`
    );
  }

  const rows: LeadImportRow[] = [];
  const skipped: { line: number; reason: string }[] = [];

  for (let r = 0; r < dataRows.length; r++) {
    const line = r + 2; // 1-based + header
    const raw = dataRows[r];

    let company_name = cleanMultiline(cell(raw, businessIdx));
    const firstFromCol = cleanMultiline(cell(raw, firstNameIdx));
    const lastFromCol = cleanMultiline(cell(raw, lastNameIdx)) || null;

    // If business col is first_name, combine with last_name when present
    if (
      businessIdx === firstNameIdx &&
      firstFromCol &&
      lastFromCol &&
      !company_name.includes(lastFromCol)
    ) {
      company_name = `${firstFromCol} ${lastFromCol}`.trim();
    }

    const phoneRaw = cleanMultiline(cell(raw, phoneIdx));
    const emailRaw = emailIdx >= 0 ? cell(raw, emailIdx).trim() : "";
    const email =
      emailRaw && looksLikeEmail(emailRaw) ? emailRaw.toLowerCase() : null;

    if (!company_name) {
      skipped.push({ line, reason: "Missing business name" });
      continue;
    }
    if (!phoneRaw || !looksLikePhone(phoneRaw)) {
      skipped.push({
        line,
        reason: phoneRaw ? `Invalid phone: ${phoneRaw}` : "Missing phone number",
      });
      continue;
    }

    const used = new Set<number>([businessIdx, phoneIdx]);
    if (emailIdx >= 0) used.add(emailIdx);
    if (sourceIdx >= 0) used.add(sourceIdx);
    if (valueIdx >= 0) used.add(valueIdx);
    if (firstNameIdx >= 0 && firstNameIdx !== businessIdx) used.add(firstNameIdx);
    if (lastNameIdx >= 0 && lastNameIdx !== businessIdx) used.add(lastNameIdx);

    const notes = buildExtraNotes(headers, raw, used);
    const source =
      (sourceIdx >= 0 ? cell(raw, sourceIdx).trim() : "") || "Cold outreach";
    const estimated_value =
      valueIdx >= 0 ? parseMoney(cell(raw, valueIdx)) : 0;

    rows.push({
      first_name: company_name.slice(0, 128),
      last_name: null,
      email: email ? email.slice(0, 320) : null,
      phone: phoneRaw.slice(0, 64),
      company_name: company_name.slice(0, 256),
      source: source.slice(0, 128),
      estimated_value,
      notes,
      status: "new",
    });
  }

  if (rows.length === 0) {
    const hint =
      skipped[0]?.reason ||
      "Each row needs a business name and a valid phone number";
    throw new Error(`No valid leads found — ${hint}`);
  }

  return { rows, skipped, headers };
}

export const LEAD_CSV_TEMPLATE = `Name,Phone,Address,Category,Rating,Reviews,Website,Maps URL
Bay Area Pressure Pros,(925) 549-9442,Pressure washing service,,5.0,86,Yes,https://maps.example.com
Sampas Cleaning Services,(510) 491-7824,Pressure washing service,,4.9,29,Yes,https://maps.example.com
`;
