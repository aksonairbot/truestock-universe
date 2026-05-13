// apps/web/lib/whatsapp.ts
//
// WhatsApp messaging via Twilio. Sends templated or free-form messages.
//
// Env vars:
//   TWILIO_ACCOUNT_SID      — Twilio account SID (starts with AC)
//   TWILIO_API_KEY_SID      — Twilio API Key SID (starts with SK)
//   TWILIO_API_KEY_SECRET   — Twilio API Key secret
//   TWILIO_WHATSAPP_FROM    — Twilio WhatsApp sender number e.g. whatsapp:+14155238886
//   WHATSAPP_GROUP_NUMBER   — Team group number e.g. +919876543210 (optional)
//
// Auth uses API Key (SK + secret). Account SID is needed for the URL path.

import { log } from "./log";

interface SendResult {
  ok: boolean;
  sid?: string;
  error?: string;
}

/**
 * Send a WhatsApp message via Twilio.
 * @param to  — phone number in E.164 format e.g. +919876543210
 * @param body — message text (supports WhatsApp formatting: *bold*, _italic_, ~strike~)
 */
export async function sendWhatsApp(to: string, body: string): Promise<SendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !apiKeySid || !apiKeySecret || !from) {
    log.warn("whatsapp.skipped", { reason: "missing TWILIO env vars" });
    return { ok: false, error: "Twilio not configured" };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams({
    From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
    To: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
    Body: body,
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await res.json();
    if (!res.ok) {
      log.error("whatsapp.send_failed", { to, status: res.status, error: data?.message });
      return { ok: false, error: data?.message ?? `HTTP ${res.status}` };
    }

    log.info("whatsapp.sent", { to, sid: data.sid });
    return { ok: true, sid: data.sid };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("whatsapp.error", { to, error: msg });
    return { ok: false, error: msg };
  }
}

/** Send to the configured team group number. */
export async function sendTeamWhatsApp(body: string): Promise<SendResult> {
  const groupNumber = process.env.WHATSAPP_GROUP_NUMBER;
  if (!groupNumber) {
    log.warn("whatsapp.group_skipped", { reason: "WHATSAPP_GROUP_NUMBER not set" });
    return { ok: false, error: "group number not configured" };
  }
  return sendWhatsApp(groupNumber, body);
}
