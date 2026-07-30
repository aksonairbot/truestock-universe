// apps/web/app/api/cron/publish/route.ts
//
// The unattended sweep: approved content whose slot has arrived goes out.
//
// THIS IS THE MOST DANGEROUS CODE IN THE APP — it posts to the company's
// public social accounts with nobody watching. It is therefore locked behind
// FOUR independent gates, any one of which stops everything:
//
//   1. CRON_SECRET must match (same as the other cron routes).
//   2. PUBLISH_ENABLED must be exactly "true". Deploying this file does NOT
//      switch publishing on — that is a separate, deliberate act.
//   3. UPLOAD_POST_API_KEY + UPLOAD_POST_USER must be configured.
//   4. Every item must be BOTH approved AND compliance-checked. Manual
//      publishing accepts an approver's judgement on compliance; unattended
//      publishing does not, because for SEBI-regulated promotions nobody is
//      there to catch a missing disclaimer.
//
// It also refuses to post anything whose slot passed long ago. If the cron
// was down for two days, waking up and firing a burst of stale posts is worse
// than not posting at all — those get flagged for a human instead.

import { NextRequest, NextResponse } from "next/server";
import { getDb, tasks, eq, and, lte, gte, sql } from "@tu/db";
import { runPublish } from "@/lib/publish";
import { isAutoPublishEnabled } from "@/lib/upload-post";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Anything more than this far past its slot is stale — a human decides. */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

/** Cap per run so a backlog can't turn into a spam burst. */
const MAX_PER_RUN = 10;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");

  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isAutoPublishEnabled()) {
    // Not an error — this is the default, safe state.
    return NextResponse.json({ ok: true, skipped: "auto-publish disabled", published: 0 });
  }

  const now = new Date();
  const notBefore = new Date(now.getTime() - STALE_AFTER_MS);

  try {
    const db = getDb();

    const due = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        postCaption: tasks.postCaption,
        postFirstComment: tasks.postFirstComment,
        contentChannel: tasks.contentChannel,
        contentApprovedAt: tasks.contentApprovedAt,
        contentApprovedById: tasks.contentApprovedById,
        publishState: tasks.publishState,
        publishProfile: tasks.publishProfile,
        assigneeId: tasks.assigneeId,
        publishAt: tasks.publishAt,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.publishState, "idle"),
          eq(tasks.complianceChecked, true),
          eq(tasks.contentStage, "scheduled"),
          lte(tasks.publishAt, now),
          gte(tasks.publishAt, notBefore),
          sql`${tasks.contentApprovedAt} is not null`,
          sql`${tasks.contentApprovedById} is not null`,
          sql`${tasks.contentChannel} is not null`,
          sql`${tasks.status} not in ('done'::task_status, 'cancelled'::task_status)`,
        ),
      )
      .limit(MAX_PER_RUN);

    // Anything overdue beyond the stale window is surfaced, never posted.
    const stale = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.publishState, "idle"),
          eq(tasks.contentStage, "scheduled"),
          sql`${tasks.publishAt} < ${notBefore}`,
          sql`${tasks.contentChannel} is not null`,
        ),
      );

    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const t of due) {
      // The approver is the actor of record — the audit trail should read
      // "the person who signed this off published it", not "the server did".
      const actorId = t.contentApprovedById;
      if (!actorId) continue; // no approver of record → not ours to publish
      const r = await runPublish(
        {
          id: t.id,
          title: t.title,
          description: t.description,
          postCaption: t.postCaption,
          postFirstComment: t.postFirstComment,
          contentChannel: t.contentChannel,
          contentApprovedAt: t.contentApprovedAt,
          publishState: t.publishState,
          publishProfile: t.publishProfile,
          assigneeId: t.assigneeId,
        },
        actorId,
      );
      results.push({ id: t.id, ok: r.ok, error: r.error });
    }

    const published = results.filter((r) => r.ok).length;
    log.info("cron.publish", { due: due.length, published, failed: results.length - published, stale: stale.length });

    return NextResponse.json({
      ok: true,
      due: due.length,
      published,
      failed: results.length - published,
      staleSkipped: stale.length,
      results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("cron.publish.error", { error: msg });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
