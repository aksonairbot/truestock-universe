/**
 * Format a paise amount as Indian-style rupee money (with L/Cr suffixes for
 * large numbers). Handles negative + zero + bigint inputs.
 *
 * 49900          → ₹499
 * 482_34_567_00  → ₹4.82 Cr    (4,82,34,567 paise = 48,234,567 rupees)
 * 82_34_567_00   → ₹82.35 L    (82,34,567 paise = 8,234,567 rupees)
 * 34_567_00      → ₹34,567
 */
export function formatInrFromPaise(
  paise: bigint | number | null | undefined,
  opts: { precision?: number; withSymbol?: boolean; compact?: boolean } = {},
): string {
  if (paise == null) return "—";
  const p = typeof paise === "bigint" ? paise : BigInt(Math.round(paise));
  const negative = p < 0n;
  const abs = negative ? -p : p;
  const rupees = Number(abs) / 100;
  const compact = opts.compact !== false; // default on
  const precision = opts.precision ?? 2;
  const symbol = opts.withSymbol === false ? "" : "₹";

  let body: string;
  if (compact && rupees >= 1_00_00_000) {
    body = (rupees / 1_00_00_000).toFixed(precision) + " Cr";
  } else if (compact && rupees >= 1_00_000) {
    body = (rupees / 1_00_000).toFixed(precision) + " L";
  } else if (compact && rupees >= 1_000) {
    // Indian grouping: 12,34,567
    body = rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  } else {
    body = rupees.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }

  return `${negative ? "-" : ""}${symbol}${body}`;
}

export function formatDelta(value: number | null | undefined, suffix = "%"): string {
  if (value == null || Number.isNaN(value)) return "—";
  const prefix = value > 0 ? "▲" : value < 0 ? "▼" : "●";
  return `${prefix} ${Math.abs(value).toFixed(1)}${suffix}`;
}

export function formatDateShort(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { month: "short", day: "numeric", timeZone: "Asia/Kolkata" });
}

export function formatRelative(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const diffMs = Date.now() - date.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 14) return `${day}d ago`;
  return formatDateShort(date);
}
