// apps/web/app/briefing-card.tsx
//
// Renders the morning or EoD briefing as a hero card on My Day. Picks the
// right kind based on IST hour, generates on first view, caches per-day.

import { getOrGenerateBriefing, refreshBriefing, type BriefingKind } from "./briefing-action";

function istHour(): number {
  const s = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false,
  }).format(new Date());
  return parseInt(s, 10);
}

export async function BriefingCard() {
  const hour = istHour();
  // 5am – 4pm: morning. 5pm onward (and before 5am): eod.
  const kind: BriefingKind = hour >= 5 && hour < 17 ? "morning" : "eod";
  const result = await getOrGenerateBriefing(kind);

  if (!result.ok) {
    return (
      <div className="briefing-card briefing-error">
        <span className="briefing-label">{kind === "morning" ? "Morning briefing" : "End-of-day"}</span>
        <span className="briefing-body">
          Briefing isn't available right now. {result.error ? <span className="text-text-4">({result.error})</span> : null}
        </span>
      </div>
    );
  }

  const label = kind === "morning" ? "Morning briefing" : "End of day";

  return (
    <div className={`briefing-card briefing-${kind}`}>
      <div className="briefing-head">
        <div className="briefing-icon" aria-hidden="true">
          {kind === "morning" ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
            </svg>
          )}
        </div>
        <span className="briefing-label">{label}</span>
        <form action={refreshBriefing} className="briefing-refresh">
          <input type="hidden" name="kind" value={kind} />
          <button type="submit" className="briefing-refresh-btn" title="Regenerate this briefing">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="12" height="12">
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
            Refresh
          </button>
        </form>
      </div>
      <div className="briefing-body">{result.body}</div>
      {result.model || result.generatedAt ? (
        <div className="briefing-foot">
          <span>{result.model}</span>
          {result.generatedAt ? (
            <span> · generated {new Date(result.generatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
