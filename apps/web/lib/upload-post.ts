// apps/web/lib/upload-post.ts
//
// Thin server-side client for Upload-post (https://api.upload-post.com).
//
// WHY THIS SHAPE
// --------------
// SeekPeak is the source of truth for what goes out and who approved it.
// The OAuth tokens for a dozen social networks live in Upload-post, which
// already solved that problem — rebuilding it inside a task manager would be
// months of token-refresh plumbing for no product gain.
//
// Everything here is deliberately defensive:
//   * If UPLOAD_POST_API_KEY is unset the module NEVER throws at import time —
//     publishing simply reports "not configured" and the rest of the app is
//     unaffected. A task tool must not fail to boot because a marketing
//     integration is missing.
//   * Hard timeout on every call. A hung upstream must not hold a request
//     open until the reverse proxy kills it.
//   * No retries on 4xx. A rejected post is a content problem, and retrying
//     it just burns the monthly quota.
//
// Env:
//   UPLOAD_POST_API_KEY   required to publish at all
//   UPLOAD_POST_USER      default profile ("user") to post as
//   PUBLISH_ENABLED       must be exactly "true" for the unattended sweep

import { log } from "./log";

const API_BASE = "https://api.upload-post.com/api";
const TIMEOUT_MS = 45_000;

/** Channels SeekPeak tracks that Upload-post can actually post to. */
const CHANNEL_TO_PLATFORM: Record<string, string> = {
  instagram: "instagram",
  linkedin: "linkedin",
  youtube: "youtube",
  x: "x",
  reddit: "reddit",
  facebook: "facebook",
  tiktok: "tiktok",
  // email / google_ads / webinar / blog are tracked in the pipeline but go out
  // through other systems — they are marked published by hand.
};

/** Platforms that accept a post with no media attached. */
const TEXT_CAPABLE = new Set(["x", "linkedin", "facebook", "reddit"]);

/** Platforms that REQUIRE media — posting text alone is rejected upstream. */
const MEDIA_REQUIRED = new Set(["instagram", "tiktok", "youtube"]);

export function platformForChannel(channel: string | null): string | null {
  if (!channel) return null;
  return CHANNEL_TO_PLATFORM[channel] ?? null;
}

export function isPublishableChannel(channel: string | null): boolean {
  return platformForChannel(channel) !== null;
}

export function isPublishConfigured(): boolean {
  return Boolean(process.env.UPLOAD_POST_API_KEY && process.env.UPLOAD_POST_USER);
}

/** The unattended sweep is OFF unless explicitly switched on. */
export function isAutoPublishEnabled(): boolean {
  return process.env.PUBLISH_ENABLED === "true" && isPublishConfigured();
}

export type PublishMedia = { url: string; mime: string | null };

export type PublishInput = {
  channel: string;
  /** Caption / post body. */
  title: string;
  /** Long body — only meaningful for Reddit. */
  description?: string | null;
  media?: PublishMedia[];
  /** Hashtags/links posted immediately after — standard on Instagram. */
  firstComment?: string | null;
  /** Upload-post profile to post as; falls back to UPLOAD_POST_USER. */
  profile?: string | null;
  /** ISO-8601. When set, Upload-post holds the post until then. */
  scheduledAt?: string | null;
};

export type PublishResult = {
  ok: boolean;
  /** Live post URL when the platform returned one. */
  url?: string;
  /** request_id / job_id for later status polling. */
  ref?: string;
  error?: string;
  /** True when the post was accepted for LATER delivery, not posted now. */
  scheduled?: boolean;
};

function isVideo(m: PublishMedia): boolean {
  if (m.mime?.startsWith("video/")) return true;
  return /\.(mp4|mov|m4v|webm)(\?|$)/i.test(m.url);
}

function isImage(m: PublishMedia): boolean {
  if (m.mime?.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|heic)(\?|$)/i.test(m.url);
}

/**
 * Decide which of the three Upload-post endpoints a post belongs on, and
 * validate the combination BEFORE spending an API call (and a quota unit) on
 * something that will certainly be rejected.
 */
