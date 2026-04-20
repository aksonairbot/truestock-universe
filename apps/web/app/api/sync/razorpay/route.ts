import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@tu/db";
import { fetchPaymentsSince, processEvent } from "@tu/razorpay";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Allow up to 5 minutes for a backfill — adjust per hosting plan.
export const maxDuration = 300;

/**
 * On-demand Razorpay reconciliation.
 *
 * POST /api/sync/razorpay?since=2026-04-01T00:00:00Z
 * Authorization: Bearer <INTERNAL_API_SECRET>
 *
 * Fetches captured payments from the Razorpay API for the window and pushes
 * each through the same processEvent() path the webhook uses. Idempotent
 * via the unique razorpay_payment_id constraint — re-syncing the same
 * window is safe.
 *
 * Schedule this hourly (DO App Platform cron) as a safety net for missed
 * webhooks. Defaults to "last 7 days" when `since` is omitted.
 */
export async function POST(req: NextRequest) {
  // Auth
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.INTERNAL_API_SECRET ?? ""}`;
  if (!process.env.INTERNAL_API_SECRET || auth !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const untilParam = url.searchParams.get("until");

  const from = sinceParam
    ? new Date(sinceParam)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const to = untilParam ? new Date(untilParam) : new Date();

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ ok: false, error: "invalid_dates" }, { status: 400 });
  }

  const db = getDb();
  let fetched = 0;
  let processed = 0;
  let failed = 0;

  log.info("razorpay.sync.start", { from: from.toISOString(), to: to.toISOString() });

  try {
    const payments = await fetchPaymentsSince({ from, to });
    fetched = payments.length;

    for (const p of payments) {
      const result = await processEvent(db, {
        entity: "event",
        account_id: "sync",
        event: `payment.${p.status}`,
        contains: ["payment"],
        payload: { payment: { entity: p } },
        created_at: p.created_at,
      });
      if (result.ok) processed++;
      else failed++;
    }

    log.info("razorpay.sync.complete", { fetched, processed, failed });
    return NextResponse.json({
      ok: true,
      window: { from: from.toISOString(), to: to.toISOString() },
      fetched,
      processed,
      failed,
    });
  } catch (e) {
    log.error("razorpay.sync.failed", e, { fetched, processed, failed });
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "sync_failed",
        partial: { fetched, processed, failed },
      },
      { status: 500 },
    );
  }
}

// Allow GET for easy ops manual triggering (still requires auth)
export async function GET(req: NextRequest) {
  return POST(req);
}
