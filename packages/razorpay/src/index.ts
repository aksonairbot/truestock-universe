// @tu/razorpay — scoped down to signature verification and shared types only.
// MIS payment-ingestion (process-event, product-mapper) was removed when
// SeekPeak's scope was narrowed to pure task management (2026-05-22). The
// webhook now stores the raw event in razorpay_events and ACKs 200 without
// fanning into customers/subscriptions/payments. When subscription billing
// for SaaS tenants is wired in, a new `processSubscriptionEvent` will live
// here.
export { verifyWebhookSignature, type WebhookVerifyResult } from "./webhook.js";
export { getRazorpayClient, fetchPaymentsSince } from "./client.js";
export type {
  RazorpayWebhookEvent,
  RazorpayPayment,
  RazorpaySubscription,
  RazorpayCustomer,
} from "./types.js";
