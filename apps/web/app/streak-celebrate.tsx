// apps/web/app/streak-celebrate.tsx
//
// When a streak threshold (3/7/14/30/60/100) is hit on a given IST day for
// the first time, surface a one-off celebration overlay AND fire the
// personal-milestone confetti. The overlay uses the AI-generated cosmic
// "celebration poster" as background.
//
// Gated by localStorage so reloading doesn't replay.

"use client";

import { useEffect, useState } from "react";
import { firePersonalMilestoneConfetti } from "./tasks/milestone";

const MESSAGES: Record<number, string> = {
  3: "Three days in a row. Momentum building.",
  7: "Seven-day streak. Crossing the cold-start.",
  14: "Two weeks of consistency. The pattern is real.",
  30: "A month. Closers don't get here by accident.",
  60: "Sixty straight days. Quietly extraordinary.",
  100: "One hundred. Hall of fame.",
};

export function StreakClientCelebrate({ threshold }: { threshold: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const key = `tu.streak.celebrated.${threshold}.${new Date().toISOString().slice(0, 10)}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      // ignore — still proceed
    }
    const t = setTimeout(() => {
      setShow(true);
      firePersonalMilestoneConfetti();
    }, 400);
    return () => clearTimeout(t);
  }, [threshold]);

  if (!show) return null;

  const msg = MESSAGES[threshold] ?? `${threshold}-day streak. Keep it going.`;

  return (
    <div
      className="streak-card-backdrop"
      onClick={() => setShow(false)}
      role="dialog"
      aria-label={`${threshold}-day streak celebration`}
    >
      <div
        className="streak-card"
        style={{ backgroundImage: "url(/celebrate/streak-card.webp)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="streak-card-fade" />
        <div className="streak-card-body">
          <div className="streak-card-kicker">🔥 streak milestone</div>
          <div className="streak-card-n">{threshold}</div>
          <div className="streak-card-units">days in a row</div>
          <div className="streak-card-msg">{msg}</div>
          <button
            type="button"
            className="streak-card-dismiss"
            onClick={() => setShow(false)}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
