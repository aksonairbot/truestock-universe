// apps/web/lib/content-watch.ts
//
// THE WATCHDOG. The pipeline already knows things nobody should have to ask
// for: that a post goes out on Thursday and still has no approver, that a
// piece has sat in "design" for nine days, that a publish failed at 6am and
// is quietly waiting to be noticed.
//
// Until now the system held all of that and waited to be asked. This makes it
// speak up — once a day, to the person who can actually act.
//
// TWO RULES THAT KEEP IT FROM BECOMING NOISE
//
//   1. Every finding names the ONE person who can fix it. An unapproved item
//      goes to approvers (only they can approve); a missing caption goes to
//      the assignee (only they can write it). A warning sent to everyone is a
//      warning nobody owns.
//
//   2. Nothing is nagged twice in a day. The dedupe window is 20 hours — long
//      enough that a re-run of the daily job is silent, short enough that a
//      genuinely unresolved risk is raised again tomorrow.
//
// The same finder powers the "Needs attention" panel in the UI, so what the
// screen shows and what the notification says can never drift apart.

import { getDb, tasks, users, notifications, campaigns, eq, and, sql, asc } from "@tu/db";
import { log } from "./log";

/** How far ahead we look. Two days is enough warning to actually fix it. */
const AT_RISK_HOURS = 48;

/** A piece that hasn't moved in this long is stuck, not in progress. */
const STALL_DAYS = 7;

/** Don't nag the same person about the same task twice in a day. */
const DEDUPE_HOURS = 20;

export type ContentRisk = {
  taskId: string;
  title: string;
  channel: string | null;
  stage: string | null;
  publishAt: Date | null;
  assigneeId: string | null;
  assigneeName: string | null;
  /** What's wrong, in the order it needs fixing. */
  reason: "failed" | "unapproved" | "no_copy" | "stalled";
  detail: string;
};

const REASON_LABEL: Record<ContentRisk["reason"], string> = {
  failed: "Publish failed",
  unapproved: "Not approved yet",
  no_copy: "No copy written",
  stalled: "Stuck in this stage",
};

export function riskLabel(r: ContentRisk["reason"]): string {
  return REASON_LABEL[r];
}

/**
 * Find everything in the content pipeline that needs a human.
 *
 * `scope` is the same SQL fragment the pages use for their data wall, so a
 * member sees only their own risks and an admin sees the org's. Pass
 * `sql`1=1`` from the cron, which speaks for everyone.
 */
export async function findContentRisks(scope = sql`1=1`, limit = 50): Promise<ContentRisk[]> {
  const db = getDb();

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      channel: tasks.contentChannel,
      stage: tasks.contentStage,
      publishAt: tasks.publishAt,
      approvedAt: tasks.contentApprovedAt,
      caption: tasks.postCaption,
      description: tasks.description,
      publishState: tasks.publishState,
      publishError: tasks.publishError,
      updatedAt: tasks.updatedAt,
      assigneeId: tasks.assigneeId,
      assigneeName: users.name,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(
      and(
        sql`${tasks.contentChannel} is not null`,
        sql`${tasks.status} <> 'cancelled'::task_status`,
        // Either it's due soon, or it has failed, or it has gone quiet.
        sql`(
          (${tasks.publishAt} is not null
            and ${tasks.publishAt} <= now() + interval '${sql.raw(String(AT_RISK_HOURS))} hours'
            and ${tasks.publishState} in ('idle', 'queued'))
          or ${tasks.publishState} = 'failed'
          or (${tasks.contentStage} in ('idea', 'script', 'design')
              and ${tasks.updatedAt} < now() - interval '${sql.raw(String(STALL_DAYS))} days')
        )`,
        scope,
      ),
    )
    .orderBy(asc(tasks.publishAt))
    .limit(limit);

  const out: ContentRisk[] = [];

  for (const r of rows) {
    const base = {
      taskId: r.id,
      title: r.title,
      channel: r.channel,
      stage: r.stage,
      publishAt: r.publishAt instanceof Date ? r.publishAt : r.publishAt ? new Date(r.publishAt) : null,
      assigneeId: r.assigneeId,
      assigneeName: r.assigneeName,
    };

    // Most urgent reason wins — one row, one thing to do next. A failed post
    // that is also unapproved needs the failure looked at first.
    if (r.publishState === "failed") {
      out.push({ ...base, reason: "failed", detail: r.publishError ?? "The last publish attempt failed." });
      continue;
    }

    const dueSoon = Boolean(base.publishAt);
    if (dueSoon && !r.approvedAt) {
      out.push({ ...base, reason: "unapproved", detail: "Goes out soon and still has no approver." });
      continue;
    }
    if (dueSoon && !(r.caption ?? "").trim() && !(r.description ?? "").trim()) {
      out.push({ ...base, reason: "no_copy", detail: "Goes out soon and has no copy written." });
      continue;
    }
    if (!dueSoon) {
      out.push({
        ...base,
        reason: "stalled",
        detail: `No movement for over ${STALL_DAYS} days.`,
      });
    }
  }

  return out;
}

