// apps/web/app/rating/page.tsx
//
// "Where do I stand, and what should I do about it."
//
// Two halves, and the order is the argument:
//
//   1. YOUR STANDING — what your manager actually decided, in their words,
//      with their name and the date on it. This comes first because it is the
//      answer to the question the person came here with.
//
//   2. WHAT YOUR MANAGER CAN SEE — the handful of facts about your own work
//      that are visible to them, each linked to the actual tasks.
//
// WHAT THIS PAGE MUST NEVER DO, and the reason the rule is written here where
// the next person will find it: promise a rating. The request that produced
// this page was "do 5 tasks and B becomes A". The standing is a human's
// judgement, so any threshold this page states is a cheque only a manager can
// cash — and when they don't, the person has a grievance with a screenshot.
// Amit chose "show influence, not promises" and "manager decides" what counts.
//
// So: no score, no thresholds, no progress bar toward a tier, no comparison to
// anyone else. Facts, and a way to act on them.

import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { loadStanding } from "@/lib/standing";
import { getRatingSignals } from "@/lib/rating-signals";
import { StandingCard } from "@/components/standing-card";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Rating · SeekPeak",
  description: "Your standing, and what shapes it",
};

export default async function RatingPage() {
  const me = await getCurrentUser();

  // Always the viewer's own. loadStanding authorises anyway, but passing
  // me.id rather than accepting an id from anywhere means this page has no
  // parameter to get wrong.
  const [standing, signals] = await Promise.all([
    loadStanding(me, me.id),
    getRatingSignals(me.id),
  ]);

  const toDo = signals.filter((s) => s.tone === "attention");

  return (
    <div className="page-content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Rating</h1>
          <p className="page-sub">Where you stand, and what your manager can see.</p>
        </div>
      </div>

      <div className="rate-wrap">
        <StandingCard standing={standing} />

        <section className="card rate-sec">
          <div className="rate-head">
            <h2 className="rate-h">What your manager can see</h2>
            <p className="rate-sub">
              Facts about your own work, not a score. Your standing is set by a person who weighs
              these alongside things SeekPeak can&rsquo;t measure &mdash; how hard the work was, what you
              picked up for someone else, what went wrong that wasn&rsquo;t yours.
            </p>
          </div>

          {signals.length === 0 ? (
            <div className="rate-body">
              <p className="rate-empty">
                Nothing to show yet &mdash; you&rsquo;ve no overdue work, and there isn&rsquo;t enough
                finished in the last month to say anything useful about. Check back once a few things
                have run their course.
              </p>
            </div>
          ) : (
            <ul className="rate-list">
              {signals.map((s) => (
                <li key={s.key} className={`rate-item is-${s.tone}`}>
                  <div className="rate-fig">
                    <span className="rate-val">{s.value}</span>
                    <span className="rate-lab">{s.label}</span>
                  </div>
                  <div className="rate-say">
                    <p>{s.detail}</p>
                    {s.href ? (
                      <Link href={s.href} className="rate-cta">
                        {s.cta ?? "Open"} &rarr;
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="rate-foot">
            {toDo.length > 0 ? (
              <>
                <strong>
                  {toDo.length === 1
                    ? "There's one thing above you could act on today."
                    : `There are ${toDo.length} things above you could act on today.`}
                </strong>{" "}
                None of them move your standing by themselves &mdash; a person decides that. But they&rsquo;re
                the things most likely to come up when they do.
              </>
            ) : (
              <>
                Nothing here needs attention right now. If you want to know what would strengthen your
                standing, the most useful thing is to ask your manager directly &mdash; they can tell you
                what they&rsquo;re weighing, and this page can&rsquo;t.
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
