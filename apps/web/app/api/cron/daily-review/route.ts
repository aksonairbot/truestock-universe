// apps/web/app/api/cron/daily-review/route.ts
//
// Cron endpoint — hit daily at 9 AM IST (03:30 UTC).
// Protected by a shared secret in the CRON_SECRET env var.

import { NextRequest, NextResponse } from "next/server";
import { runDailyReview } from "@/lib/daily-review";
import { generateKnowledgeDigest } from "@/lib/knowledge-digest";
import { prewarmMorningBriefings } from "@/lib/briefing";
import { runContentWatch } from "@/lib/content-watch";
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
    // Pre-warm every active user's morning briefing so nobody's first Today
    // view of the day blocks on the LLM (was 2–25s for the first viewer).
    const briefings = await prewarmMorningBriefings().catch((e) => {
      log.warn("cron.daily_review.briefing_prewarm_failed", { error: (e as Error).message });
      return { generated: 0, skipped: 0, failed: -1 };
    });
    // The content watchdog rides the same 9 AM run. Wrapped like the others:
    // a marketing warning failing must never take down the daily review.
    const watch = await runContentWatch().catch((e) => {
      log.warn("cron.daily_review.content_watch_failed", { error: (e as Error).message });
      return { risks: -1, notified: 0, skipped: 0, overBudget: 0 };
    });

    return NextResponse.json({ ok: true, ...result, digest, recurrenceRolled, briefings, watch });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("cron.daily_review.error", { error: msg });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
