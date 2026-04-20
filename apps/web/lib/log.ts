/**
 * Tiny structured logger. Outputs JSON to stdout/stderr so DO App Platform's
 * log viewer (and any drain) can parse fields cleanly.
 *
 * Usage:
 *   import { log } from "@/lib/log";
 *   log.info("razorpay.webhook.received", { eventType, paymentId });
 *   log.warn("razorpay.webhook.invalid_signature", { reason });
 *   log.error("razorpay.webhook.process_failed", err, { paymentId });
 *
 * If SENTRY_DSN is set, errors are also forwarded to Sentry. Otherwise the
 * Sentry hook is a no-op so the app runs without it.
 */

type Level = "debug" | "info" | "warn" | "error";

type Fields = Record<string, unknown>;

function emit(level: Level, msg: string, fields?: Fields) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...(fields ?? {}),
  });
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

// Sentry — lazy, optional. We don't want a hard dep on @sentry/nextjs.
let sentryReady = false;
let sentryCapture: ((err: unknown, ctx?: Fields) => void) | null = null;

async function initSentry() {
  if (sentryReady || !process.env.SENTRY_DSN) return;
  try {
    // Dynamic import — only loaded if @sentry/node is installed
    const Sentry = await import("@sentry/node" as string).catch(() => null);
    if (!Sentry) return;
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? "development",
      tracesSampleRate: 0,
    });
    sentryCapture = (err, ctx) => {
      if (ctx) Sentry.setExtras(ctx);
      Sentry.captureException(err);
    };
    sentryReady = true;
  } catch {
    // Sentry not installed or init failed — silently degrade to console-only
  }
}

// kick off init in background; ok if it never resolves
void initSentry();

export const log = {
  debug: (msg: string, fields?: Fields) => emit("debug", msg, fields),
  info: (msg: string, fields?: Fields) => emit("info", msg, fields),
  warn: (msg: string, fields?: Fields) => emit("warn", msg, fields),
  error: (msg: string, err?: unknown, fields?: Fields) => {
    const errorFields: Fields =
      err instanceof Error
        ? { error: err.message, stack: err.stack, name: err.name, ...(fields ?? {}) }
        : err != null
          ? { error: String(err), ...(fields ?? {}) }
          : (fields ?? {});
    emit("error", msg, errorFields);
    if (sentryCapture) sentryCapture(err ?? new Error(msg), fields);
  },
};
