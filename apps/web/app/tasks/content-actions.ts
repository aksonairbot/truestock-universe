// apps/web/app/tasks/content-actions.ts
//
// Turn a task into a content item (channel + publish slot + pipeline stage),
// move it along the pipeline, or convert it back to a plain task.

"use server";

import { revalidatePath } from "next/cache";
import { getDb, tasks, taskComments, eq } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { requireTaskAccess, isPrivileged } from "@/lib/access";
import { notifyReviewOutcome } from "@/lib/notify";
import { isChannel, isStage, istDateTimeToUtc } from "@/lib/content";
import { log } from "@/lib/log";
import { ok, fail, type ActionResult } from "@/lib/action-result";

/**
 * Set / update the content fields on a task. An empty channel converts the
 * item back into a plain task (clearing stage + publish slot) so nothing is
 * stranded half-content.
 */
export async function updateTaskContent(formData: FormData): Promise<ActionResult> {
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  if (!taskId) return fail("This form lost track of which task it belongs to. Reload the page.");

  const me = await getCurrentUser();
  await requireTaskAccess(taskId, me);

  const channelRaw = ((formData.get("contentChannel") as string) ?? "").trim();
  const stageRaw = ((formData.get("contentStage") as string) ?? "").trim();
  const dateRaw = ((formData.get("publishDate") as string) ?? "").trim();
  const timeRaw = ((formData.get("publishTime") as string) ?? "").trim();

  const db = getDb();

  // No channel → not a content item any more.
  if (!channelRaw) {
    await db
      .update(tasks)
      .set({ contentChannel: null, contentStage: null, publishAt: null, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
    log.info("content.cleared", { taskId, actorId: me.id });
    revalidatePath(`/tasks/${taskId}`);
    revalidatePath("/tasks");
    revalidatePath("/content");
    return ok;
  }

  if (!isChannel(channelRaw)) return fail(`"${channelRaw}" isn't a channel SeekPeak knows.`);
  const stage = isStage(stageRaw) ? stageRaw : "idea";

  let publishAt: Date | null = null;
  if (dateRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) return fail("Publish date must be a real date.");
    publishAt = istDateTimeToUtc(dateRaw, timeRaw);
    if (Number.isNaN(publishAt.getTime())) return fail("That publish date and time don't make a valid moment.");
  }

  // "Scheduled" without a slot is a lie the calendar can't render.
  if ((stage === "scheduled" || stage === "published") && !publishAt) {
    return fail("Pick a publish date before moving this to Scheduled or Published.");
  }

  // Approval gate: nothing goes out without a named approver on record.
  const [before] = await db
    .select({
      channel: tasks.contentChannel,
      approvedAt: tasks.contentApprovedAt,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if ((stage === "scheduled" || stage === "published") && !before?.approvedAt) {
    return fail("This needs approval before it can be scheduled or published.");
  }

  // Changing the CHANNEL is a material change — the thing that was approved
  // is not the thing going out any more, so the sign-off is cleared. Moving
  // the date or the stage does not revoke approval.
  const channelChanged = Boolean(before?.channel) && before?.channel !== channelRaw;
  const clearApproval = channelChanged
    ? { contentApprovedById: null, contentApprovedAt: null, complianceChecked: false }
    : {};

  await db
    .update(tasks)
    .set({ contentChannel: channelRaw, contentStage: stage, publishAt, updatedAt: new Date(), ...clearApproval })
    .where(eq(tasks.id, taskId));

  log.info("content.updated", { taskId, channel: channelRaw, stage, publishAt, actorId: me.id });
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  revalidatePath("/content");
  return ok;
}

/** Move a content item one step along the pipeline (used by the board). */
export async function setContentStage(formData: FormData): Promise<ActionResult> {
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  const stageRaw = ((formData.get("stage") as string) ?? "").trim();
  if (!taskId) return fail("This form lost track of which task it belongs to. Reload the page.");
  if (!isStage(stageRaw)) return fail(`"${stageRaw}" isn't a stage SeekPeak knows.`);

  const me = await getCurrentUser();
  const task = await requireTaskAccess(taskId, me);
  if (!task.contentChannel) return fail("This task isn't a content item — give it a channel first.");
  if ((stageRaw === "scheduled" || stageRaw === "published") && !task.publishAt) {
    return fail("Pick a publish date before moving this to Scheduled or Published.");
  }
  if ((stageRaw === "scheduled" || stageRaw === "published") && !task.contentApprovedAt) {
    return fail("This needs approval before it can be scheduled or published.");
  }

  const db = getDb();
  await db.update(tasks).set({ contentStage: stageRaw, updatedAt: new Date() }).where(eq(tasks.id, taskId));
  log.info("content.stage_changed", { taskId, stage: stageRaw, actorId: me.id });
  revalidatePath("/content");
  revalidatePath(`/tasks/${taskId}`);
  return ok;
}


// ---------------------------------------------------------------------------
// approveContent — admins/managers sign content off. Writes a comment so the
// approval also appears in the task's own history, notifies the assignee, and
// stamps the queryable columns the compliance record depends on.
// ---------------------------------------------------------------------------
export async function approveContent(formData: FormData): Promise<ActionResult> {
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  const complianceRaw = formData.get("complianceChecked");
  const note = ((formData.get("note") as string) ?? "").trim().slice(0, 500);
  if (!taskId) return fail("This form lost track of which task it belongs to. Reload the page.");

  const me = await getCurrentUser();
  if (!isPrivileged(me)) {
    return fail("Only admins and managers can approve content.");
  }

  const task = await requireTaskAccess(taskId, me);
  if (!task.contentChannel) return fail("This task isn't a content item — give it a channel first.");

  const complianceChecked = complianceRaw === "on" || complianceRaw === "true";
  const now = new Date();
  const db = getDb();

  await db
    .update(tasks)
    .set({
      contentApprovedById: me.id,
      contentApprovedAt: now,
      complianceChecked,
      updatedAt: now,
    })
    .where(eq(tasks.id, taskId));

  await db.insert(taskComments).values({
    taskId,
    authorId: me.id,
    kind: "review_approve",
    body: note
      ? `Approved for publishing${complianceChecked ? " (compliance checked)" : ""} — ${note}`
      : `Approved for publishing${complianceChecked ? " (compliance checked)" : ""}.`,
  });

  log.info("content.approved", { taskId, actorId: me.id, complianceChecked });

  if (task.assigneeId && task.assigneeId !== me.id) {
    notifyReviewOutcome({
      assigneeId: task.assigneeId,
      actorId: me.id,
      taskId,
      taskTitle: task.title,
      verdict: "approve",
    }).catch((e) => log.error("notify.content_approved_failed", { taskId, error: (e as Error).message }));
  }

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  revalidatePath("/content");
  return ok;
}

/** Withdraw a sign-off — e.g. the creative changed after approval. */
export async function revokeContentApproval(formData: FormData): Promise<ActionResult> {
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  if (!taskId) return fail("This form lost track of which task it belongs to. Reload the page.");

  const me = await getCurrentUser();
  if (!isPrivileged(me)) {
    return fail("Only admins and managers can withdraw approval.");
  }
  const task = await requireTaskAccess(taskId, me);

  const db = getDb();
  const now = new Date();

  // Anything still waiting to go out falls back to Review — otherwise an
  // unapproved item would keep a "ready to go" stage.
  //
  // But something ALREADY LIVE is not rewound: the post exists in the world,
  // and relabelling it "in review" would make the calendar lie. Withdrawing
  // approval on a published item records the objection; taking it down is a
  // separate, deliberate act.
  const alreadyLive = task.publishState === "published";
  const demote =
    !alreadyLive && (task.contentStage === "scheduled" || task.contentStage === "published")
      ? { contentStage: "review" as const }
      : {};

  await db
    .update(tasks)
    .set({ contentApprovedById: null, contentApprovedAt: null, complianceChecked: false, updatedAt: now, ...demote })
    .where(eq(tasks.id, taskId));

  await db.insert(taskComments).values({
    taskId,
    authorId: me.id,
    kind: "review_revise",
    body: alreadyLive
      ? "Approval withdrawn on an already-published item — the live post needs review."
      : "Approval withdrawn — this needs sign-off again before it can go out.",
  });

  log.info("content.approval_revoked", { taskId, actorId: me.id });
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/content");
  return ok;
}
