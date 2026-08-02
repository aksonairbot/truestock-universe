// apps/web/components/standing-card.tsx
//
// THE STANDING CARD. One component, two audiences, and the difference between
// them is the whole design problem.
//
//   • The person reading their OWN standing needs to understand it, know who
//     decided it and when, and see what was actually said. They did not ask
//     to be rated; the least the screen can do is be straight with them.
//
//   • A manager reading someone ELSE'S needs the same context plus the control
//     to change it — and a reason field they cannot skip.
//
// A SERVER component. It receives an already-authorised Standing from
// lib/standing.ts, which returns null when the viewer isn't allowed one. If
// that loader ever returns null, this renders nothing at all. The failure mode
// of a mistake here is "missing", never "leaked".
//
// TONE NOTES, which matter more than the markup:
//   • The scale is always shown in full, with the person's position marked.
//     A grade with no visible scale invites the worst guess about what it
//     means, and "Developing" reads very differently when you can see it sits
//     below "Steady" rather than at the bottom of ten rungs.
//   • Not-yet-set says so plainly instead of showing an empty slot. An unset
//     standing is not a bad standing.
//   • No trophies, no progress bar towards the next tier, no "you're 80% of
//     the way to Strong". This is not a game and pretending otherwise would
//     be both dishonest and, per this project's standing rule, banned.

import { ActionForm } from "@/components/action-form";
import { setContributionTier } from "@/app/members/standing-actions";
import { TIER_LABEL, TIER_BLURB, TIER_COLOR, TIER_SCALE, type Standing, type Tier } from "@/lib/standing";

function fmtIst(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function StandingCard({
  standing,
  subjectName,
}: {
  /** Already authorised. Null means the viewer may not see it — render nothing. */
  standing: Standing | null;
  /** Only used in the manager view, to name who is being rated. */
  subjectName?: string;
}) {
  if (!standing) return null;

  const { tier, note, setByName, setAt, isSelf, canEdit, history } = standing;
  const heading = isSelf ? "Your standing" : `${subjectName ?? "This person"}'s standing`;

  return (
    <section className="card stand" aria-labelledby="stand-h">
      <div className="stand-head">
        <div>
          <h2 id="stand-h" className="stand-title">{heading}</h2>
          <p className="stand-sub">
            {isSelf
              ? "Set by your manager. Only you, your manager and an admin can see this — nobody else on the team can."
              : "Only this person, their manager and an admin can see this. Their colleagues cannot."}
          </p>
        </div>
        {tier ? (
          <span className="stand-chip" style={{ color: TIER_COLOR[tier], borderColor: TIER_COLOR[tier] }}>
            {TIER_LABEL[tier]}
          </span>
        ) : (
          <span className="stand-chip is-unset">Not set</span>
        )}
      </div>

      <div className="stand-body">
        {tier ? (
          <>
            <p className="stand-blurb">{TIER_BLURB[tier]}</p>

            {/* The full scale, always. A mark with no visible scale invites
                the worst available reading of it. */}
            <ol className="stand-scale" aria-label="The four standings">
              {TIER_SCALE.map((t) => {
                const here = t === tier;
                return (
                  <li
                    key={t}
                    className={`stand-step ${here ? "is-here" : ""}`}
                    style={here ? { color: TIER_COLOR[t], borderColor: TIER_COLOR[t] } : undefined}
                    aria-current={here ? "true" : undefined}
                  >
                    {TIER_LABEL[t]}
                    {here ? <span className="sr-only"> — this is where you are</span> : null}
                  </li>
                );
              })}
            </ol>

            {note ? (
              <blockquote className="stand-note">
                <p>{note}</p>
                <footer className="stand-note-by">
                  {setByName ? `— ${setByName}` : "— your manager"}
                  {setAt ? `, ${fmtIst(setAt)}` : null}
                </footer>
              </blockquote>
            ) : (
              <p className="stand-empty">
                No reason was recorded with this. {isSelf ? "It's fair to ask your manager for one." : null}
              </p>
            )}
          </>
        ) : (
          <p className="stand-empty">
            {isSelf
              ? "Your manager hasn't set this yet. Nothing is wrong — it just hasn't been filled in."
              : "No standing has been set for this person yet."}
          </p>
        )}

        {history.length > 1 ? (
          <details className="stand-hist">
            <summary>History ({history.length} changes)</summary>
            <ul className="stand-hist-list">
              {history.map((h, i) => (
                <li key={`${h.at.toISOString()}-${i}`} className="stand-hist-row">
                  <span
                    className="stand-hist-chip"
                    style={h.tier ? { color: TIER_COLOR[h.tier], borderColor: TIER_COLOR[h.tier] } : undefined}
                  >
                    {h.tier ? TIER_LABEL[h.tier] : "Cleared"}
                  </span>
                  <span className="stand-hist-meta">
                    {h.setByName ?? "Someone"} · {fmtIst(h.at)}
                  </span>
                  {h.note ? <span className="stand-hist-note">{h.note}</span> : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      {canEdit ? <StandingEditor standing={standing} /> : null}
    </section>
  );
}

/**
 * The manager's control. Deliberately not a bare dropdown that saves on
 * change: a standing is not a status field, and making it a one-click gesture
 * would be the wrong ergonomics for the most consequential thing on the page.
 * You pick, you write why, you press Save.
 */
function StandingEditor({ standing }: { standing: Standing }) {
  const current: Tier | "" = standing.tier ?? "";

  return (
    <div className="stand-edit">
      <ActionForm action={setContributionTier} className="stand-form">
        <input type="hidden" name="memberId" value={standing.userId} />

        <label className="stand-field">
          <span className="stand-label">Standing</span>
          <select
            name="tier"
            defaultValue={current}
            className="content-select"
            style={standing.tier ? { color: TIER_COLOR[standing.tier], borderColor: TIER_COLOR[standing.tier] } : undefined}
          >
            <option value="">Not set / clear it</option>
            {TIER_SCALE.slice().reverse().map((t) => (
              <option key={t} value={t}>{TIER_LABEL[t]}</option>
            ))}
          </select>
        </label>

        <label className="stand-field stand-field-wide">
          <span className="stand-label">
            Reason <span className="stand-req">required — they will read this</span>
          </span>
          <textarea
            name="note"
            rows={3}
            required
            minLength={12}
            maxLength={1000}
            defaultValue={standing.note ?? ""}
            placeholder="What led to this, and what would change it. Be specific enough to act on."
            className="stand-textarea"
          />
        </label>

        <div className="stand-foot">
          <button type="submit" className="btn btn-primary btn-sm">Save standing</button>
          <span className="stand-hint">
            They&rsquo;ll be notified that it changed — the message won&rsquo;t say which standing, only
            that there&rsquo;s something to read.
          </span>
        </div>
      </ActionForm>
    </div>
  );
}
