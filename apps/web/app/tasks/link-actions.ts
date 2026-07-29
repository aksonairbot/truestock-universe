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

const LINK_KINDS = ["figma", "asset", "live", "doc", "other"] as const;
type LinkKind = (typeof LINK_KINDS)[number];

/** Only http(s). Blocks javascript:, data:, file: and friends. */
function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Paste a link first.");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error("That doesn't look like a valid link.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https links are allowed.");
  }
  if (withScheme.length > 2000) throw new Error("That link is too long.");
  return parsed.toString();
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

export async function addTaskLink(formData: FormData): Promise<void> {
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  const urlRaw = ((formData.get("url") as string) ?? "").trim();
  const kindRaw = ((formData.get("kind") as string) ?? "").trim();
  const label = ((formData.get("label") as string) ?? "").trim().slice(0, 120) || null;
  if (!taskId) throw new Error("taskId is required");

  const me = await getCurrentUser();
  await requireTaskAccess(taskId, me);

  const url = normalizeUrl(urlRaw);
  const kind = inferKind(url, kindRaw);

  const db = getDb();
  await db.insert(taskLinks).values({ taskId, url, kind, label, createdById: me.id });
  log.info("task.link_added", { taskId, kind, actorId: me.id });

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
}

export async function removeTaskLink(formData: FormData): Promise<void> {
  const linkId = ((formData.get("linkId") as string) ?? "").trim();
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  if (!linkId || !taskId) throw new Error("linkId and taskId are required");

  const me = await getCurrentUser();
  await requireTaskAccess(taskId, me);

  const db = getDb();
  await db.delete(taskLinks).where(eq(taskLinks.id, linkId));
  log.info("task.link_removed", { taskId, linkId, actorId: me.id });

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
}