function planUpload(
  platform: string,
  media: PublishMedia[],
): { endpoint: string; kind: "text" | "photos" | "video" } | { error: string } {
  const videos = media.filter(isVideo);
  const images = media.filter(isImage);

  if (videos.length > 0) return { endpoint: "upload", kind: "video" };
  if (images.length > 0) return { endpoint: "upload_photos", kind: "photos" };

  if (MEDIA_REQUIRED.has(platform)) {
    return {
      error: `${platform} needs an image or video attached to the task before it can be published.`,
    };
  }
  if (!TEXT_CAPABLE.has(platform)) {
    return { error: `Publishing to ${platform} without media is not supported.` };
  }
  return { endpoint: "upload_text", kind: "text" };
}

/**
 * Upload-post answers in several shapes depending on sync/async/scheduled.
 * Normalise once, here, so callers never parse vendor JSON.
 */
function readResponse(platform: string, body: unknown): PublishResult {
  const b = (body ?? {}) as Record<string, unknown>;

  if (b.success === false) {
    const msg = (b.message ?? b.error ?? "Upload-post rejected the post.") as string;
    return { ok: false, error: String(msg) };
  }

  // Scheduled / queued
  const jobId = b.job_id ?? b.request_id;
  if (b.job_id) return { ok: true, ref: String(b.job_id), scheduled: true };

  // Per-platform results on the synchronous path
  const results = b.results as Record<string, { success?: boolean; url?: string; error?: string }> | undefined;
  const mine = results?.[platform];
  if (mine) {
    if (mine.success === false) {
      return { ok: false, error: mine.error ?? `${platform} rejected the post.` };
    }
    return { ok: true, url: mine.url, ref: jobId ? String(jobId) : undefined };
  }

  // Async accepted — nothing to show yet but a reference to poll.
  if (jobId) return { ok: true, ref: String(jobId) };

  return { ok: true };
}

export async function publish(input: PublishInput): Promise<PublishResult> {
  const apiKey = process.env.UPLOAD_POST_API_KEY;
  const profile = (input.profile || process.env.UPLOAD_POST_USER || "").trim();

  if (!apiKey || !profile) {
    return {
      ok: false,
      error: "Publishing is not configured — set UPLOAD_POST_API_KEY and UPLOAD_POST_USER on the server.",
    };
  }

  const platform = platformForChannel(input.channel);
  if (!platform) {
    return { ok: false, error: `${input.channel} is tracked here but published elsewhere — mark it published by hand.` };
  }

  const media = input.media ?? [];
  const plan = planUpload(platform, media);
  if ("error" in plan) return { ok: false, error: plan.error };

  const form = new FormData();
  form.append("user", profile);
  form.append("platform[]", platform);
  // NOT sliced. A caption over the network's limit is a content problem the
  // composer already refuses to save; silently trimming here is how the tail
  // of an X post used to vanish with nobody noticing.
  form.append("title", input.title);
  if (input.firstComment) form.append("first_comment", input.firstComment.slice(0, 2200));
  if (input.description) form.append("description", input.description.slice(0, 10_000));
  if (input.scheduledAt) {
    form.append("scheduled_date", input.scheduledAt);
    form.append("timezone", "Asia/Kolkata");
  }

  if (plan.kind === "video") {
    form.append("video", media.filter(isVideo)[0]!.url);
  } else if (plan.kind === "photos") {
    // Instagram carousels cap at 10.
    for (const m of media.filter(isImage).slice(0, 10)) form.append("photos[]", m.url);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}/${plan.endpoint}`, {
      method: "POST",
      headers: { Authorization: `Apikey ${apiKey}` },
      body: form,
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* non-JSON error page from a proxy — fall through to the status check */
    }

    if (!res.ok) {
      const msg =
        (parsed as { message?: string; error?: string } | null)?.message ??
        (parsed as { message?: string; error?: string } | null)?.error ??
        `Upload-post returned ${res.status}`;
      log.warn("publish.rejected", { platform, status: res.status, error: msg });
      return { ok: false, error: String(msg) };
    }

    const result = readResponse(platform, parsed);
    log.info("publish.result", { platform, ok: result.ok, ref: result.ref, scheduled: result.scheduled });
    return result;
  } catch (e) {
    const err = e as Error;
    const msg = err.name === "AbortError" ? "Upload-post did not respond in time." : err.message;
    log.error("publish.failed", { platform, error: msg });
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}
