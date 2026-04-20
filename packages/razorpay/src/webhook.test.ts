import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature } from "./webhook.js";

const SECRET = "a_long_test_secret_string";

function signed(body: string, secret = SECRET) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("verifyWebhookSignature", () => {
  const body = JSON.stringify({ event: "payment.captured", payload: {}, created_at: 1 });

  it("accepts a correctly signed payload", () => {
    const result = verifyWebhookSignature({
      rawBody: body,
      signatureHeader: signed(body),
      secret: SECRET,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects when signature header is missing", () => {
    const result = verifyWebhookSignature({
      rawBody: body,
      signatureHeader: null,
      secret: SECRET,
    });
    expect(result).toEqual({ valid: false, reason: "missing_signature" });
  });

  it("rejects when secret is not configured", () => {
    const result = verifyWebhookSignature({
      rawBody: body,
      signatureHeader: signed(body),
      secret: undefined,
    });
    expect(result).toEqual({ valid: false, reason: "missing_secret" });
  });

  it("rejects a tampered body", () => {
    const tamperedBody = body.replace("captured", "failed");
    const result = verifyWebhookSignature({
      rawBody: tamperedBody,
      signatureHeader: signed(body), // signed the ORIGINAL body
      secret: SECRET,
    });
    expect(result).toEqual({ valid: false, reason: "mismatch" });
  });

  it("rejects a signature of the wrong length without throwing", () => {
    const result = verifyWebhookSignature({
      rawBody: body,
      signatureHeader: "deadbeef", // too short
      secret: SECRET,
    });
    expect(result).toEqual({ valid: false, reason: "mismatch" });
  });

  it("rejects a signature made with a different secret", () => {
    const result = verifyWebhookSignature({
      rawBody: body,
      signatureHeader: signed(body, "some_other_secret"),
      secret: SECRET,
    });
    expect(result).toEqual({ valid: false, reason: "mismatch" });
  });

  it("accepts raw JSON with whitespace preserved byte-for-byte", () => {
    // Razorpay signs the EXACT bytes — reformatting the JSON would break verification.
    const spacedBody = `{ "event":  "payment.captured",\n "payload":  {} }`;
    const sig = signed(spacedBody);
    const result = verifyWebhookSignature({
      rawBody: spacedBody,
      signatureHeader: sig,
      secret: SECRET,
    });
    expect(result.valid).toBe(true);
  });

  it("handles empty body correctly (won't be sent by Razorpay but shouldn't crash)", () => {
    const result = verifyWebhookSignature({
      rawBody: "",
      signatureHeader: signed(""),
      secret: SECRET,
    });
    expect(result.valid).toBe(true);
  });
});
