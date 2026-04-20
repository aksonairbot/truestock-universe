/**
 * Shared parsing + insertion helpers for manual payment entry.
 *
 * Kept free of "use server" so the pure parsing parts can be called from
 * both server actions AND future API routes. Actual DB writes live in the
 * action files and import the helpers here.
 */
import type { ProductMatch } from "@tu/razorpay";

/** Permitted product slugs for manual entry (excludes "universe" + "unknown") */
export const SELECTABLE_PRODUCT_SLUGS = [
  "stock_bee",
  "bloom",
  "high",
  "axe_cap",
] as const;
export type SelectableProductSlug = (typeof SELECTABLE_PRODUCT_SLUGS)[number];

/** Fields the CSV/TSV parser expects, in preferred order. Matches the
 *  column shapes in the existing Data Zone workbook. */
export const CSV_COLUMNS = [
  "date",
  "time",
  "amount_inr",
  "product",
  "description",
  "customer_email",
  "customer_phone",
  "plan_name",
  "razorpay_payment_id",
] as const;

export type ParsedRow = {
  rowNumber: number; // 1-indexed, after header
  rawLine: string;
  // parsed fields (null when absent / invalid)
  capturedAt: Date | null;
  amountPaise: bigint | null;
  productSlug: SelectableProductSlug | null;
  description: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  planName: string | null;
  razorpayPaymentId: string | null;
  // diagnostics
  errors: string[];
  warnings: string[];
};

/**
 * Parse a CSV or TSV paste. Expected header row determines column order.
 * Missing columns are tolerated; unknown columns are ignored.
 * Accepts both comma and tab delimiters (auto-detected).
 */
export function parseCsv(
  input: string,
  opts: { defaultProduct?: SelectableProductSlug } = {},
): { rows: ParsedRow[]; headerErrors: string[] } {
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const headerErrors: string[] = [];
  if (lines.length < 2) {
    headerErrors.push("CSV needs at least a header row and one data row.");
    return { rows: [], headerErrors };
  }

  const delim = detectDelimiter(lines[0]!);
  const header = splitLine(lines[0]!, delim).map((h) => normalizeHeader(h));
  const known = new Set<string>(CSV_COLUMNS);
  const unknown = header.filter((h) => !known.has(h) && h !== "");
  if (unknown.length > 0) {
    headerErrors.push(`unknown columns (ignored): ${unknown.join(", ")}`);
  }

  const hasRequired = header.includes("amount_inr") && (header.includes("date") || header.includes("captured_at"));
  if (!hasRequired) {
    headerErrors.push("missing required columns — need at least `amount_inr` and `date`.");
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i]!;
    const cells = splitLine(rawLine, delim);
    const rec: Record<string, string | undefined> = {};
    for (let j = 0; j < header.length; j++) {
      rec[header[j]!] = cells[j]?.trim();
    }
    rows.push(parseRow(i, rawLine, rec, opts));
  }

  return { rows, headerErrors };
}

function detectDelimiter(headerLine: string): string {
  const tabs = (headerLine.match(/\t/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  return tabs > commas ? "\t" : ",";
}

function splitLine(line: string, delim: string): string[] {
  // Minimal CSV split — handles basic quoted cells. Not a full RFC-4180
  // parser, but good enough for our internal pasted data.
  if (delim === "\t") return line.split("\t");
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === "," && !inQuote) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "")
    .replace(/^_+|_+$/g, "");
}

const SLUG_ALIASES: Record<string, SelectableProductSlug> = {
  stockbee: "stock_bee",
  "stock_bee": "stock_bee",
  "stock bee": "stock_bee",
  bee: "stock_bee",
  sb: "stock_bee",
  bloom: "bloom",
  bloomalgo: "bloom",
  "bloom_algo": "bloom",
  ba: "bloom",
  high: "high",
  axecap: "axe_cap",
  "axe_cap": "axe_cap",
  "axe cap": "axe_cap",
};

function parseSlug(input: string | undefined): SelectableProductSlug | null {
  if (!input) return null;
  const key = input.trim().toLowerCase().replace(/[^\w ]/g, "");
  return SLUG_ALIASES[key] ?? null;
}

