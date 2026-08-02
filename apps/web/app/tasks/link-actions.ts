// apps/web/app/tasks/link-actions.ts
//
// Add/remove external links on a task (Figma file, finished asset, live URL).
// Stage 0 of the content pipeline — useful on its own for design and
// marketing work, and the foundation the campaign/post stages build on.

"use server";

import { revalidatePath } from "next/cache";
import { getDb, taskLinks, eq } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { requireTaskAccess } from "@/lib/access";
import { log } from "@/lib/log";
import { ok, fail, type ActionResult } from "@/lib/action-result";

const LINK_KINDS = ["figma", "asset", "live", "doc", "other"] as const;
type LinkKind = (typeof LINK_KINDS)[number];

/**
 * Only http(s). Blocks javascript:, data:, file: and friends.
 *
 * Returns the reason rather than throwing it, because a thrown message from a
 * server action is redacted by Next in production — "That doesn't look like a
 * valid link" would reach the person as "Something went wrong".
 */
function normalizeUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Paste a link first." };
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (withScheme.length > 2000) return { ok: false, error: "That link is too long (over 2000 characters)." };
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, error: "That doesn't look like a valid link." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http and https links are allowed." };
  }
  return { ok: true, url: parsed.toString() };
}

/** Infer the kind from the host so the common case needs no dropdown. */
function inferKind(url: string, requested: string): LinkKind {
  if ((LINK_KINDS as readonly string[]).includes(requested)) return requested as LinkKind;
  const host = (() => {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
  })();
  if (host.includes("figma.com")) return "figma";
  if (host.includes("docs.google.com") || host.includes("notion.")) return "doc";
  if (
    host.includes("instagram.com") || host.includes("linkedin.com") || host.includes("youtube.com") ||
    host.includes("youtu.be") || host.includes("x.com") || host.includes("twitter.com") ||
    host.includes("reddit.com") || host.includes("facebook.com") || host.includes("tiktok.com")
  ) return "live";
  if (host.includes("drive.google.com") || host.includes("dropbox.com") || host.includes("cdn.")) return "asset";
  return "other";
}

export async function addTaskLink(formData: FormData): Promise<ActionResult> {
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  const urlRaw = ((formData.get("url") as string) ?? "").trim();
  const kindRaw = ((formData.get("kind") as string) ?? "").trim();
  const label = ((formData.get("label") as string) ?? "").trim().slice(0, 120) || null;
  if (!taskId) return fail("This form lost track of which task it belongs to. Reload the page.");

  const me = await getCurrentUser();
  await requireTaskAccess(taskId, me);

  // An `ok` discriminant, not "did it set .error" — TypeScript narrows on a
  // literal, and a truthiness test on a string narrows nothing.
  const normalized = normalizeUrl(urlRaw);
  if (!normalized.ok) return fail(normalized.error);
  const url = normalized.url;
  const kind = inferKind(url, kindRaw);

  const db = getDb();
  await db.insert(taskLinks).values({ taskId, url, kind, label, createdById: me.id });
  log.info("task.link_added", { taskId, kind, actorId: me.id });

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  return ok;
}

export async function removeTaskLink(formData: FormData): Promise<ActionResult> {
  const linkId = ((formData.get("linkId") as string) ?? "").trim();
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  if (!linkId || !taskId) return fail("This form lost track of which link it belongs to. Reload the page.");

  const me = await getCurrentUser();
  await requireTaskAccess(taskId, me);

  const db = getDb();
  await db.delete(taskLinks).where(eq(taskLinks.id, linkId));
  log.info("task.link_removed", { taskId, linkId, actorId: me.id });

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  return ok;
}
