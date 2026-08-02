// apps/web/app/members/standing-actions.ts
//
// Setting someone's contribution standing. Separate from members/actions.ts on
// purpose: this is the one mutation in the app whose output a peer must never
// see, and it is easier to keep that true when it lives in its own file with
// its own reasoning at the top.
//
// FOUR RULES, and each is here because the obvious version is worse:
//
//   1. A REASON IS REQUIRED. A rating with no reason is unfalsifiable — the
//      person can't act on it, can't disagree with it specifically, and can't
//      tell what would change it. That isn't feedback, it's a verdict. The
//      column is nullable so a backfill can exist; this action refuses.
//
//   2. YOU CANNOT SET YOUR OWN. Not even as an admin. An admin can set every
//      other person's, which is the point of being an admin, but self-rating
//      makes the whole record worthless.
//
//   3. EVERY CHANGE IS RECORDED, including clearing it. A standing with no
//      memory is just today's opinion; the history is what lets the person see
//      that it moved and what was said at the time.
//
//   4. THE PERSON IS TOLD — WITHOUT THE VALUE. They're notified that it
//      changed and where to look. The tier itself is never in the notification
//      body, because notifications are delivered by email and "you have been
//      moved to Developing" should not arrive in an inbox ahead of the
//      conversation. Only a change of TIER notifies; rewording a note does
//      not, or every typo fix would be an event.

"use server";

import { revalidatePath } from "next/cache";
import { getDb, users, contributionTierHistory, eq } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { canSetStandingOf, isTier, type Tier } from "@/lib/standing";
import { notifyStandingUpdated } from "@/lib/notify";
import { log } from "@/lib/log";
import { ok, fail, type ActionResult } from "@/lib/action-result";

/** Long enough to be a sentence, short enough not to be an essay. */
const MIN_NOTE = 12;
const MAX_NOTE = 1000;

export async function setContributionTier(formData: FormData): Promise<ActionResult> {
  const memberId = ((formData.get("memberId") as string) ?? "").trim();
  const tierRaw = ((formData.get("tier") as string) ?? "").trim();
  const note = ((formData.get("note") as string) ?? "").trim();

  if (!memberId) return fail("This form lost track of which person it belongs to. Reload the page.");

  const me = await getCurrentUser();
  const db = getDb();

  const [subject] = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      departmentId: users.departmentId,
      managerId: users.managerId,
      currentTier: users.contributionTier,
    })
    .from(users)
    .where(eq(users.id, memberId))
    .limit(1);

  if (!subject) return fail("That person no longer exists. Reload the page.");

  if (me.id === subject.id) {
    return fail("You can't set your own standing — ask your manager or an admin.");
  }
  if (!canSetStandingOf(me, subject)) {
    return fail("You can only set the standing of people you manage.");
  }

  // An empty tier CLEARS the standing. That's a legitimate act — someone
  // changes role, a rating is withdrawn — so it's allowed, but it still needs
  // a reason and it still goes into the history.
  let tier: Tier | null = null;
  if (tierRaw !== "") {
    if (!isTier(tierRaw)) return fail(`"${tierRaw}" isn't a standing SeekPeak knows.`);
    tier = tierRaw;
  }
  const clearing = tier === null;

  if (note.length < MIN_NOTE) {
    return fail(
      clearing
        ? "Say why you're clearing this. The person sees it, and a standing that vanishes without explanation is worse than one that's wrong."
        : "Write a reason. The person sees this, and a standing without one gives them nothing to act on.",
    );
  }
  if (note.length > MAX_NOTE) {
    return fail(`That reason is ${note.length} characters; ${MAX_NOTE} is the most. Trim ${note.length - MAX_NOTE}.`);
  }

  const previous = subject.currentTier ?? null;
  const tierChanged = previous !== tier;
  const now = new Date();

  try {
    await db
      .update(users)
      .set({
        contributionTier: tier,
        contributionTierNote: note,
        contributionTierSetBy: me.id,
        contributionTierSetAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, memberId));

    await db.insert(contributionTierHistory).values({
      userId: memberId,
      tier,
      note,
      setById: me.id,
    });
  } catch (e) {
    log.error("standing.write_failed", { memberId, actorId: me.id, error: (e as Error).message });
    return fail("The database rejected that change. The details are in the server log.");
  }

  log.info("standing.set", { memberId, from: previous, to: tier, actorId: me.id, changed: tierChanged });

  // Only a real move is an event. Rewording a note is not.
  if (tierChanged) {
    // Fire-and-forget: a mail outage must not fail the manager's save. The row
    // is already written, which is what the app itself reads.
    void notifyStandingUpdated({ userId: memberId, actorId: me.id }).catch((e) =>
      log.error("standing.notify_failed", { memberId, error: (e as Error).message }),
    );
  }

  revalidatePath(`/members/${memberId}`);
  revalidatePath("/members");
  revalidatePath("/settings");
  return ok;
}
