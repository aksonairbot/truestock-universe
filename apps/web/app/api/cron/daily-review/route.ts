// apps/web/app/api/cron/daily-review/route.ts
//
// Cron endpoint — hit daily at 9 AM IST (03:30 UTC).
// Protected by a shared secret in the CRON_SECRET env var.

import { NextRequest, NextResponse } from "next/server";
import { runDailyReview } from "@/lib/daily-review";
import { generateKnowledgeDigest } from "@/lib/knowledge-digest";
import { getDb, sql } from "@tu/db";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");

  if (!process.env.CRON_SECRET) {
    log.warn("cron.daily_review.no_secret", { reason: "CRON_SECRET env var not set" });
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // Roll overdue RECURRING tasks forward to today before anything else —
    // a daily task nobody clicked Done on used to just sit there accruing
    // "overdue 24d". One statement, piggybacked on the existing 9 AM cron so
    // no new timer is needed on the server.
    let recurrenceRolled = 0;
    try {
      const db = getDb();
      const rolled = await db.execute(sql`
        update tasks
        set due_date = (now() at time zone 'Asia/Kolkata')::date, updated_at = now()
        where recurrence <> 'none'
          and status not in ('done'::task_status, 'cancelled'::task_status)
          and due_date < (now() at time zone 'Asia/Kolkata')::date
        returning id
      `);
      recurrenceRolled = Array.isArray(rolled) ? rolled.length : ((rolled as { length?: number }).length ?? 0);
      if (recurrenceRolled > 0) log.info("cron.recurrence_rolled", { count: recurrenceRolled });
    } catch (e) {
      log.warn("cron.recurrence_roll_failed", { error: (e as Error).message });
    }

    const result = await runDailyReview();
    // Also refresh the knowledge digest so AI prompts have fresh context
    const digest = await generateKnowledgeDigest().catch((e) => {
      log.warn("cron.daily_review.digest_piggyback_failed", { error: (e as Error).message });
      return { ok: false, error: (e as Error).message };
    });
    return NextResponse.json({ ok: true, ...result, digest, recurrenceRolled });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("cron.daily_review.error", { error: msg });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
