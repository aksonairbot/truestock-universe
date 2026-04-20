import { NextResponse, type NextRequest } from "next/server";
import { getDb, razorpayEvents, eq } from "@tu/db";
import {
  verifyWebhookSignature,
  processEvent,
  type RazorpayWebhookEvent,
} from "@tu/razorpay";
import { log } from "@/lib/log";

// Run on Node.js, not Edge — we need crypto + postgres-js.
export const runtime = "nodejs";
// Disable static optimization — webhooks must always run.
export const dynamic = "force-dynamic";

/**
 * Razorpay webhook receiver.
 *
 * 1. Read raw body (REQUIRED for signature verification)
 * 2. Verify HMAC-SHA256 signature against RAZORPAY_WEBHOOK_SECRET
 * 3. Persist raw event to razorpay_events (audit log)
 * 4. Process event into customers / subscriptions / payments
 * 5. Return 200 quickly — Razorpay retries on non-2xx
 *
 * Important: we ack with 200 even when *processing* fails (so Razorpay
 * doesn't retry indefinitely) — failed events are visible in
 * razorpay_events.processing_status='failed' for manual replay.
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

  let storedRowId: string;
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
    storedRowId = row.id;
  } catch (e) {
    log.error("razorpay.webhook.store_failed", e, { eventType: event.event });
    return NextResponse.json({ ok: false, error: "store_failed" }, { status: 500 });
  }

  log.info("razorpay.webhook.received", { eventType: event.event, razorpayEventId });

  // Process — but always 200 back to Razorpay (failures live in DB)
  const result = await processEvent(db, event);
  if (!result.ok) {
    log.error("razorpay.webhook.process_failed", null, {
      eventType: event.event,
      razorpayEventId,
      error: result.error,
    });
  }

  await db
    .update(razorpayEvents)
    .set({
      processingStatus: result.ok ? "processed" : "failed",
      processedAt: new Date(),
      processingError: result.ok ? null : result.error,
    })
    .where(eq(razorpayEvents.id, storedRowId));

  return NextResponse.json({ ok: true, processed: result.ok });
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
