// apps/web/lib/outbound.ts
//
// Delivery. Everything upstream writes a notification row; this is the only
// thing that makes a message leave the building.
//
// THE TRANSPORT IS PLUGGABLE, AND THAT MATTERS
// The first version was WhatsApp-via-Twilio and it was structurally wrong:
// Meta only allows free-form messages inside a 24-hour window the RECIPIENT
// opens, so a "task assigned to you" notification always needs a pre-approved
// template — plus Twilio couldn't supply an Indian sender number. Rather than
// fight that, the transport became one small interface. Everything valuable
// here — the caps, the quiet hours, the personal off switch, delivered_at, the
// wiring into notify.ts's single chokepoint — is channel-agnostic and survived
// the swap untouched. That is the whole point of putting it here.
//
// GUARDRAILS (the reason this file is longer than the send call it wraps)
//   1. A master env switch per transport. Deploying sends nothing. Adding
//      credentials sends nothing. Only the switch does.
//   2. Quiet hours — but ONLY for transports that interrupt. An email at 2am
//      waits politely in an inbox; a phone buzzing at 2am does not. So it is a
//      property of the transport, not a global rule.
//   3. A personal off switch (users.notify_outbound) needing no admin.
//   4. A per-person hourly cap, so a loop upstream can't become forty pings.
//   5. delivered_at stamped on SUCCESS only — a failure retries rather than
//      being swallowed, and a cron re-run can never double-send.
//
// Delivery is FIRE-AND-FORGET. A provider outage must never fail the task
// assignment that triggered it: the row is already in the database, which is
// what the app itself reads.

import { getDb, users, notifications, eq, and, sql } from "@tu/db";
import { sendMail, isMailConfigured, isMailEnabled } from "./mail";
import { sendWhatsApp } from "./whatsapp";
import { log } from "./log";

const QUIET_START_MIN = 21 * 60 + 30; // 21:30 IST
const QUIET_END_MIN = 8 * 60; //         08:00 IST
const MAX_PER_HOUR = 8;

type Recipient = { email: string; phone: string | null; name: string };

type Transport = {
  name: string;
  /** Does this transport interrupt someone? Email doesn't; a phone does. */
  interrupts: boolean;
  configured(): boolean;
  enabled(): boolean;
  /** Can this recipient actually be reached? */
  canReach(r: Recipient): boolean;
  send(r: Recipient, body: string, link: string | null): Promise<{ ok: boolean; error?: string }>;
};

const emailTransport: Transport = {
  name: "email",
  interrupts: false,
  configured: isMailConfigured,
  enabled: isMailEnabled,
  canReach: (r) => Boolean(r.email),
  async send(r, body, link) {
    // The subject is the first line of the body, trimmed to something that
    // reads in a notification list rather than "SeekPeak notification".
    const subject = body.length > 78 ? `${body.slice(0, 75)}…` : body;
    const res = await sendMail({ to: r.email, subject, body, link });
    return { ok: res.ok, error: res.error };
  },
};

const whatsappTransport: Transport = {
  name: "whatsapp",
  interrupts: true,
  configured: () =>
    Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_API_KEY_SID &&
        process.env.TWILIO_API_KEY_SECRET &&
        process.env.TWILIO_WHATSAPP_FROM,
    ),
  enabled: () => process.env.WHATSAPP_ENABLED === "true" && whatsappTransport.configured(),
  canReach: (r) => Boolean(r.phone),
  async send(r, body, link) {
    const res = await sendWhatsApp(r.phone!, `*SeekPeak*\n${body}${link ? `\n${link}` : ""}`);
    return { ok: res.ok, error: res.error };
  },
};

/** Email first — it's the one that works without approval cycles. */
const TRANSPORTS = [emailTransport, whatsappTransport];

export function activeTransport(): Transport | null {
  return TRANSPORTS.find((t) => t.enabled()) ?? null;
}

export function isOutboundEnabled(): boolean {
  return activeTransport() !== null;
}

/** For the health page: what's set up vs what's actually switched on. */
export function outboundStatus(): { configured: string[]; active: string | null } {
  return {
    configured: TRANSPORTS.filter((t) => t.configured()).map((t) => t.name),
    active: activeTransport()?.name ?? null,
  };
}

