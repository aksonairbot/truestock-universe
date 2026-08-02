// apps/web/app/tasks/publish-actions.ts
//
// The publishing handoff. SeekPeak decides WHAT goes out and records WHO
// approved it; Upload-post does the actual posting because it already holds
// the OAuth tokens for the networks.
//
// Every action here enforces the same three rules:
//   1. Only admins and managers can push the button.
//   2. The item must carry a named approval (Stage 2). No approval, no post.
//   3. Nothing is ever published twice — publishState is claimed before the
//      network call, so a double-click or an overlapping cron sweep cannot
//      produce two live posts.
//
// The mechanics live in lib/publish.ts on purpose — see the note at the top
// of that file for why runPublish must not be a server action.

"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { requireTaskAccess, isPrivileged } from "@/lib/access";
import { log } from "@/lib/log";
import { runPublish } from "@/lib/publish";
import { getDb, tasks, taskComments, eq } from "@tu/db";
import { ok, fail, type ActionResult } from "@/lib/action-result";

/** Manual "Publish now" — an admin or manager taking responsibility, now. */
export async function publishNow(formData: FormData): Promise<ActionResult> {
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  if (!taskId) return fail("This form lost track of which task it belongs to. Reload the page.");

  const me = await getCurrentUser();
  if (!isPrivileged(me)) return fail("Only admins and managers can publish.");
  const task = await requireTaskAccess(taskId, me);

  const result = await runPublish(
    {
      id: task.id,
      title: task.title,
      description: task.description,
      postCaption: task.postCaption,
      postFirstComment: task.postFirstComment,
      contentChannel: task.contentChannel,
      contentApprovedAt: task.contentApprovedAt,
      publishState: task.publishState,
      publishProfile: task.publishProfile,
      assigneeId: task.assigneeId,
    },
    me.id,
  );

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  revalidatePath("/content");

  // Surface the upstream reason rather than a generic failure — "Instagram
  // needs an image attached" is actionable; "publish failed" is not. This is
  // the message the whole {ok,error} conversion exists for: it used to be
  // thrown, and Next redacted it into "Something went wrong" in production.
  if (!result.ok) return fail(result.error ?? "Publishing failed.");
  return ok;
}

/**
 * Clear a failed attempt so it can be retried, or record that something went
 * out through another system (email, ads, a webinar platform, the blog).
 */
export async function resetPublishState(formData: FormData): Promise<ActionResult> {
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  const markPublished = formData.get("markPublished") === "true";
  const manualUrl = ((formData.get("publishedUrl") as string) ?? "").trim();
  if (!taskId) return fail("This form lost track of which task it belongs to. Reload the page.");

  const me = await getCurrentUser();
  if (!isPrivileged(me)) return fail("Only admins and managers can change publish state.");
  const task = await requireTaskAccess(taskId, me);
  if (!task.contentChannel) return fail("This task isn't a content item — give it a channel first.");

  const db = getDb();
  const now = new Date();

  if (markPublished) {
    if (!task.contentApprovedAt) return fail("This needs approval before it can be marked published.");
    if (manualUrl && !/^https?:\/\//i.test(manualUrl)) {
      return fail("The live URL must start with http:// or https://");
    }

    await db
      .update(tasks)
      .set({
        publishState: "published",
        publishedAt: now,
        publishedUrl: manualUrl.slice(0, 2000) || null,
        publishError: null,
        contentStage: "published",
        updatedAt: now,
      })
      .where(eq(tasks.id, taskId));

    await db.insert(taskComments).values({
      taskId,
      authorId: me.id,
      kind: "publish",
      body: manualUrl
        ? `Marked as published (posted outside SeekPeak) — ${manualUrl}`
        : "Marked as published (posted outside SeekPeak).",
    });
    log.info("publish.marked_manually", { taskId, actorId: me.id });
  } else {
    await db
      .update(tasks)
      .set({ publishState: "idle", publishError: null, updatedAt: now })
      .where(eq(tasks.id, taskId));
    log.info("publish.state_reset", { taskId, actorId: me.id });
  }

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/content");
  return ok;
}