/** Was this person already told about this task today? */
async function alreadyNotified(userId: string, taskId: string): Promise<boolean> {
  const db = getDb();
  const [hit] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.taskId, taskId),
        sql`${notifications.kind} = 'content_at_risk'`,
        sql`${notifications.createdAt} > now() - interval '${sql.raw(String(DEDUPE_HOURS))} hours'`,
      ),
    )
    .limit(1);
  return Boolean(hit);
}

/**
 * Run the watchdog and notify. Called from the daily cron.
 *
 * Returns counts rather than throwing on partial failure — one bad row must
 * not stop the rest of the daily job.
 */
export async function runContentWatch(): Promise<{
  risks: number;
  notified: number;
  skipped: number;
  overBudget: number;
}> {
  const db = getDb();
  let notified = 0;
  let skipped = 0;

  const risks = await findContentRisks(sql`1=1`, 200);

  // Approvers are only needed if something is actually waiting on approval —
  // don't query the users table for nothing.
  let approvers: Array<{ id: string }> = [];
  if (risks.some((r) => r.reason === "unapproved")) {
    approvers = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`${users.isActive} = true and ${users.role} in ('admin'::user_role, 'manager'::user_role)`);
  }

  for (const r of risks) {
    // Who can actually fix THIS? Only an approver can approve; only the
    // assignee can write the copy or retry their own post.
    const targets =
      r.reason === "unapproved"
        ? approvers.map((a) => a.id)
        : r.assigneeId
          ? [r.assigneeId]
          : approvers.map((a) => a.id);

    for (const userId of targets) {
      try {
        if (await alreadyNotified(userId, r.taskId)) {
          skipped++;
          continue;
        }
        await db.insert(notifications).values({
          userId,
          kind: "content_at_risk",
          taskId: r.taskId,
          body: `${riskLabel(r.reason)}: "${r.title.slice(0, 80)}" — ${r.detail}`,
        });
        notified++;
      } catch (e) {
        // A single bad notification must not abort the daily job.
        log.warn("content_watch.notify_failed", { taskId: r.taskId, userId, error: (e as Error).message });
      }
    }
  }

  // Campaigns whose line items have outgrown their envelope. The owner is the
  // person who set the budget, so the owner is who hears about it.
  let overBudget = 0;
  try {
    const rows = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        ownerId: campaigns.ownerId,
        budget: campaigns.budgetPaise,
        allocated: sql<string>`coalesce((select sum(${tasks.budgetPaise}) from tasks where tasks.campaign_id = ${campaigns.id}), 0)::text`,
      })
      .from(campaigns)
      .where(sql`${campaigns.archivedAt} is null and ${campaigns.status} = 'live' and ${campaigns.budgetPaise} > 0`);

    for (const c of rows) {
      if (BigInt(c.allocated) <= (c.budget ?? 0n)) continue;
      overBudget++;
      if (!c.ownerId) continue;
      // Campaign warnings hang off no task, so they can't use the per-task
      // dedupe — the 'live' + over-budget condition is itself self-limiting
      // once the owner fixes the budget or the allocation.
      const [recent] = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, c.ownerId),
            sql`${notifications.kind} = 'content_at_risk'`,
            sql`${notifications.taskId} is null`,
            sql`${notifications.body} like ${"%" + c.name.slice(0, 40) + "%"}`,
            sql`${notifications.createdAt} > now() - interval '${sql.raw(String(DEDUPE_HOURS))} hours'`,
          ),
        )
        .limit(1);
      if (recent) {
        skipped++;
        continue;
      }
      await db.insert(notifications).values({
        userId: c.ownerId,
        kind: "content_at_risk",
        body: `Campaign over budget: "${c.name.slice(0, 60)}" — line items now exceed the budget you set.`,
      });
      notified++;
    }
  } catch (e) {
    log.warn("content_watch.budget_check_failed", { error: (e as Error).message });
  }

  log.info("content_watch.done", { risks: risks.length, notified, skipped, overBudget });
  return { risks: risks.length, notified, skipped, overBudget };
}
