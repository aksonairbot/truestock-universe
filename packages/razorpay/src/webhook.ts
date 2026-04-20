import { createHmac, timingSafeEqual } from "node:crypto";

export type WebhookVerifyResult =
  | { valid: true }
  | { valid: false; reason: "missing_signature" | "missing_secret" | "mismatch" };

/**
 * Verify a Razorpay webhook signature.
 *
 * Razorpay signs the *raw request body* with HMAC-SHA256 using the webhook
 * secret you set in the dashboard, and sends the hex digest as the
 * `x-razorpay-signature` header.
 *
 * IMPORTANT: pass the raw, untouched request body — JSON.parse() then
 * JSON.stringify() will not round-trip identically.
 */
export function verifyWebhookSignature(opts: {
  rawBody: string;
  signatureHeader: string | null | undefined;
  secret: string | undefined;
}): WebhookVerifyResult {
  const { rawBody, signatureHeader, secret } = opts;

  if (!secret) return { valid: false, reason: "missing_secret" };
  if (!signatureHeader) return { valid: false, reason: "missing_signature" };

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  // Length check first — timingSafeEqual throws on mismatched lengths.
  if (expected.length !== signatureHeader.length) {
    return { valid: false, reason: "mismatch" };
  }

  const ok = timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signatureHeader, "hex"));

  return ok ? { valid: true } : { valid: false, reason: "mismatch" };
}
