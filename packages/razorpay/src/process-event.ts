import {
  type Database,
  customers,
  subscriptions,
  payments,
  razorpayEvents,
  eq,
  and,
  isNull,
  sql,
} from "@tu/db";
import { mapAmountToProduct } from "./product-mapper.js";
import type {
  RazorpayWebhookEvent,
  RazorpayPayment,
  RazorpaySubscription,
  RazorpayCustomer,
} from "./types.js";

export type ProcessResult =
  | { ok: true; processed: string[] }
  | { ok: false; error: string };

/**
 * Top-level handler. Given a parsed Razorpay webhook event, fan out to the
 * appropriate upserts. Idempotent: re-processing the same event is safe.
 *
 * Returns the list of side-effect tags (e.g. "upserted_payment", "upserted_subscription")
 * so the caller can record what happened in razorpay_events.processing_status.
 */
export async function processEvent(
  db: Database,
  event: RazorpayWebhookEvent,
): Promise<ProcessResult> {
  try {
    const processed: string[] = [];

    // Customer (some events include it directly; others infer via payment.customer_id)
    const customerEntity = event.payload.customer?.entity;
    if (customerEntity) {
      await upsertCustomer(db, customerEntity);
      processed.push("upserted_customer");
    }

    // Subscription
    const subEntity = event.payload.subscription?.entity;
    if (subEntity) {
      await upsertSubscription(db, subEntity);
      processed.push("upserted_subscription");
    }

    // Payment
    const payEntity = event.payload.payment?.entity;
    if (payEntity) {
      await upsertPayment(db, payEntity);
      processed.push("upserted_payment");
    }

    // Refund — update the corresponding payment row
    const refundEntity = event.payload.refund?.entity;
    if (refundEntity) {
      await applyRefund(db, refundEntity);
      processed.push("applied_refund");
    }

    return { ok: true, processed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// --------------------------------------------------------------------------
// upserts
// --------------------------------------------------------------------------

async function upsertCustomer(db: Database, c: RazorpayCustomer) {
  await db
    .insert(customers)
    .values({
      razorpayCustomerId: c.id,
      email: c.email ?? null,
      phone: c.contact ?? null,
      name: c.name ?? null,
    })
    .onConflictDoUpdate({
      target: customers.razorpayCustomerId,
      set: {
        email: c.email ?? null,
        phone: c.contact ?? null,
        name: c.name ?? null,
        updatedAt: new Date(),
      },
    });
}

async function upsertSubscription(db: Database, s: RazorpaySubscription) {
  // Ensure the customer row exists (subscription events often arrive before
  // we've seen a payment for that customer)
  let internalCustomerId: string | null = null;
  if (s.customer_id) {
    const [existing] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.razorpayCustomerId, s.customer_id))
      .limit(1);

    if (existing) {
      internalCustomerId = existing.id;
    } else {
      const [created] = await db
        .insert(customers)
        .values({ razorpayCustomerId: s.customer_id })
        .onConflictDoNothing({ target: customers.razorpayCustomerId })
        .returning({ id: customers.id });

      // returning may be empty if conflict; re-fetch
      if (created) {
        internalCustomerId = created.id;
      } else {
        const [refetched] = await db
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.razorpayCustomerId, s.customer_id))
          .limit(1);
        internalCustomerId = refetched?.id ?? null;
      }
    }
  }

  if (!internalCustomerId) {
    throw new Error(`subscription ${s.id} has no resolvable customer`);
  }

  const planAmountPaise = BigInt(s.plan?.item.amount ?? 0);
  const planName = s.plan?.item.name ?? null;
  const productMatch =
    planAmountPaise > 0n || planName
      ? await mapAmountToProduct(db, planAmountPaise, planName)
      : null;

  const interval = inferIntervalFromSub(s);

  await db
    .insert(subscriptions)
    .values({
      razorpaySubscriptionId: s.id,
      razorpayPlanId: s.plan_id ?? null,
      customerId: internalCustomerId,
      productId: productMatch?.productId ?? null,
      status: s.status,
      planAmountPaise,
      interval,
      currentStart: s.current_start ? new Date(s.current_start * 1000) : null,
      currentEnd: s.current_end ? new Date(s.current_end * 1000) : null,
      startedAt: s.start_at ? new Date(s.start_at * 1000) : null,
      endedAt: s.ended_at ? new Date(s.ended_at * 1000) : null,
    })
    .onConflictDoUpdate({
      target: subscriptions.razorpaySubscriptionId,
      set: {
        status: s.status,
        currentStart: s.current_start ? new Date(s.current_start * 1000) : null,
        currentEnd: s.current_end ? new Date(s.current_end * 1000) : null,
        endedAt: s.ended_at ? new Date(s.ended_at * 1000) : null,
        productId: productMatch?.productId ?? null,
        updatedAt: new Date(),
      },
    });
}

