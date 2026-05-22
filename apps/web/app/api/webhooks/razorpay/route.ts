import { NextResponse, type NextRequest } from "next/server";
import { getDb, razorpayEvents } from "@tu/db";
import {
  verifyWebhookSignature,
  type RazorpayWebhookEvent,
} from "@tu/razorpay";
import { log } from "@/lib/log";

// Run on Node.js, not Edge — we need crypto + postgres-js.
export const runtime = "nodejs";
// Disable static optimization — webhooks must always run.
export const dynamic = "force-dynamic";

/**
 * Razorpay webhook receiver — audit-log only.
 *
 * 1. Read raw body (REQUIRED for signature verification)
 * 2. Verify HMAC-SHA256 signature against RAZORPAY_WEBHOOK_SECRET
 * 3. Persist raw event to razorpay_events (audit log)
 * 4. ACK 200 — no fan-out into business tables.
 *
 * Background: until 2026-05-22 this route called `processEvent()` from
 * `@tu/razorpay` to ingest B2C product purchases into Truestock's MIS
 * (customers/subscriptions/payments). That product line was shelved and
 * SeekPeak is now pure task management. The route is kept so the webhook
 * URL stays valid (Razorpay account configured against it) and so the
 * audit log is preserved for any in-flight events. When SaaS tenant
 * subscription billing is wired in, a new processor will live alongside.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text(); // raw, untouched body

  const verify = verifyWebhookSignature({
    rawBody,
    signatureHeader: req.headers.get("x-razorpay-signature"),
    secret: process.env.RAZORPAY_WEBHOOK_SECRET,
  });

  if (!verify.valid) {
    // Log the reason for ops visibility but don't echo it to the caller.
    log.warn("razorpay.webhook.rejected", { reason: verify.reason });
    return NextResponse.json(
      { ok: false, error: "invalid_signature" },
      { status: 401 },
    );
  }

  let event: RazorpayWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch (e) {
    log.error("razorpay.webhook.invalid_json", e);
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const db = getDb();

  // Persist the raw event first (audit log — single source of truth for replay)
  const razorpayEventId =
    req.headers.get("x-razorpay-event-id") ?? extractEventIdFromPayload(event);

  try {
    const [row] = await db
      .insert(razorpayEvents)
      .values({
        razorpayEventId,
        eventType: event.event,
        payload: event as unknown as Record<string, unknown>,
        signature: req.headers.get("x-razorpay-signature"),
      })
      .onConflictDoNothing({ target: razorpayEvents.razorpayEventId })
      .returning({ id: razorpayEvents.id });

    if (!row) {
      // Already seen — idempotent ack
      log.info("razorpay.webhook.deduped", { eventType: event.event, razorpayEventId });
      return NextResponse.json({ ok: true, deduped: true });
    }
  } catch (e) {
    log.error("razorpay.webhook.store_failed", e, { eventType: event.event });
    return NextResponse.json({ ok: false, error: "store_failed" }, { status: 500 });
  }

  log.info("razorpay.webhook.received", { eventType: event.event, razorpayEventId });

  // SaaS scope: audit-log only, no business-table fan-out. The row's
  // processingStatus stays at its default so when we wire a subscription
  // processor in we can replay everything since the cutover by selecting
  // WHERE processing_status != 'processed'.
  return NextResponse.json({ ok: true, audited: true });
}

function extractEventIdFromPayload(e: RazorpayWebhookEvent): string | null {
  // Some events expose an inner id we can use as a stable dedupe key.
  return (
    e.payload.payment?.entity.id ??
    e.payload.subscription?.entity.id ??
    e.payload.refund?.entity.id ??
    `${e.event}:${e.created_at}`
  );
}
