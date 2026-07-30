// apps/web/lib/publish.ts
//
// The publishing CORE. Deliberately NOT a "use server" module.
//
// Anything exported from a file marked "use server" becomes a callable RPC
// endpoint. runPublish() takes an already-validated task object, so exposing
// it as an action would let any caller hand it a forged object and publish to
// the company's social accounts. It lives here, as a plain server module, and
// only the guarded actions in app/tasks/publish-actions.ts may call it.

import { getDb, tasks, taskComments, taskAttachments, eq, asc } from "@tu/db";
import { publish, isPublishableChannel, isPublishConfigured } from "@/lib/upload-post";
import { captionLimit, countChars, CHANNEL_LABEL } from "@/lib/content";
import { mediaUrl } from "@/lib/media-token";
import { log } from "@/lib/log";

/** Attachments a social network would accept, oldest first (upload order). */
export async function collectMedia(taskId: string): Promise<{ url: string; mime: string | null }[]> {
  const db = getDb();
  const rows = await db
    .select({ id: taskAttachments.id, mime: taskAttachments.mime })
    .from(taskAttachments)
    .where(eq(taskAttachments.taskId, taskId))
    .orderBy(asc(taskAttachments.createdAt));

  const out: { url: string; mime: string | null }[] = [];
  for (const r of rows) {
    const m = r.mime ?? "";
    if (m === "image/svg+xml") continue;
    if (!m.startsWith("image/") && !m.startsWith("video/")) continue;
    const url = mediaUrl(r.id);
    // No NEXT_PUBLIC_APP_URL → no absolute URL → Upload-post could not fetch
    // it anyway. Skipping is better than sending a relative path upstream.
    if (url) out.push({ url, mime: r.mime });
    if (out.length >= 10) break;
  }
  return out;
}

type Runnable = {
  id: string;
  title: string;
  description: string | null;
  postCaption?: string | null;
  postFirstComment?: string | null;
  contentChannel: string | null;
  contentApprovedAt: Date | null;
  publishState: string;
  publishProfile: string | null;
  assigneeId: string | null;
};

/**
 * The shared core: validate, claim, call, record. Used by both the manual
 * button and the unattended sweep so the two can never drift apart.
 */
export async function runPublish(
  task: Runnable,
  actorId: string,
): Promise<{ ok: boolean; error?: string; url?: string }> {
  const db = getDb();

  if (!task.contentChannel) return { ok: false, error: "This task is not a content item." };
  if (!isPublishableChannel(task.contentChannel)) {
    return { ok: false, error: `${task.contentChannel} goes out through another system — mark it published by hand.` };
  }
  if (!task.contentApprovedAt) return { ok: false, error: "This needs approval before it can be published." };
  if (task.publishState === "published") return { ok: false, error: "This has already been published." };
  if (task.publishState === "publishing") return { ok: false, error: "A publish is already in flight for this item." };
  if (!isPublishConfigured()) {
    return { ok: false, error: "Publishing is not configured on the server yet." };
  }

  // Claim the item BEFORE the network call. The WHERE clause doubles as the
  // lock: a second caller finds publishState already 'publishing' and stops.
  await db
    .update(tasks)
    .set({ publishState: "publishing", publishError: null, updatedAt: new Date() })
    .where(eq(tasks.id, task.id));

  const media = await collectMedia(task.id);

  // Precedence: the composer's caption is the copy. Description is a
  // FALLBACK ONLY for items written before the composer existed — it is
  // internal context and shouldn't normally go out. Title last, as a label.
  const caption = (task.postCaption ?? "").trim() || (task.description ?? "").trim() || task.title;

  // Last line of defence. The composer refuses to save over-length copy, but a
  // caption can also arrive from the pre-composer description fallback, which
  // was never length-checked against this channel.
  const limit = captionLimit(task.contentChannel);
  if (limit > 0 && countChars(caption) > limit) {
    const label = CHANNEL_LABEL[task.contentChannel] ?? task.contentChannel;
    await db
      .update(tasks)
      .set({
        publishState: "failed",
        publishError: `Caption is ${countChars(caption)} characters; ${label} allows ${limit}.`,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, task.id));
    return { ok: false, error: `Caption is too long for ${label} — ${countChars(caption)}/${limit}. Trim it in Post copy.` };
  }

  const result = await publish({
    channel: task.contentChannel,
    title: caption,
    description: task.description,
    firstComment: task.postFirstComment ?? null,
    media,
    profile: task.publishProfile,
  });

  const now = new Date();

  if (!result.ok) {
    await db
      .update(tasks)
      .set({ publishState: "failed", publishError: (result.error ?? "Unknown error").slice(0, 1000), updatedAt: now })
      .where(eq(tasks.id, task.id));
    log.warn("publish.task_failed", { taskId: task.id, error: result.error });
    return { ok: false, error: result.error };
  }

  await db
    .update(tasks)
    .set({
      publishState: "published",
      publishedAt: now,
      publishedUrl: result.url ?? null,
      publishRef: result.ref ?? null,
      publishError: null,
      contentStage: "published",
      updatedAt: now,
    })
    .where(eq(tasks.id, task.id));

  await db.insert(taskComments).values({
    taskId: task.id,
    authorId: actorId,
    kind: "publish",
    body: result.url
      ? `Published to ${task.contentChannel} — ${result.url}`
      : `Published to ${task.contentChannel}.`,
  });

  log.info("publish.task_published", { taskId: task.id, channel: task.contentChannel, url: result.url });
  return { ok: true, url: result.url };
}

