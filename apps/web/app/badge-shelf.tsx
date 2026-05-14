// apps/web/app/badge-shelf.tsx
//
// Server component that renders a user's earned badges.
// Used on member profiles, Today page, My Week/Month.

import { getUserBadges, BADGES, TIER_ORDER, type BadgeDef } from "@/lib/badges";

function fmtBadgeDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

export async function BadgeShelf({
  userId,
  compact = false,
  showLocked = false,
}: {
  userId: string;
  compact?: boolean;
  showLocked?: boolean;
}) {
  const earned = await getUserBadges(userId);
  const earnedKeys = new Set(earned.map((b) => b.key));

  if (earned.length === 0 && !showLocked) return null;

  // Sort earned: highest tier first, then by date
  const sorted = [...earned].sort((a, b) => {
    const tierDiff = (TIER_ORDER[b.tier] ?? 0) - (TIER_ORDER[a.tier] ?? 0);
    return tierDiff !== 0 ? tierDiff : b.awardedAt.getTime() - a.awardedAt.getTime();
  });

  // Locked badges (not yet earned)
  const locked = showLocked
    ? BADGES.filter((b) => !earnedKeys.has(b.key)).sort((a, b) => (TIER_ORDER[a.tier] ?? 0) - (TIER_ORDER[b.tier] ?? 0))
    : [];

  if (compact) {
    return (
      <div className="badge-shelf-compact">
        {sorted.slice(0, 8).map((b) => (
          <span key={b.key} className={`badge-chip badge-${b.tier}`} title={`${b.name} — ${b.description}`}>
            <span className="badge-icon">{b.icon}</span>
          </span>
        ))}
        {sorted.length > 8 && (
          <span className="badge-chip badge-more">+{sorted.length - 8}</span>
        )}
      </div>
    );
  }

  return (
    <div className="badge-shelf">
      <div className="badge-shelf-header">
        <span className="badge-shelf-title">Achievements</span>
        <span className="badge-shelf-count">{earned.length} / {BADGES.length}</span>
      </div>

      {sorted.length > 0 && (
        <div className="badge-grid">
          {sorted.map((b) => (
            <div key={b.key} className={`badge-card badge-${b.tier}`}>
              <div className="badge-card-icon">{b.icon}</div>
              <div className="badge-card-info">
                <div className="badge-card-name">{b.name}</div>
                <div className="badge-card-desc">{b.description}</div>
                <div className="badge-card-date">{fmtBadgeDate(b.awardedAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {locked.length > 0 && (
        <>
          <div className="badge-locked-divider">Locked</div>
          <div className="badge-grid">
            {locked.map((b) => (
              <div key={b.key} className="badge-card badge-locked">
                <div className="badge-card-icon badge-icon-locked">{b.icon}</div>
                <div className="badge-card-info">
                  <div className="badge-card-name">{b.name}</div>
                  <div className="badge-card-desc">{b.description}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Tiny inline badge count for members table rows */
export async function BadgeCount({ userId }: { userId: string }) {
  const earned = await getUserBadges(userId);
  if (earned.length === 0) return null;

  // Show top 3 by tier
  const top = [...earned]
    .sort((a, b) => (TIER_ORDER[b.tier] ?? 0) - (TIER_ORDER[a.tier] ?? 0))
    .slice(0, 3);

  return (
    <span className="badge-inline">
      {top.map((b) => (
        <span key={b.key} title={b.name} className="badge-inline-icon">{b.icon}</span>
      ))}
      {earned.length > 3 && <span className="badge-inline-more">+{earned.length - 3}</span>}
    </span>
  );
}
