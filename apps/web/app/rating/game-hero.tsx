// apps/web/app/rating/game-hero.tsx
//
// The level ring, the badge shelf and the leaderboard.
//
// A CLIENT component only because of the entrance animation — the ring draws
// itself and the XP counts up on mount, which needs the browser. Everything it
// shows is computed on the server and passed in.
//
// The one thing this must keep straight: THIS IS NOT THE STANDING. The dial
// above it is a manager's judgement of a person; this is a tally of work
// they've done. They sit on the same page and they are different claims, so
// the copy says so out loud rather than letting the proximity imply a link
// that would be a promise nobody can keep.

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { LevelState, LeaderRow } from "@/lib/game";

export interface BadgeView {
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  xp: number;
  earned: boolean;
  current: number;
  target: number;
}

/** Counts from 0 to `to` on mount. Pure garnish, and it's the good kind. */
function useCountUp(to: number, ms = 900): number {
  const [n, setN] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setN(to);
      return;
    }
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      // easeOutCubic — fast then settling, which reads as "arriving at" a
      // number rather than "spinning to" one.
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [to, ms]);
  return n;
}

export function GameHero({
  state,
  badges,
  leaders,
  rank,
}: {
  state: LevelState;
  badges: BadgeView[];
  leaders: LeaderRow[];
  rank: number | null;
}) {
  const xp = useCountUp(state.xp);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDrawn(true), 60);
    return () => clearTimeout(t);
  }, []);

  const R = 52;
  const C = 2 * Math.PI * R;
  const earned = badges.filter((b) => b.earned);
  // The three closest to falling — what to show someone who wants a next step.
  const nearly = badges
    .filter((b) => !b.earned && b.current > 0)
    .sort((a, b) => b.current / b.target - a.current / a.target)
    .slice(0, 3);

  return (
    <div className="gh">
      <section className="card gh-hero">
        <div className="gh-ring-wrap">
          <svg viewBox="0 0 120 120" className="gh-ring" role="img" aria-label={`Level ${state.level.n}, ${state.xp} XP`}>
            <circle cx="60" cy="60" r={R} className="gh-ring-bg" />
            <circle
              cx="60" cy="60" r={R} className="gh-ring-fg"
              style={{
                strokeDasharray: C,
                strokeDashoffset: drawn ? C - (C * state.pct) / 100 : C,
              }}
            />
          </svg>
          <div className="gh-ring-mid">
            <span className="gh-lvl-n">{state.level.n}</span>
            <span className="gh-lvl-l">level</span>
          </div>
        </div>

        <div className="gh-meta">
          <div className="gh-name">{state.level.name}</div>
          <div className="gh-xp">
            <strong>{xp.toLocaleString("en-IN")}</strong> XP
            {rank ? <span className="gh-rank">#{rank} on the team</span> : null}
          </div>
          <div className="gh-next">
            {state.next ? (
              <>
                <span className="gh-next-t">
                  {state.toNext.toLocaleString("en-IN")} XP to <strong>{state.next.name}</strong>
                </span>
                <span className="gh-bar"><i style={{ width: drawn ? `${state.pct}%` : "0%" }} /></span>
              </>
            ) : (
              <span className="gh-next-t">Top level. There is nothing above this one.</span>
            )}
          </div>
          {/* Said plainly, because the layout would otherwise imply it. */}
          <p className="gh-disclaim">
            XP and badges track work you&rsquo;ve done. They don&rsquo;t set your standing above &mdash; a person
            does that.
          </p>
        </div>
      </section>

      <section className="card gh-sec">
        <div className="gh-head">
          <h2 className="gh-h">Badges</h2>
          <span className="gh-count">{earned.length} of {badges.length}</span>
        </div>

        {earned.length === 0 && nearly.length === 0 ? (
          <p className="gh-empty">Nothing earned yet. They come from finishing work, not from collecting them.</p>
        ) : (
          <>
            <ul className="gh-badges">
              {earned.map((b, i) => (
                <li
                  key={b.key}
                  className="gh-badge is-earned"
                  style={{ ["--i" as string]: String(i), ["--c" as string]: b.color }}
                  title={`${b.name} — ${b.description}`}
                >
                  <span className="gh-badge-ic">{b.icon}</span>
                  <span className="gh-badge-n">{b.name}</span>
                  <span className="gh-badge-x">+{b.xp}</span>
                </li>
              ))}
            </ul>

            {nearly.length > 0 ? (
              <>
                <div className="gh-sub">Closest to earning</div>
                <ul className="gh-near">
                  {nearly.map((b) => (
                    <li key={b.key} className="gh-n" style={{ ["--c" as string]: b.color }}>
                      <span className="gh-n-ic">{b.icon}</span>
                      <span className="gh-n-meta">
                        <span className="gh-n-name">{b.name}</span>
                        <span className="gh-n-desc">{b.description}</span>
                      </span>
                      <span className="gh-n-p">
                        <span className="gh-n-bar">
                          <i style={{ width: drawn ? `${Math.min(100, (b.current / b.target) * 100)}%` : "0%" }} />
                        </span>
                        <span className="gh-n-num">{b.current}/{b.target}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
        <div className="gh-foot">
          <Link href="/badges" className="gh-all">See all badges &rarr;</Link>
        </div>
      </section>

      <section className="card gh-sec">
        <div className="gh-head">
          <h2 className="gh-h">Team</h2>
          <span className="gh-count">by XP</span>
        </div>
        <ol className="gh-lead">
          {leaders.slice(0, 10).map((l, i) => (
            <li
              key={l.id}
              className={`gh-lead-r ${l.isMe ? "is-me" : ""}`}
              style={{ ["--i" as string]: String(i) }}
            >
              <span className={`gh-lead-p p${l.rank <= 3 ? l.rank : 0}`}>{l.rank}</span>
              <span className="gh-lead-n">{l.isMe ? "You" : l.name}</span>
              <span className="gh-lead-l">{l.level.name}</span>
              <span className="gh-lead-x">{l.xp.toLocaleString("en-IN")}</span>
            </li>
          ))}
        </ol>
        {/* The distinction that keeps this from being a public performance
            ranking, which is a different and much worse thing. */}
        <div className="gh-foot gh-foot-note">
          This ranks activity, not ratings. Nobody&rsquo;s standing is visible here.
        </div>
      </section>
    </div>
  );
}
