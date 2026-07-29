// apps/web/lib/campaigns.ts
//
// Single source of truth for campaign vocabulary and money parsing.
//
// A campaign is the unit a marketing team plans in — a push with an
// objective, a window, a budget and a set of channels. It cuts ACROSS
// products, which is precisely why it isn't a project:
//
//   project  = which product the work belongs to (StockBee, Bloom Algo…)
//   campaign = which push the work is part of, whatever the product

export const CAMPAIGN_STATUSES = [
  { value: "planning", label: "Planning", color: "#8E8E93" },
  { value: "live", label: "Live", color: "#34C759" },
  { value: "done", label: "Done", color: "#0A84FF" },
  { value: "cancelled", label: "Cancelled", color: "#5E5E63" },
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]["value"];

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  CAMPAIGN_STATUSES.map((s) => [s.value, s.label]),
);
export const CAMPAIGN_STATUS_COLOR: Record<string, string> = Object.fromEntries(
  CAMPAIGN_STATUSES.map((s) => [s.value, s.color]),
);

export function isCampaignStatus(v: string): v is CampaignStatus {
  return CAMPAIGN_STATUSES.some((s) => s.value === v);
}

/**
 * Parse a human budget into paise.
 *
 * People type money the way they say it, so accept it: "50000", "50,000",
 * "₹50,000", "1.5L", "2 Cr", "12.5 l". Anything unparseable throws rather
 * than silently becoming zero — a budget that quietly reads as ₹0 is worse
 * than an error message.
 *
 * Returns bigint paise. Empty input → 0n.
 */
export function rupeesToPaise(input: string): bigint {
  const raw = (input ?? "").trim();
  if (!raw) return 0n;

  const cleaned = raw.replace(/[₹,\s]/g, "");
  const m = /^(\d+(?:\.\d+)?)(cr|crore|l|lakh|lac|k)?$/i.exec(cleaned);
  if (!m) throw new Error(`"${raw}" is not an amount I can read. Try 50000, 50,000, 1.5L or 2Cr.`);

  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0) throw new Error("Budget must be a positive amount.");

  const unit = (m[2] ?? "").toLowerCase();
  const multiplier =
    unit === "cr" || unit === "crore" ? 1_00_00_000 : unit === "l" || unit === "lakh" || unit === "lac" ? 1_00_000 : unit === "k" ? 1_000 : 1;

  const rupees = n * multiplier;
  if (rupees > 1_000_00_00_000) throw new Error("That budget looks like a typo — cap is ₹1000 Cr.");

  // Round at the paise boundary, not before: 0.005 rupees must not vanish.
  return BigInt(Math.round(rupees * 100));
}

/** Plain rupee string for prefilling an input (no symbol, no compaction). */
export function paiseToRupeeInput(paise: bigint | number | null | undefined): string {
  if (paise == null) return "";
  const p = typeof paise === "bigint" ? paise : BigInt(Math.round(paise));
  if (p === 0n) return "";
  const rupees = Number(p) / 100;
  return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
}

/** IST "today" as YYYY-MM-DD — campaigns are planned in local dates. */
export function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Inclusive list of ISO week-start dates (Mondays) covering a date range. */
export function weekStarts(startISO: string, endISO: string, cap = 26): string[] {
  const start = new Date(`${startISO}T12:00:00Z`);
  const end = new Date(`${endISO}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];

  // Rewind to the Monday of the first week.
  const dow = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - dow);

  const out: string[] = [];
  for (let d = new Date(start); d <= end && out.length < cap; d.setUTCDate(d.getUTCDate() + 7)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** "12 Aug" — short label for a week column header. */
export function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Which week-start does this instant fall into, in IST? */
export function weekStartOf(d: Date): string {
  const ist = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const day = new Date(`${ist}T12:00:00Z`);
  const dow = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - dow);
  return day.toISOString().slice(0, 10);
}