function istMinutes(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const [h, m] = parts.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function inQuietHours(now = new Date()): boolean {
  const mins = istMinutes(now);
  // The window crosses midnight, so it's an OR, not a range.
  return mins >= QUIET_START_MIN || mins < QUIET_END_MIN;
}

function linkFor(taskId: string | null): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  if (!base) return null;
  return taskId ? `${base}/tasks/${taskId}` : base;
}

/**
 * Deliver one notification. Never throws, and returns a REASON when it
 * declines — which is what makes the behaviour debuggable rather than
 * mysterious when someone says "I didn't get anything".
 */
export async function deliverNotification(notificationId: string): Promise<{ sent: boolean; reason?: string }> {
  try {
    const transport = activeTransport();
    if (!transport) return { sent: false, reason: "outbound disabled" };
    if (transport.interrupts && inQuietHours()) return { sent: false, reason: "quiet hours" };

    const db = getDb();
    const [row] = await db
      .select({
        id: notifications.id,
        userId: notifications.userId,
        taskId: notifications.taskId,
        body: notifications.body,
        deliveredAt: notifications.deliveredAt,
        email: users.email,
        phone: users.phone,
        name: users.name,
        wantsOutbound: users.notifyOutbound,
        isActive: users.isActive,
      })
      .from(notifications)
      .innerJoin(users, eq(notifications.userId, users.id))
      .where(eq(notifications.id, notificationId))
      .limit(1);

    if (!row) return { sent: false, reason: "notification not found" };
    if (row.deliveredAt) return { sent: false, reason: "already delivered" };
    if (!row.isActive) return { sent: false, reason: "user inactive" };
    if (!row.wantsOutbound) return { sent: false, reason: "user opted out" };

    const recipient: Recipient = { email: row.email, phone: row.phone, name: row.name };
    if (!transport.canReach(recipient)) return { sent: false, reason: `no ${transport.name} address` };

    const [recent] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(eq(notifications.userId, row.userId), sql`${notifications.deliveredAt} > now() - interval '1 hour'`),
      );
    if ((recent?.n ?? 0) >= MAX_PER_HOUR) {
      log.warn("outbound.rate_limited", { userId: row.userId, sent: recent?.n });
      return { sent: false, reason: "hourly cap reached" };
    }

    const res = await transport.send(recipient, row.body, linkFor(row.taskId));
    if (!res.ok) {
      log.warn("outbound.send_failed", { notificationId, transport: transport.name, error: res.error });
      return { sent: false, reason: res.error ?? "send failed" };
    }

    // Stamp only on success, so a failure is retried rather than swallowed.
    await db.update(notifications).set({ deliveredAt: new Date() }).where(eq(notifications.id, notificationId));

    log.info("outbound.sent", { notificationId, userId: row.userId, transport: transport.name });
    return { sent: true };
  } catch (e) {
    // Never throw. The caller is a task assignment, not a messaging job.
    log.error("outbound.error", { notificationId, error: (e as Error).message });
    return { sent: false, reason: (e as Error).message };
  }
}

export async function deliverMany(ids: string[]): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;
  for (const id of ids) {
    const r = await deliverNotification(id);
    if (r.sent) sent++;
    else skipped++;
  }
  return { sent, skipped };
}

/**
 * Catch-up sweep for anything that never went out — quiet-hours suppression on
 * an interrupting transport, or a transient provider failure. Runs from the
 * 9 AM cron, which is the first moment quiet hours are over.
 */
export async function deliverPending(maxAgeHours = 14, limit = 100): Promise<{ sent: number; skipped: number }> {
  if (!isOutboundEnabled()) return { sent: 0, skipped: 0 };

  const db = getDb();
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        sql`${notifications.deliveredAt} is null`,
        sql`${notifications.createdAt} > now() - interval '${sql.raw(String(maxAgeHours))} hours'`,
        // Nothing already read needs chasing — if they've seen it in the app,
        // a message afterwards is pure noise.
        sql`${notifications.readAt} is null`,
      ),
    )
    .orderBy(sql`${notifications.createdAt} asc`)
    .limit(limit);

  return deliverMany(rows.map((r) => r.id));
}
