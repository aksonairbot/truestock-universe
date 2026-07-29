// apps/web/lib/content.ts
//
// Shared vocabulary for the content pipeline. Channels and stages live here
// so the task editor, the calendar and the pipeline board can never drift
// apart. Colours reuse the existing palette tokens — one design system.

export const CONTENT_CHANNELS = [
  { value: "instagram",  label: "Instagram",  color: "#E1306C" },
  { value: "linkedin",   label: "LinkedIn",   color: "#0A66C2" },
  { value: "youtube",    label: "YouTube",    color: "#FF0033" },
  { value: "x",          label: "X",          color: "var(--text-2)" },
  { value: "reddit",     label: "Reddit",     color: "#FF4500" },
  { value: "facebook",   label: "Facebook",   color: "#1877F2" },
  { value: "tiktok",     label: "TikTok",     color: "#25F4EE" },
  { value: "email",      label: "Email",      color: "var(--warning)" },
  { value: "google_ads", label: "Google Ads", color: "#34A853" },
  { value: "webinar",    label: "Webinar",    color: "var(--accent-2)" },
  { value: "blog",       label: "Blog",       color: "var(--info)" },
] as const;

export type ContentChannel = (typeof CONTENT_CHANNELS)[number]["value"];

/** Idea → Script → Design → Review → Scheduled → Published */
export const CONTENT_STAGES = [
  { value: "idea",      label: "Idea",      color: "var(--text-3)" },
  { value: "script",    label: "Script",    color: "#60A5FA" },
  { value: "design",    label: "Design",    color: "var(--accent)" },
  { value: "review",    label: "Review",    color: "var(--warning)" },
  { value: "scheduled", label: "Scheduled", color: "var(--info)" },
  { value: "published", label: "Published", color: "var(--success)" },
] as const;

export type ContentStage = (typeof CONTENT_STAGES)[number]["value"];

export const CHANNEL_LABEL: Record<string, string> = Object.fromEntries(
  CONTENT_CHANNELS.map((c) => [c.value, c.label]),
);
export const CHANNEL_COLOR: Record<string, string> = Object.fromEntries(
  CONTENT_CHANNELS.map((c) => [c.value, c.color]),
);
export const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  CONTENT_STAGES.map((s) => [s.value, s.label]),
);
export const STAGE_COLOR: Record<string, string> = Object.fromEntries(
  CONTENT_STAGES.map((s) => [s.value, s.color]),
);

export function isChannel(v: string): v is ContentChannel {
  return CONTENT_CHANNELS.some((c) => c.value === v);
}
export function isStage(v: string): v is ContentStage {
  return CONTENT_STAGES.some((s) => s.value === v);
}

/** "2026-07-28" + "14:30" (IST wall clock) → Date. */
export function istDateTimeToUtc(dateStr: string, timeStr: string): Date {
  const time = /^\d{2}:\d{2}$/.test(timeStr) ? timeStr : "10:00";
  return new Date(`${dateStr}T${time}:00+05:30`);
}

/** Date → { date: "YYYY-MM-DD", time: "HH:MM" } in IST. */
export function utcToIstParts(d: Date): { date: string; time: string } {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
  return { date, time };
}
