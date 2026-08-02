// apps/web/lib/game.ts
//
// Levels and the activity leaderboard, on top of the badge/XP system that
// already exists in lib/badges.ts.
//
// A NOTE ON WHY THIS EXISTS, because it reverses an earlier rule.
// Gamification was banned in this project from the start — no badges, no XP,
// no leaderboards. Amit reversed that deliberately on 2026-08-02, with the
// tradeoffs stated: that a visible path to a rating is a promise only a
// manager can keep, and that ranking colleagues on a performance rating is
// corrosive. He chose full gamification anyway. It's his company and his call.
//
// ONE THING THAT DID NOT CHANGE, and must not without him saying so:
//
//   THE LEADERBOARD RANKS ACTIVITY, NEVER STANDING.
//
// The contribution standing is private by his own earlier, explicit
// requirement — "this info can only be seen by themselves and not others" —
// and that requirement has not been reversed. XP comes from badges earned for
// work anyone can see happening; a person's tier is a manager's private
// assessment of them. Publishing the second under the banner of the first
// would be the single most damaging thing this app could do to eighteen
// people who sit in one room. If a leaderboard of tiers is ever wanted, it
// needs to be asked for in those words.
//
// XP is DERIVED, not stored — it is the sum of the XP on the badges a person
// has actually earned. There is no balance to drift, nothing to award twice,
// and no way to top yourself up.

import { getDb, users, userBadges, eq } from "@tu/db";
import { BADGES, BADGE_MAP } from "./badges";

export const MAX_XP = BADGES.reduce((sum, b) => sum + b.xp, 0);

export interface Level {
  n: number;
  name: string;
  /** XP at which this level starts. */
  at: number;
}

/**
 * Nine levels across the ~4,800 XP available.
 *
 * Named for craft rather than combat — "Regular" and "Backbone" describe
 * someone you work with; "Warlord" would be describing a game character. The
 * early ones are close together so a new joiner moves twice in their first
 * fortnight and can see the thing works; the later ones stretch out.
 */
export const LEVELS: Level[] = [
  { n: 1, name: "Newcomer",  at: 0 },
  { n: 2, name: "Finding it", at: 60 },
  { n: 3, name: "Regular",   at: 180 },
  { n: 4, name: "Steady",    at: 400 },
  { n: 5, name: "Trusted",   at: 750 },
  { n: 6, name: "Backbone",  at: 1200 },
  { n: 7, name: "Standard-setter", at: 1900 },
  { n: 8, name: "Quietly essential", at: 2800 },
  { n: 9, name: "Institution", at: 3900 },
];

export interface LevelState {
  level: Level;
  next: Level | null;
  xp: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level spans. Null at the top. */
  span: number | null;
  /** 0-100 through the current level. 100 at the top. */
  pct: number;
  toNext: number;
}

export function levelFromXp(xp: number): LevelState {
  const safe = Math.max(0, Math.floor(xp) || 0);
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (safe >= LEVELS[i]!.at) idx = i;
  const level = LEVELS[idx]!;
  const next = LEVELS[idx + 1] ?? null;
  const into = safe - level.at;
  const span = next ? next.at - level.at : null;
  return {
    level,
    next,
    xp: safe,
    into,
    span,
    pct: span ? Math.max(0, Math.min(100, (into / span) * 100)) : 100,
    toNext: next ? Math.max(0, next.at - safe) : 0,
  };
}

export interface LeaderRow {
  id: string;
  name: string;
  xp: number;
  badges: number;
  level: Level;
  rank: number;
  isMe: boolean;
}

/**
 * The team, by XP.
 *
 * ACTIVITY ONLY — see the note at the top of this file. Nothing here reads
 * contribution_tier, and nothing here should ever start to.
 *
 * One query for every badge row, summed in code. At eighteen people and thirty
 * possible badges that is at most 540 rows, which is cheaper to fetch than to
 * be clever about, and it means the XP values live in one place (lib/badges.ts)
 * rather than being duplicated into SQL where they would drift.
 */
export async function getXpLeaderboard(meId: string): Promise<LeaderRow[]> {
  const db = getDb();

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      badgeKey: userBadges.badgeKey,
    })
    .from(users)
    .leftJoin(userBadges, eq(userBadges.userId, users.id))
    .where(eq(users.isActive, true));

  const tally = new Map<string, { name: string; xp: number; badges: number }>();
  for (const r of rows) {
    const entry = tally.get(r.id) ?? { name: r.name, xp: 0, badges: 0 };
    if (r.badgeKey) {
      const def = BADGE_MAP.get(r.badgeKey);
      if (def) {
        entry.xp += def.xp;
        entry.badges += 1;
      }
    }
    tally.set(r.id, entry);
  }

  return Array.from(tally.entries())
    .map(([id, v]) => ({ id, name: v.name, xp: v.xp, badges: v.badges }))
    // Ties broken by name so the order is stable between loads. A leaderboard
    // that reshuffles equal scores on every refresh looks broken.
    .sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name))
    .map((v, i) => ({
      ...v,
      level: levelFromXp(v.xp).level,
      rank: i + 1,
      isMe: v.id === meId,
    }));
}