async function upsertPayment(db: Database, p: RazorpayPayment) {
  // Resolve internal customer
  let internalCustomerId: string | null = null;
  if (p.customer_id) {
    const [existing] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.razorpayCustomerId, p.customer_id))
      .limit(1);

    internalCustomerId = existing?.id ?? null;

    // If we don't know this customer yet, create a thin row so the payment
    // can FK to it. The customer.created webhook (if subscribed) will
    // backfill email/phone/name later.
    if (!internalCustomerId) {
      const [created] = await db
        .insert(customers)
        .values({
          razorpayCustomerId: p.customer_id,
          email: p.email ?? null,
          phone: p.contact ?? null,
        })
        .onConflictDoNothing({ target: customers.razorpayCustomerId })
        .returning({ id: customers.id });

      if (created) {
        internalCustomerId = created.id;
      } else {
        const [refetched] = await db
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.razorpayCustomerId, p.customer_id))
          .limit(1);
        internalCustomerId = refetched?.id ?? null;
      }
    }
  }

  // Resolve internal subscription (if present) + inherit its product attribution.
  // A subscription's product was mapped via plan_name when the subscription was
  // first seen — that's the authoritative signal for every payment against it,
  // including partial charges, trials, and prorated amounts.
  let internalSubscriptionId: string | null = null;
  let subscriptionProductId: string | null = null;
  if (p.subscription_id) {
    const [sub] = await db
      .select({ id: subscriptions.id, productId: subscriptions.productId })
      .from(subscriptions)
      .where(eq(subscriptions.razorpaySubscriptionId, p.subscription_id))
      .limit(1);
    internalSubscriptionId = sub?.id ?? null;
    subscriptionProductId = sub?.productId ?? null;
  }

  // Map: if we have a subscription-tagged product, use that (confidence 1.0).
  // Otherwise fall back to amount-only matching.
  const match = subscriptionProductId
    ? {
        productId: subscriptionProductId,
        productSlug: null,
        confidence: 1.0,
        matchedBy: "plan_name" as const,
        matchedMappingId: null,
        candidates: 1,
      }
    : await mapAmountToProduct(db, BigInt(p.amount));

  // If this is the customer's first payment AND we now know the product,
  // set primary_product_id on the customer.
  if (internalCustomerId && match.productId) {
    // Only set if currently null — don't overwrite a later product assignment.
    await db
      .update(customers)
      .set({ primaryProductId: match.productId, updatedAt: new Date() })
      .where(and(eq(customers.id, internalCustomerId), isNull(customers.primaryProductId)));
  }

  await db
    .insert(payments)
    .values({
      razorpayPaymentId: p.id,
      razorpayOrderId: p.order_id ?? null,
      razorpaySubscriptionId: p.subscription_id ?? null,
      customerId: internalCustomerId,
      subscriptionId: internalSubscriptionId,
      productId: match.productId,
      amountPaise: BigInt(p.amount),
      feePaise: p.fee != null ? BigInt(p.fee) : null,
      taxPaise: p.tax != null ? BigInt(p.tax) : null,
      currency: p.currency,
      status: p.status,
      method: p.method ?? null,
      capturedAt: p.status === "captured" ? new Date(p.created_at * 1000) : null,
      mappingConfidence: match.confidence.toFixed(2),
      raw: p as unknown as Record<string, unknown>,
    })
    .onConflictDoUpdate({
      target: payments.razorpayPaymentId,
      set: {
        status: p.status,
        amountRefundedPaise: p.amount_refunded != null ? BigInt(p.amount_refunded) : 0n,
        capturedAt:
          p.status === "captured" ? new Date(p.created_at * 1000) : undefined,
        productId: match.productId,
        mappingConfidence: match.confidence.toFixed(2),
        raw: p as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      },
    });
}

async function applyRefund(
  db: Database,
  r: { id: string; payment_id: string; amount: number; created_at: number },
) {
  const [pay] = await db
    .select({ id: payments.id, currentRefunded: payments.amountRefundedPaise })
    .from(payments)
    .where(eq(payments.razorpayPaymentId, r.payment_id))
    .limit(1);

  if (!pay) return; // payment not seen yet — sync will reconcile

  const total = (pay.currentRefunded ?? 0n) + BigInt(r.amount);

  await db
    .update(payments)
    .set({
      amountRefundedPaise: total,
      refundedAt: new Date(r.created_at * 1000),
      status: "refunded",
      updatedAt: new Date(),
    })
    .where(eq(payments.id, pay.id));
}

// --------------------------------------------------------------------------
// helpers
// --------------------------------------------------------------------------

function inferIntervalFromSub(s: RazorpaySubscription) {
  const span =
    s.current_start && s.current_end ? s.current_end - s.current_start : null;
  if (!span) return null;
  // span is in seconds. ~30 days = 2,592,000; ~90 = 7,776,000; ~365 = 31,536,000.
  if (span < 60 * 60 * 24 * 45) return "monthly";
  if (span < 60 * 60 * 24 * 120) return "quarterly";
  if (span < 60 * 60 * 24 * 250) return "half_yearly";
  return "yearly";
}

/**
 * Mark the raw event row as processed (or failed). Call after processEvent.
 */
export async function recordEventResult(
  db: Database,
  rawEventRowId: string,
  result: ProcessResult,
) {
  if (result.ok) {
    await db
      .update(razorpayEvents)
      .set({
        processingStatus: "processed",
        processedAt: new Date(),
        processingError: null,
      })
      .where(eq(razorpayEvents.id, rawEventRowId));
  } else {
    await db
      .update(razorpayEvents)
      .set({
        processingStatus: "failed",
        processedAt: new Date(),
        processingError: result.error,
      })
      .where(eq(razorpayEvents.id, rawEventRowId));
  }
}
