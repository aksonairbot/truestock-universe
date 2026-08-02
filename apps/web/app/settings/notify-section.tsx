// apps/web/app/settings/notify-section.tsx
//
// Where a person turns off messages to their own inbox.
//
// It states plainly what happens and when, because "we may email you about
// work" is the kind of thing a tool should say out loud rather than bury in an
// admin setting — and because the honest version is short.

import { setOutboundPreference } from "./notify-actions";

export function NotifySection({
  enabled,
  channel,
  reachable,
  outboundLive,
}: {
  enabled: boolean;
  /** Which transport is actually switched on, e.g. "email". */
  channel: string | null;
  /** Whether we have an address for this person on that channel. */
  reachable: boolean;
  outboundLive: boolean;
}) {
  const label = channel === "whatsapp" ? "WhatsApp messages" : "Email notifications";

  return (
    <section className="card mt-6">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-[14px] font-semibold text-text">Notifications</h2>
      </div>
      <div className="px-6 py-4">
        <form action={setOutboundPreference} className="notif-row">
          <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
          <div className="notif-copy">
            <div className="notif-title">{label}</div>
            <div className="notif-sub">
              {!outboundLive
                ? "Not switched on for this workspace yet — nothing is being sent to anyone."
                : !reachable
                  ? "We don't have a way to reach you on this channel yet."
                  : enabled
                    ? channel === "whatsapp"
                      ? "You'll get a message when work is assigned to you or something you own is at risk. Never between 9:30pm and 8am."
                      : "You'll get an email when work is assigned to you or something you own is at risk. At most a few an hour."
                    : "Off. You'll still see everything in the Inbox when you open SeekPeak."}
            </div>
          </div>
          <button type="submit" className={`notif-toggle ${enabled ? "is-on" : ""}`} aria-pressed={enabled}>
            <span className="notif-knob" />
            <span className="sr-only">{enabled ? `Turn off ${label}` : `Turn on ${label}`}</span>
          </button>
        </form>
      </div>
    </section>
  );
}
