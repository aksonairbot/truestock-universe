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

// ---------------------------------------------------------------------------
// Post composer vocabulary (migration 0026)
//
// Learned from Planable / Buffer / SocialPilot: the thing that makes a social
// tool usable is that the COPY is a first-class field with the target network's
// limit enforced while you type, not a paragraph in a task description that
// gets silently truncated at publish time.
// ---------------------------------------------------------------------------

/**
 * Caption limit per channel. 0 = no meaningful limit.
 *
 * These are the network's own caps. Before this existed the publisher sliced
 * captions at 2200 chars for EVERY channel — which quietly destroyed the end
 * of any X post and any long LinkedIn article. Now the limit is visible while
 * writing and the publish path REFUSES rather than truncating.
 */
export const CHANNEL_CAPTION_LIMIT: Record<string, number> = {
  instagram: 2200,
  linkedin: 3000,
  youtube: 5000,
  x: 280,
  reddit: 40000,
  facebook: 63206,
  tiktok: 2200,
  email: 0,
  google_ads: 0,
  webinar: 0,
  blog: 0,
};

/** Channels where a "first comment" is a real, used convention (hashtags). */
export const CHANNEL_SUPPORTS_FIRST_COMMENT = new Set(["instagram", "linkedin", "facebook", "tiktok"]);

export function captionLimit(channel: string | null): number {
  if (!channel) return 0;
  return CHANNEL_CAPTION_LIMIT[channel] ?? 0;
}

/**
 * Content pillars — what KIND of post this is.
 *
 * Not decoration: a feed that is 70% promotion stops working, and for a
 * SEBI-regulated firm the promotional share is also the share that needs
 * disclaimers. Tagging the pillar is what makes that ratio visible on the
 * campaign plan instead of being something you notice a quarter late.
 */
export const CONTENT_PILLARS = [
  { value: "education",    label: "Education",    color: "#0A84FF" },
  { value: "market_update", label: "Market update", color: "#5E5CE6" },
  { value: "product",      label: "Product",      color: "#34C759" },
  { value: "brand",        label: "Brand",        color: "#FF9F0A" },
  { value: "promotion",    label: "Promotion",    color: "#FF453A" },
  { value: "community",    label: "Community",    color: "#64D2FF" },
] as const;

export type ContentPillar = (typeof CONTENT_PILLARS)[number]["value"];

export const PILLAR_LABEL: Record<string, string> = Object.fromEntries(
  CONTENT_PILLARS.map((p) => [p.value, p.label]),
);
export const PILLAR_COLOR: Record<string, string> = Object.fromEntries(
  CONTENT_PILLARS.map((p) => [p.value, p.color]),
);

export function isPillar(v: string): v is ContentPillar {
  return CONTENT_PILLARS.some((p) => p.value === v);
}

/**
 * Count characters the way the networks do — by code POINTS, not UTF-16 code
 * units. An emoji is one character to a person and to Instagram, but two to
 * JavaScript's `.length`. Getting this wrong makes the counter lie on exactly
 * the posts most likely to be near the limit.
 */
export function countChars(s: string): number {
  return [...(s ?? "")].length;
}
