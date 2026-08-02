// apps/web/lib/standing.ts
//
// CONTRIBUTION STANDING — and the single door through which it is read.
//
// A standing is a manager's judgement about how someone is doing. Three people
// may see it: the person themselves, their manager, and an admin. A peer never
// sees a peer's. That rule is the whole feature — get it wrong once and you
// have not built a feedback tool, you have built a rumour mill.
//
// So the rule lives HERE, in one predicate, and every read goes through the
// loader below. The temptation is to `select({ contributionTier })` at the
// call site because it's two lines shorter; the cost is that the rule then has
// to be remembered correctly in every future page, by whoever writes it, at
// 11pm. It won't be. Columns are marked in schema.ts with the same warning.
//
// WHAT THIS DELIBERATELY DOES NOT DO
//   • No ranking. There is no "sort the team by standing", no distribution
//     chart, no counts-per-tier. You can see a person's standing on that
//     person's row; you cannot line the team up with it. SeekPeak has no
//     competitive mechanics and this is the feature most likely to grow one
//     by accident.
//   • No derivation from task data. A standing is a human's judgement with a
//     human's name on it. Computing it from throughput would make it look
//     objective while measuring whoever closes the most small tickets.

import { getDb, users, departments, contributionTierHistory, eq, and, desc, sql } from "@tu/db";
import type { User } from "@tu/db";
import { isAdmin, isPrivileged } from "./access";

export const TIERS = ["exceeding", "strong", "steady", "developing"] as const;
export type Tier = (typeof TIERS)[number];

export function isTier(v: string): v is Tier {
  return (TIERS as readonly string[]).includes(v);
}

export const TIER_LABEL: Record<Tier, string> = {
  exceeding: "Exceeding",
  strong: "Strong",
  steady: "Steady",
  developing: "Developing",
};

/**
 * Written to be read BY THE PERSON, not about them. "Steady" is where most
 * people should sit and the wording has to make that obvious — a four-point
 * scale where the middle reads as a disappointment is a two-point scale with
 * extra steps.
 */
export const TIER_BLURB: Record<Tier, string> = {
  exceeding: "You're going well beyond what the role asks, consistently enough that it's the pattern rather than a good month.",
  strong: "You're consistently above the bar, and it shows in work other people rely on.",
  steady: "You're meeting what the role asks. This is a good place to be — most of the team sits here, and it isn't a holding pen.",
  developing: "You're building towards the bar and should be getting active support to get there. This is about the work, and it's expected to move.",
};

export const TIER_COLOR: Record<Tier, string> = {
  exceeding: "var(--accent-2)",
  strong: "var(--success)",
  steady: "var(--info)",
  // Warning amber, NOT danger red. Nobody's standing should be rendered in
  // the same colour the app uses for a failure.
  developing: "var(--warning)",
};

/** The minimum ordering; only used to render the scale, never to rank people. */
export const TIER_SCALE: Tier[] = ["developing", "steady", "strong", "exceeding"];

export interface StandingEntry {
  tier: Tier | null;
  note: string | null;
  setByName: string | null;
  at: Date;
}

export interface Standing {
  userId: string;
  /** Whose standing this is, for headings. */
  subjectName: string;
  tier: Tier | null;
  note: string | null;
  setByName: string | null;
  setAt: Date | null;
  /** Newest first, excluding nothing — a cleared standing is part of the story. */
  history: StandingEntry[];
  /** True when the viewer is looking at their own. Changes how it's worded. */
  isSelf: boolean;
  /** True when the viewer may change it. */
  canEdit: boolean;
}

/** The minimum a viewer needs to know about someone to decide visibility. */
export interface StandingSubject {
  id: string;
  role: string;
  departmentId: string | null;
  managerId: string | null;
}

/**
 * THE RULE. Everything else in this file is presentation.
 *
 *   • You can always see your own.
 *   • An admin can see anyone's.
 *   • A manager can see the people they actually manage: anyone who names them
 *     as their manager, plus their own department — because "my reports" and
 *     "my department" are different sets in this org and a manager legitimately
 *     owns the standing of either.
 *   • BUT a manager does NOT see a fellow manager's or an admin's standing
 *     just for sharing a department with them. That is peer visibility, which
 *     is the exact thing this feature exists to prevent; departmental scope is
 *     about the people you are responsible for, not the people beside you. The
 *     one exception is a manager who genuinely reports to you.
 *   • Nobody else, ever. Members and viewers see only themselves.
 *
 * Note the isPrivileged() gate: being listed as someone's managerId while
 * holding a member role is not enough. Otherwise a reorganisation that pointed
 * managerId at a non-manager would quietly hand them visibility nobody granted.
 */
