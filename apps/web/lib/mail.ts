// apps/web/lib/mail.ts
//
// Transactional email via Resend. Zero dependencies — plain fetch against
// their REST API, the same shape as lib/upload-post.ts.
//
// WHY EMAIL AND NOT WHATSAPP
// WhatsApp was the first choice and turned out to be structurally wrong for
// this. Meta only permits free-form messages inside a 24-hour window that the
// RECIPIENT opens by messaging you first; a "task assigned to you" notification
// is by definition outside it, so every message would need a pre-approved
// template and a Meta review cycle. Email has no window, no template approval,
// no sender-number problem, and everyone already has a truestock.in address.
//
// Env:
//   RESEND_API_KEY   required to send at all
//   MAIL_FROM        e.g. "SeekPeak <notifications@seekpeak.in>"
//   EMAIL_ENABLED    must be exactly "true" for anything to leave

import { log } from "./log";

const API = "https://api.resend.com/emails";
const TIMEOUT_MS = 15_000;

export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export function isMailEnabled(): boolean {
  return process.env.EMAIL_ENABLED === "true" && isMailConfigured();
}

export type MailResult = { ok: boolean; id?: string; error?: string };

/** Escape for HTML. Notification bodies contain task titles people wrote. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A deliberately plain email. No images, no tracking pixels, no marketing
 * chrome — this is a work notification, and the faster it reads the better.
 * Inline styles only, because every mail client strips <style> blocks.
 */
function render(body: string, link: string | null, actionLabel: string): { html: string; text: string } {
  const safe = esc(body);
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5ea;">
    <tr><td style="padding:20px 24px 8px;font-size:13px;font-weight:600;color:#6e6e73;letter-spacing:0.02em;">SeekPeak</td></tr>
    <tr><td style="padding:0 24px 20px;font-size:15px;line-height:1.5;color:#1d1d1f;">${safe}</td></tr>
    ${
      link
        ? `<tr><td style="padding:0 24px 24px;"><a href="${esc(link)}" style="display:inline-block;background:#5b5bd6;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:9px;">${esc(actionLabel)}</a></td></tr>`
        : ""
    }
    <tr><td style="padding:14px 24px;border-top:1px solid #f0f0f2;font-size:11.5px;color:#8e8e93;line-height:1.5;">
      You're getting this because it was assigned to you or you own it.
      Turn these off in Settings → Notifications.
    </td></tr>
  </table>
</body></html>`;

  const text = link ? `${body}\n\n${actionLabel}: ${link}\n\n—\nTurn these off in Settings → Notifications.` : body;
  return { html, text };
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  body: string;
  link?: string | null;
  actionLabel?: string;
}): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) return { ok: false, error: "Email is not configured" };

  const { html, text } = render(opts.body, opts.link ?? null, opts.actionLabel ?? "Open in SeekPeak");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [opts.to], subject: opts.subject.slice(0, 200), html, text }),
      signal: controller.signal,
      cache: "no-store",
    });

    const data = (await res.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;

    if (!res.ok) {
      const msg = data?.message ?? data?.name ?? `HTTP ${res.status}`;
      // 403 here is almost always an unverified sending domain — the single
      // most common way this fails, so it gets named rather than left as a code.
      const hint =
        res.status === 403
          ? " (usually an unverified sending domain — add the SPF/DKIM records Resend gives you for seekpeak.in)"
          : "";
      log.warn("mail.rejected", { status: res.status, error: msg });
      return { ok: false, error: `${msg}${hint}` };
    }

    log.info("mail.sent", { id: data?.id });
    return { ok: true, id: data?.id };
  } catch (e) {
    const err = e as Error;
    const msg = err.name === "AbortError" ? "Email provider did not respond in time." : err.message;
    log.error("mail.error", { error: msg });
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}
