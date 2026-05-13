// apps/web/app/api/cron/daily-review/route.ts
//
// Cron endpoint — hit daily at 9 AM IST (03:30 UTC).
// Protected by a shared secret in the CRON_SECRET env var.

import { NextRequest, NextResponse } from "next/server";
import { runDailyReview } from "@/lib/daily-review";
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
    const result = await runDailyReview();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("cron.daily_review.error", { error: msg });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