export function canSeeStandingOf(viewer: User, subject: StandingSubject): boolean {
  if (viewer.id === subject.id) return true;
  if (isAdmin(viewer)) return true;
  if (!isPrivileged(viewer)) return false;

  // Direct reporting line beats everything below it.
  if (subject.managerId && subject.managerId === viewer.id) return true;

  // Department scope, minus your peers. A manager sharing a department with
  // another manager or an admin is a colleague, not their supervisor.
  const subjectIsPeer = subject.role === "admin" || subject.role === "manager";
  if (subjectIsPeer) return false;

  if (viewer.departmentId && subject.departmentId && viewer.departmentId === subject.departmentId) {
    return true;
  }
  return false;
}

/**
 * Who may CHANGE a standing. Strictly narrower than who may see one: you can
 * see your own and you cannot set your own, which is the point of the feature.
 */
export function canSetStandingOf(actor: User, subject: StandingSubject): boolean {
  if (actor.id === subject.id) return false;
  return canSeeStandingOf(actor, subject);
}

/**
 * Load a standing, or null when the viewer isn't allowed one.
 *
 * Returning null rather than throwing is deliberate: the caller renders
 * nothing, and a page that forgets to handle it shows an empty space rather
 * than someone's rating. The failure mode of a mistake here should be
 * "missing", never "leaked".
 */
export async function loadStanding(viewer: User, targetId: string): Promise<Standing | null> {
  const db = getDb();

  const [subject] = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      departmentId: users.departmentId,
      managerId: users.managerId,
      tier: users.contributionTier,
      note: users.contributionTierNote,
      setAt: users.contributionTierSetAt,
      setBy: users.contributionTierSetBy,
    })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  if (!subject) return null;
  if (!canSeeStandingOf(viewer, subject)) return null;

  const setByName = subject.setBy ? await nameOf(subject.setBy) : null;

  const rawHistory = await db
    .select({
      tier: contributionTierHistory.tier,
      note: contributionTierHistory.note,
      at: contributionTierHistory.createdAt,
      setByName: sql<string | null>`(select name from users u where u.id = ${contributionTierHistory.setById})`,
    })
    .from(contributionTierHistory)
    .where(eq(contributionTierHistory.userId, targetId))
    .orderBy(desc(contributionTierHistory.createdAt))
    .limit(20);

  return {
    userId: targetId,
    subjectName: subject.name,
    tier: subject.tier && isTier(subject.tier) ? subject.tier : null,
    note: subject.note,
    setByName,
    setAt: subject.setAt ?? null,
    history: rawHistory.map((h) => ({
      tier: h.tier && isTier(h.tier) ? h.tier : null,
      note: h.note,
      setByName: h.setByName ?? null,
      at: h.at instanceof Date ? h.at : new Date(h.at),
    })),
    isSelf: viewer.id === targetId,
    canEdit: canSetStandingOf(viewer, subject),
  };
}

export interface StandingRosterEntry {
  id: string;
  name: string;
  role: string;
  departmentName: string | null;
  tier: Tier | null;
  setAt: Date | null;
  /** True when the viewer may actually change this one. */
  canEdit: boolean;
}

/**
 * Everyone whose standing this viewer is allowed to see, for the roster on
 * the rating page.
 *
 * Filtered through canSeeStandingOf in application code rather than translated
 * into a WHERE clause, deliberately. The rule has four branches and one
 * exception; expressing it twice — once in SQL, once in TypeScript — is how
 * the two versions drift and one of them quietly starts leaking. At eighteen
 * people the cost of fetching and filtering is nothing.
 */
export async function listStandingSubjects(viewer: User): Promise<StandingRosterEntry[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      departmentId: users.departmentId,
      managerId: users.managerId,
      departmentName: departments.name,
      tier: users.contributionTier,
      setAt: users.contributionTierSetAt,
      isActive: users.isActive,
    })
    .from(users)
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(eq(users.isActive, true))
    .orderBy(users.name);

  return rows
    .filter((r) => canSeeStandingOf(viewer, r))
    .map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      departmentName: r.departmentName ?? null,
      tier: r.tier && isTier(r.tier) ? r.tier : null,
      setAt: r.setAt ? new Date(r.setAt) : null,
      canEdit: canSetStandingOf(viewer, r),
    }));
}

async function nameOf(userId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.name ?? null;
}

/**
 * Has this person's standing ever been set? Used by /settings to decide
 * whether to show the card at all, without exposing anything if it hasn't.
 */
export async function hasStanding(userId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ tier: users.contributionTier })
    .from(users)
    .where(and(eq(users.id, userId), sql`${users.contributionTier} is not null`))
    .limit(1);
  return Boolean(row);
}
