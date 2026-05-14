// apps/web/app/badges/page.tsx
//
// Dedicated badges page — shows all 30 badges in a card grid with progress bars.

import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getBadgeProgress, BADGES } from "@/lib/badges";

export default async function BadgesPage() {
  const me = await getCurrentUser();
  const progress = await getBadgeProgress(me.id);

  const totalXp = progress
    .filter((p) => p.earned)
    .reduce((sum, p) => sum + p.badge.xp, 0);
  const earnedCount = progress.filter((p) => p.earned).length;

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6">
      <div className="bp-header">
        <div>
          <h1 className="bp-title">Achievements</h1>
          <p className="bp-subtitle">
            {earnedCount} / {BADGES.length} badges earned · {totalXp} XP
          </p>
        </div>
      </div>

      <div className="bp-grid">
        {progress.map((p) => {
          const pct = p.badge.target > 0
            ? Math.min((p.current / p.badge.target) * 100, 100)
            : 0;

          return (
            <div
              key={p.badge.key}
              className={`bp-card ${p.earned ? "bp-card-earned" : ""}`}
              style={{ "--bc": p.badge.color } as React.CSSProperties}
            >
              {/* Number badge */}
              <div className="bp-num" style={{ background: p.badge.color }}>
                {String(p.badge.num).padStart(2, "0")}
              </div>

              {/* Earned check */}
              {p.earned && <div className="bp-check">✓</div>}

              {/* Icon */}
              <div className="bp-icon-wrap">
                <span className="bp-icon">{p.badge.icon}</span>
              </div>

              {/* Info */}
              <div className="bp-name">{p.badge.name}</div>
              <div className="bp-desc">{p.badge.description}</div>

              {/* XP */}
              <div className="bp-xp" style={{ color: p.badge.color }}>
                ★ {p.badge.xp} XP
              </div>

              {/* Progress bar */}
              <div className="bp-progress">
                <div className="bp-bar">
                  <div
                    className="bp-bar-fill"
                    style={{ width: `${pct}%`, background: p.badge.color }}
                  />
                </div>
                <span className="bp-count">
                  {p.current} / {p.badge.target}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bp-footer">
        ★ Keep going! Every task you complete brings you closer to the next badge.
      </div>
    </div>
  );
}