function parseAmount(input: string | undefined): bigint | null {
  if (!input) return null;
  // Strip currency symbols, commas, spaces
  const cleaned = input.replace(/[₹,\s]/g, "").replace(/[^\d.\-]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return BigInt(Math.round(n * 100));
}

function parseDateTime(dateStr: string | undefined, timeStr: string | undefined): Date | null {
  if (!dateStr) return null;
  const s = dateStr.trim();

  // Try ISO first
  const iso = new Date(s + (timeStr ? `T${normalizeTime(timeStr)}` : ""));
  if (!Number.isNaN(iso.getTime())) return iso;

  // DD/MM/YYYY (Indian convention, common in the workbook)
  const mDmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mDmy) {
    const [_, d, m, y] = mDmy;
    const dateOnly = new Date(`${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`);
    if (!Number.isNaN(dateOnly.getTime())) {
      if (timeStr) {
        const t = normalizeTime(timeStr);
        return new Date(`${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}T${t}`);
      }
      return dateOnly;
    }
  }
  return null;
}

function normalizeTime(t: string): string {
  const s = t.trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s + "+05:30"; // IST
  if (/^\d{2}:\d{2}$/.test(s)) return s + ":00+05:30";
  return s;
}

function parseRow(
  rowNumber: number,
  rawLine: string,
  rec: Record<string, string | undefined>,
  opts: { defaultProduct?: SelectableProductSlug },
): ParsedRow {
  const errors: string[] = [];
  const warnings: string[] = [];

  const capturedAt = parseDateTime(rec.date ?? rec.captured_at, rec.time);
  if (!capturedAt) errors.push(`row ${rowNumber}: invalid or missing date`);

  const amountPaise = parseAmount(rec.amount_inr);
  if (amountPaise === null) errors.push(`row ${rowNumber}: invalid or missing amount_inr`);

  let productSlug = parseSlug(rec.product);
  if (!productSlug && opts.defaultProduct) {
    productSlug = opts.defaultProduct;
    warnings.push(`row ${rowNumber}: no product column — defaulted to ${opts.defaultProduct}`);
  }
  if (!productSlug) {
    errors.push(`row ${rowNumber}: product is required and must be one of ${SELECTABLE_PRODUCT_SLUGS.join(", ")}`);
  }

  return {
    rowNumber,
    rawLine,
    capturedAt,
    amountPaise,
    productSlug,
    description: rec.description ?? null,
    customerEmail: rec.customer_email ?? null,
    customerPhone: rec.customer_phone ?? null,
    planName: rec.plan_name ?? null,
    razorpayPaymentId: rec.razorpay_payment_id ?? null,
    errors,
    warnings,
  };
}

/** Build a synthetic stable payment_id when the user doesn't supply one.
 *  Uses date + amount + phone/email to dedupe re-pastes of the same CSV. */
export function syntheticPaymentId(row: {
  capturedAt: Date | null;
  amountPaise: bigint | null;
  customerEmail: string | null;
  customerPhone: string | null;
}): string {
  const d = row.capturedAt ? row.capturedAt.toISOString().slice(0, 10).replace(/-/g, "") : "nodate";
  const amt = row.amountPaise?.toString() ?? "0";
  const who = (row.customerEmail ?? row.customerPhone ?? "anon").slice(0, 20);
  // short deterministic hash
  let h = 0;
  const s = `${d}|${amt}|${who}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return `manual_${d}_${Math.abs(h).toString(36)}`;
}

export type InsertSummary = {
  ok: boolean;
  inserted: number;
  skipped: number;
  unmapped: number;
  errors: string[];
};

/** Describe a ProductMatch result in one short word for the UI */
export function describeMatch(m: ProductMatch): string {
  if (m.matchedBy === "plan_name") return "by plan name";
  if (m.matchedBy === "amount_exact") return "exact amount";
  if (m.matchedBy === "amount_fuzzy") return "fuzzy (±tolerance)";
  return "unmapped";
}
