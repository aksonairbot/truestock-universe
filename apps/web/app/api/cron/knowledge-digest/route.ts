// apps/web/app/api/cron/knowledge-digest/route.ts
//
// Cron endpoint — generates the nightly AI knowledge digest.
// Run after daily-review, e.g. 9:30 AM IST (04:00 UTC).
// Protected by the same CRON_SECRET env var.

import { NextRequest, NextResponse } from "next/server";
import { generateKnowledgeDigest } from "@/lib/knowledge-digest";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");

  if (!process.env.CRON_SECRET) {
    log.warn("cron.knowledge_digest.no_secret", { reason: "CRON_SECRET env var not set" });
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await generateKnowledgeDigest();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("cron.knowledge_digest.error", { error: msg });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
