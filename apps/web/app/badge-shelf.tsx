// apps/web/app/badge-shelf.tsx
//
// Compact badge display for Today page and member profiles.
// Links to /badges for the full grid.

import Link from "next/link";
import { getUserBadges, BADGES } from "@/lib/badges";

export async function BadgeShelf({
  userId,
  compact = false,
}: {
  userId: string;
  compact?: boolean;
}) {
  const earned = await getUserBadges(userId);

  if (earned.length === 0 && compact) return null;

  const totalXp = earned.reduce((sum, b) => sum + b.xp, 0);

  if (compact) {
    return (
      <Link href="/badges" className="badge-shelf-compact">
        {earned.slice(0, 6).map((b) => (
          <span
            key={b.key}
            className="badge-chip"
            style={{ borderColor: `${b.color}40`, background: `${b.color}12` }}
            title={`${b.name} — ${b.description}`}
          >
            <span className="badge-icon">{b.icon}</span>
          </span>
        ))}
        {earned.length > 6 && (
          <span className="badge-chip badge-more">+{earned.length - 6}</span>
        )}
        <span className="badge-xp-tag">★ {totalXp} XP</span>
      </Link>
    );
  }

  // Full shelf for profile page
  return (
    <div className="badge-shelf">
      <div className="badge-shelf-header">
        <span className="badge-shelf-title">Achievements</span>
        <Link href="/badges" className="badge-shelf-link">
          {earned.length} / {BADGES.length} · View all →
        </Link>
      </div>
      <div className="badge-shelf-chips">
        {earned.map((b) => (
          <span
            key={b.key}
            className="badge-chip"
            style={{ borderColor: `${b.color}40`, background: `${b.color}12` }}
            title={`${b.name} — ${b.description}`}
          >
            <span className="badge-icon">{b.icon}</span>
          </span>
        ))}
        {earned.length === 0 && (
          <span className="badge-empty">No badges yet — <Link href="/badges">see what you can earn →</Link></span>
        )}
      </div>
    </div>
  );
}

/** Tiny inline badge count for members table rows */
export async function BadgeCount({ userId }: { userId: string }) {
  const earned = await getUserBadges(userId);
  if (earned.length === 0) return null;
  const totalXp = earned.reduce((sum, b) => sum + b.xp, 0);

  return (
    <span className="badge-inline">
      {earned.slice(0, 3).map((b) => (
        <span key={b.key} title={b.name} className="badge-inline-icon">{b.icon}</span>
      ))}
      {earned.length > 3 && <span className="badge-inline-more">+{earned.length - 3}</span>}
      <span className="badge-inline-xp">★{totalXp}</span>
    </span>
  );
}
