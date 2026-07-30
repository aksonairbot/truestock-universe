// apps/web/app/tasks/post-actions.ts
//
// Save the post copy. Anyone who can see the task can write its copy — that's
// the job. The approval gate is what stands between copy and publication, so
// editing text needs no extra privilege.
//
// The one hard rule: OVER-LENGTH COPY IS REJECTED, NEVER TRUNCATED. Silently
// trimming is how the tail of an X post disappeared without anyone noticing.

"use server";

import { revalidatePath } from "next/cache";
import { getDb, tasks, eq } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { requireTaskAccess } from "@/lib/access";
import { captionLimit, countChars, isPillar, CHANNEL_LABEL } from "@/lib/content";
import { log } from "@/lib/log";

/** Generous ceiling for the channels with no real limit (blog, email). */
const HARD_MAX = 63206;

export async function updatePostContent(formData: FormData): Promise<void> {
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  if (!taskId) throw new Error("taskId is required");

  const me = await getCurrentUser();
  const task = await requireTaskAccess(taskId, me);
  if (!task.contentChannel) throw new Error("This task is not a content item.");

  const caption = (formData.get("caption") as string) ?? "";
  const firstComment = (formData.get("firstComment") as string) ?? "";
  const pillarRaw = ((formData.get("pillar") as string) ?? "").trim();

  const limit = captionLimit(task.contentChannel);
  const used = countChars(caption);

  // Enforce the network's own limit. The client disables the button, but a
  // form post can always arrive without the client — and the whole point of
  // this field is that nothing gets quietly cut.
  if (limit > 0 && used > limit) {
    throw new Error(
      `${CHANNEL_LABEL[task.contentChannel] ?? task.contentChannel} allows ${limit} characters; this is ${used}. Trim ${used - limit}.`,
    );
  }
  if (used > HARD_MAX) throw new Error("That caption is longer than any network accepts.");
  if (countChars(firstComment) > 2200) throw new Error("The first comment is too long (max 2200).");

  const pillar = isPillar(pillarRaw) ? pillarRaw : null;

  const db = getDb();
  await db
    .update(tasks)
    .set({
      postCaption: caption.trim() || null,
      postFirstComment: firstComment.trim() || null,
      contentPillar: pillar,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  log.info("post.copy_saved", { taskId, channel: task.contentChannel, chars: used, pillar, actorId: me.id });

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/content");
  if (task.campaignId) revalidatePath(`/campaigns/${task.campaignId}`);
}
