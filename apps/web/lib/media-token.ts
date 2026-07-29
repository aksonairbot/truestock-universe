// apps/web/lib/media-token.ts
//
// Short-lived signed URLs for task attachments.
//
// THE PROBLEM: attachments live on the droplet's disk behind a session cookie.
// Upload-post fetches media by URL from its own servers, so it can never
// present that cookie. Something has to be reachable without a login.
//
// THE ANSWER: a URL that carries its own proof. The token is an HMAC over
// (attachment id, expiry) using AUTH_SECRET with a domain-separation prefix —
// so a media token can never be confused with a session token, and possessing
// one grants exactly one file for a few minutes and nothing else.
//
// Deliberately NOT a bearer token in a header: Upload-post only accepts a
// plain URL, so the proof has to travel in the query string. That's why the
// TTL is minutes rather than days, and why the token is minted only on the
// publish path.

import { createHmac, timingSafeEqual } from "crypto";

/** Long enough for a slow upstream fetch, short enough to be worthless if leaked. */
const DEFAULT_TTL_SECONDS = 30 * 60;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is required to sign media URLs.");
  // Domain separation: this key is for media links, never for sessions.
  return `media-v1:${s}`;
}

function sign(id: string, exp: number): string {
  return createHmac("sha256", secret()).update(`${id}.${exp}`).digest("base64url");
}

export function mintMediaToken(attachmentId: string, ttlSeconds = DEFAULT_TTL_SECONDS): { exp: number; sig: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return { exp, sig: sign(attachmentId, exp) };
}

/** Absolute URL — Upload-post fetches from its own network, so relative won't do. */
export function mediaUrl(attachmentId: string, ttlSeconds = DEFAULT_TTL_SECONDS): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  if (!base) return null;
  const { exp, sig } = mintMediaToken(attachmentId, ttlSeconds);
  return `${base}/api/media/${attachmentId}?exp=${exp}&sig=${sig}`;
}

export function verifyMediaToken(attachmentId: string, expRaw: string | null, sigRaw: string | null): boolean {
  if (!expRaw || !sigRaw) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;

  const expected = Buffer.from(sign(attachmentId, exp));
  const given = Buffer.from(sigRaw);
  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false, and a wrong length is not a secret worth protecting.
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}
