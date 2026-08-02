// apps/web/app/tasks/variant-actions.ts
//
// Fan one post out across networks. See 0027_post_variants.sql for why a
// variant is a peer task sharing a group id rather than a row in a variants
// table — in short, a variant needs its own approval and publish state, and
// duplicating those was the alternative.

"use server";

import { revalidatePath } from "next/cache";
import { getDb, tasks, eq, and, sql, inArray } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { requireTaskAccess } from "@/lib/access";
import { isChannel, CHANNEL_LABEL } from "@/lib/content";
import { log } from "@/lib/log";
import { ok, fail, type ActionResult } from "@/lib/action-result";

/** Enough for every network we support, and a guard against a scripted flood. */
const MAX_VARIANTS_PER_CALL = 10;

export async function createVariants(formData: FormData): Promise<ActionResult> {
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  if (!taskId) return fail("This form lost track of which task it belongs to. Reload the page.");

  const me = await getCurrentUser();
  const source = await requireTaskAccess(taskId, me);
  if (!source.contentChannel) return fail("Set a channel on this post before creating variants.");

  const requested = formData
    .getAll("channels")
    .map((c) => String(c).trim())
    .filter((c) => isChannel(c));
  if (requested.length === 0) return fail("Pick at least one channel.");
  if (requested.length > MAX_VARIANTS_PER_CALL) {
    return fail(`That's ${requested.length} channels at once; ${MAX_VARIANTS_PER_CALL} is the most in one go.`);
  }

  const db = getDb();

  // The group id lives on every member. If this post isn't in a group yet, it
  // becomes the first member of a new one — so the source is always findable
  // from any variant, with no "original" needing special treatment.
  let groupId = source.postGroupId;
  if (!groupId) {
    const [row] = await db.execute(sql`select gen_random_uuid() as id`) as unknown as Array<{ id: string }>;
    groupId = row?.id ?? null;
    if (!groupId) return fail("Could not create a post group. Try again.");
    await db.update(tasks).set({ postGroupId: groupId, updatedAt: new Date() }).where(eq(tasks.id, taskId));
  }

  // Channels already covered by this group are skipped, not duplicated —
  // pressing the button twice must not produce two LinkedIn posts.
  const existing = await db
    .select({ channel: tasks.contentChannel })
    .from(tasks)
    .where(and(eq(tasks.postGroupId, groupId), sql`${tasks.contentChannel} is not null`));
  const taken = new Set(existing.map((e) => e.channel as string));

  const toCreate = requested.filter((c) => !taken.has(c));
  if (toCreate.length === 0) {
    return fail("Those channels already have a variant in this group.");
  }

  const rows = toCreate.map((channel) => ({
    projectId: source.projectId,
    title: `${source.title} — ${CHANNEL_LABEL[channel] ?? channel}`,
    // Internal context is shared: the brief is the same for every network.
    description: source.description,
    status: "todo" as const,
    priority: source.priority,
    dueDate: source.dueDate,
    // The same person keeps the work. Deliberately NOT settable from the form:
    // that would let any member with task access assign work to someone else,
    // which is an admin/manager decision everywhere else in the app.
    assigneeId: source.assigneeId,
    contentChannel: channel,
    contentStage: "idea" as const,
    // Same slot as a starting point. Staggering across networks is a judgement
    // call, so it's left to a human rather than guessed.
    publishAt: source.publishAt,
    // Copy the copy. It may exceed the target network's limit — X being 280 —
    // and the composer will show it red and refuse to save until it's trimmed.
    // That is the intended workflow, and the same thing Buffer and Planable do:
    // starting from the real text beats starting from an empty box.
    postCaption: source.postCaption,
    postFirstComment: source.postFirstComment,
    contentPillar: source.contentPillar,
    campaignId: source.campaignId,
    postGroupId: groupId,
    createdById: me.id,
  }));

  await db.insert(tasks).values(rows);

  log.info("post.variants_created", {
    taskId,
    groupId,
    created: toCreate.length,
    skipped: requested.length - toCreate.length,
    actorId: me.id,
  });

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  revalidatePath("/content");
  if (source.campaignId) revalidatePath(`/campaigns/${source.campaignId}`);
  return ok;
}

/**
 * Take a post out of its group without deleting it.
 *
 * The variant survives as a standalone content item — it may already be
 * approved, or live. Removing it from the group is an editorial decision
 * ("this one isn't part of that push any more"), never a delete.
 */
export async function unlinkVariant(formData: FormData): Promise<ActionResult> {
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  if (!taskId) return fail("This form lost track of which task it belongs to. Reload the page.");

  const me = await getCurrentUser();
  const task = await requireTaskAccess(taskId, me);
  // Already standalone. Nothing to undo, and nothing to complain about.
  if (!task.postGroupId) return ok;

  const db = getDb();
  const groupId = task.postGroupId;

  await db.update(tasks).set({ postGroupId: null, updatedAt: new Date() }).where(eq(tasks.id, taskId));

  // A group of one isn't a group. Clear the marker so the UI doesn't show a
  // lone post as "also going out on" nothing.
  const remaining = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.postGroupId, groupId));
  if (remaining.length === 1) {
    await db
      .update(tasks)
      .set({ postGroupId: null, updatedAt: new Date() })
      .where(inArray(tasks.id, remaining.map((r) => r.id)));
  }

  log.info("post.variant_unlinked", { taskId, groupId, actorId: me.id });
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/content");
  return ok;
}
