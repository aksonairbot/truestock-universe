// apps/web/lib/badges.ts
//
// Achievement badge system. Badges are private to the individual —
// visible on your own profile + Today page, not on public leaderboards.
//
// Badge definitions live here; the DB just tracks (userId, badgeKey, awardedAt).
// The award engine runs after task completion, comment, etc.

import { getDb, userBadges, tasks, taskComments, eq, and, sql } from "@tu/db";
import { log } from "@/lib/log";

// ---------------------------------------------------------------------------
// Badge catalogue
// ---------------------------------------------------------------------------

export interface BadgeDef {
  key: string;
  name: string;
  description: string;
  icon: string;    // emoji
  tier: "bronze" | "silver" | "gold" | "platinum" | "diamond";
  category: "milestone" | "streak" | "speed" | "quality" | "collab" | "special";
}

export const BADGES: BadgeDef[] = [
  // ── Milestone: task completion counts ──
  { key: "first_blood",       name: "First Blood",        description: "Closed your first task",               icon: "🎯", tier: "bronze",   category: "milestone" },
  { key: "getting_warmed_up", name: "Getting Warmed Up",   description: "Closed 10 tasks",                      icon: "🔥", tier: "bronze",   category: "milestone" },
  { key: "quarter_century",   name: "Quarter Century",     description: "Closed 25 tasks",                      icon: "⚡", tier: "silver",   category: "milestone" },
  { key: "half_ton",          name: "Half Ton",            description: "Closed 50 tasks",                      icon: "💪", tier: "silver",   category: "milestone" },
  { key: "centurion",         name: "Centurion",           description: "Closed 100 tasks",                     icon: "🏆", tier: "gold",     category: "milestone" },
  { key: "task_machine",      name: "Task Machine",        description: "Closed 250 tasks",                     icon: "⚙️", tier: "platinum", category: "milestone" },
  { key: "legend",            name: "Legend",              description: "Closed 500 tasks",                     icon: "👑", tier: "diamond",  category: "milestone" },

  // ── Streak: consecutive active days ──
  { key: "three_day_streak",  name: "Hat Trick",           description: "3-day active streak",                  icon: "🎩", tier: "bronze",   category: "streak" },
  { key: "week_warrior",      name: "Week Warrior",        description: "7-day active streak",                  icon: "🗡️", tier: "silver",   category: "streak" },
  { key: "fortnight_force",   name: "Fortnight Force",     description: "14-day active streak",                 icon: "🛡️", tier: "gold",     category: "streak" },
  { key: "monthly_machine",   name: "Monthly Machine",     description: "30-day active streak",                 icon: "🤖", tier: "platinum", category: "streak" },
  { key: "sixty_day_titan",   name: "Sixty Day Titan",     description: "60-day active streak",                 icon: "🏔️", tier: "diamond",  category: "streak" },

  // ── Speed: fast closures ──
  { key: "speed_demon",       name: "Speed Demon",         description: "Closed a task within 1 hour",          icon: "⚡", tier: "bronze",   category: "speed" },
  { key: "same_day_ship",     name: "Same Day Ship",       description: "Closed a task the same day it was created", icon: "🚀", tier: "silver", category: "speed" },
  { key: "five_in_a_day",     name: "Five in a Day",       description: "Closed 5 tasks in a single day",       icon: "🌪️", tier: "gold",     category: "speed" },

  // ── Quality: on-time delivery ──
  { key: "on_time_five",      name: "On Time · 5",         description: "Closed 5 tasks before their due date", icon: "⏰", tier: "bronze",   category: "quality" },
  { key: "on_time_twenty",    name: "On Time · 20",        description: "Closed 20 tasks before their due date",icon: "🎯", tier: "silver",   category: "quality" },
  { key: "zero_overdue_week", name: "Clean Week",          description: "Ended a week with zero overdue tasks", icon: "✨", tier: "gold",     category: "quality" },

  // ── Collaboration: comments and teamwork ──
  { key: "first_comment",     name: "Chimed In",           description: "Posted your first comment",            icon: "💬", tier: "bronze",   category: "collab" },
  { key: "commentator",       name: "Commentator",         description: "Posted 50 comments",                   icon: "📢", tier: "silver",   category: "collab" },
  { key: "voice_of_reason",   name: "Voice of Reason",     description: "Posted 200 comments",                  icon: "🎙️", tier: "gold",     category: "collab" },
  { key: "cross_project",     name: "Cross-Pollinator",    description: "Closed tasks in 5 different projects", icon: "🌐", tier: "silver",   category: "collab" },

  // ── Special: rare / fun ──
  { key: "night_owl",         name: "Night Owl",           description: "Closed a task between midnight and 5 AM", icon: "🦉", tier: "bronze", category: "special" },
  { key: "weekend_warrior",   name: "Weekend Warrior",     description: "Closed a task on a Saturday or Sunday",   icon: "🏖️", tier: "bronze", category: "special" },
  { key: "project_clearer",   name: "Project Clearer",     description: "Cleared all tasks in a project to zero open", icon: "🧹", tier: "gold", category: "special" },
];

export const BADGE_MAP = new Map(BADGES.map((b) => [b.key, b]));

export const TIER_ORDER: Record<string, number> = {
  diamond: 5, platinum: 4, gold: 3, silver: 2, bronze: 1,
};

// ---------------------------------------------------------------------------
// Award engine
// ---------------------------------------------------------------------------

/**
 * Check and award badges for a user after an action.
 * Call this after task completion, comment posting, etc.
 * Idempotent — won't re-award existing badges.
 */
export async function checkAndAwardBadges(
  userId: string,
  trigger: "task_completed" | "comment_posted" | "task_created",
  context?: { taskId?: string; projectId?: string },
): Promise<string[]> {
  const db = getDb();
  const awarded: string[] = [];

  // Get existing badges for this user
  const existing = await db
    .select({ badgeKey: userBadges.badgeKey })
    .from(userBadges)
    .where(eq(userBadges.userId, userId));
  const has = new Set(existing.map((b) => b.badgeKey));

  async function award(key: string, meta?: Record<string, unknown>) {
    if (has.has(key)) return;
    try {
      await db.insert(userBadges).values({
        userId,
        badgeKey: key,
        meta: meta as Record<string, unknown> | undefined,
      }).onConflictDoNothing();
      awarded.push(key);
      has.add(key);
      log.info("badge.awarded", { userId, badge: key });
    } catch (e) {
      log.warn("badge.award_failed", { userId, badge: key, error: (e as Error).message });
    }
  }

  if (trigger === "task_completed") {
    // ── Milestone badges ──
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.assigneeId, userId), eq(tasks.status, "done")));
    const doneCount = countRow?.count ?? 0;

    if (doneCount >= 1)   await award("first_blood");
    if (doneCount >= 10)  await award("getting_warmed_up");
    if (doneCount >= 25)  await award("quarter_century");
    if (doneCount >= 50)  await award("half_ton");
    if (doneCount >= 100) await award("centurion");
    if (doneCount >= 250) await award("task_machine");
    if (doneCount >= 500) await award("legend");

    // ── Speed badges ──
    if (context?.taskId) {
      const [task] = await db
        .select({
          createdAt: tasks.createdAt,
          completedAt: tasks.completedAt,
          dueDate: tasks.dueDate,
          projectId: tasks.projectId,
        })
        .from(tasks)
        .where(eq(tasks.id, context.taskId))
        .limit(1);

      if (task?.createdAt && task?.completedAt) {
        const diffMs = task.completedAt.getTime() - task.createdAt.getTime();
        if (diffMs <= 3600_000) await award("speed_demon", { taskId: context.taskId });

        const createdDay = task.createdAt.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        const completedDay = task.completedAt.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        if (createdDay === completedDay) await award("same_day_ship", { taskId: context.taskId });

        // Night owl (midnight–5 AM IST)
        const hour = parseInt(
          new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }).format(task.completedAt),
        );
        if (hour >= 0 && hour < 5) await award("night_owl");

        // Weekend warrior
        const dayOfWeek = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(task.completedAt);
        if (dayOfWeek === "Sat" || dayOfWeek === "Sun") await award("weekend_warrior");
      }

      // On-time badges
      if (task?.dueDate && task?.completedAt) {
        const dueDate = new Date(`${task.dueDate}T23:59:59+05:30`);
        if (task.completedAt <= dueDate) {
          const [onTimeRow] = await db
            .select({ onTimeCount: sql<number>`count(*)::int` })
            .from(tasks)
            .where(and(
              eq(tasks.assigneeId, userId),
              eq(tasks.status, "done"),
              sql`${tasks.dueDate} IS NOT NULL`,
              sql`${tasks.completedAt} <= (${tasks.dueDate}::date + interval '1 day' - interval '1 second' + interval '5 hours 30 minutes')`,
            ));
          const onTimeCount = onTimeRow?.onTimeCount ?? 0;
          if (onTimeCount >= 5)  await award("on_time_five");
          if (onTimeCount >= 20) await award("on_time_twenty");
        }
      }

      // Project clearer — all tasks in this project now done
      if (task?.projectId) {
        const [openRow] = await db
          .select({ openInProject: sql<number>`count(*)::int` })
          .from(tasks)
          .where(and(
            eq(tasks.projectId, task.projectId),
            sql`${tasks.status} NOT IN ('done', 'cancelled')`,
          ));
        if ((openRow?.openInProject ?? 1) === 0) await award("project_clearer", { projectId: task.projectId });
      }
    }

    // Five in a day
    const todayIST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const [todayRow] = await db
      .select({ todayDone: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(
        eq(tasks.assigneeId, userId),
        eq(tasks.status, "done"),
        sql`${tasks.completedAt} >= ${todayIST}::date AT TIME ZONE 'Asia/Kolkata'`,
        sql`${tasks.completedAt} < (${todayIST}::date + interval '1 day') AT TIME ZONE 'Asia/Kolkata'`,
      ));
    if ((todayRow?.todayDone ?? 0) >= 5) await award("five_in_a_day");

    // Cross-pollinator — tasks done in 5+ projects
    const [projRow] = await db
      .select({ projectCount: sql<number>`count(DISTINCT ${tasks.projectId})::int` })
      .from(tasks)
      .where(and(eq(tasks.assigneeId, userId), eq(tasks.status, "done")));
    if ((projRow?.projectCount ?? 0) >= 5) await award("cross_project");

    // Clean week — zero overdue right now
    const [overdueRow] = await db
      .select({ overdueNow: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(
        eq(tasks.assigneeId, userId),
        sql`${tasks.status} NOT IN ('done', 'cancelled')`,
        sql`${tasks.dueDate} IS NOT NULL`,
        sql`${tasks.dueDate}::date < ${todayIST}::date`,
      ));
    if ((overdueRow?.overdueNow ?? 1) === 0 && doneCount >= 5) await award("zero_overdue_week");
  }

  if (trigger === "comment_posted") {
    const [cmtRow] = await db
      .select({ commentCount: sql<number>`count(*)::int` })
      .from(taskComments)
      .where(eq(taskComments.authorId, userId));
    const commentCount = cmtRow?.commentCount ?? 0;

    if (commentCount >= 1)   await award("first_comment");
    if (commentCount >= 50)  await award("commentator");
    if (commentCount >= 200) await award("voice_of_reason");
  }

  // ── Streak badges (check on any trigger) ──
  // Streak = consecutive calendar days (IST) with at least one task completed or comment posted
  if (!has.has("sixty_day_titan")) {
    const streak = await computeStreak(userId);
    if (streak >= 3)  await award("three_day_streak");
    if (streak >= 7)  await award("week_warrior");
    if (streak >= 14) await award("fortnight_force");
    if (streak >= 30) await award("monthly_machine");
    if (streak >= 60) await award("sixty_day_titan");
  }

  return awarded;
}

// ---------------------------------------------------------------------------
// Streak calculation
// ---------------------------------------------------------------------------

async function computeStreak(userId: string): Promise<number> {
  const db = getDb();

  // Get distinct active days (IST) in last 90 days — union of completions + comments
  const rows = await db.execute(sql`
    SELECT DISTINCT d::date AS day FROM (
      SELECT (completed_at AT TIME ZONE 'Asia/Kolkata')::date AS d
      FROM tasks
      WHERE assignee_id = ${userId} AND status = 'done' AND completed_at IS NOT NULL
        AND completed_at >= now() - interval '90 days'
      UNION
      SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS d
      FROM task_comments
      WHERE author_id = ${userId}
        AND created_at >= now() - interval '90 days'
    ) sub
    ORDER BY day DESC
  `) as unknown as Array<{ day: string }>;

  if (rows.length === 0) return 0;

  // Count consecutive days from today backwards
  const todayIST = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

  const daySet = new Set(rows.map((r) => {
    const d = typeof r.day === "string" ? r.day : new Date(r.day).toISOString().slice(0, 10);
    return d;
  }));

  // Start from today (or yesterday if today hasn't had activity yet)
  let current = new Date(`${todayIST}T12:00:00+05:30`);
  if (!daySet.has(todayIST)) {
    // Allow today to not count yet — start from yesterday
    current.setDate(current.getDate() - 1);
    const yest = current.toISOString().slice(0, 10);
    if (!daySet.has(yest)) return 0;
  }

  let streak = 0;
  for (let i = 0; i < 90; i++) {
    const dayStr = current.toISOString().slice(0, 10);
    if (daySet.has(dayStr)) {
      streak++;
      current.setDate(current.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/** Get all badges for a user, sorted by tier (highest first) then award date. */
export async function getUserBadges(userId: string): Promise<Array<BadgeDef & { awardedAt: Date }>> {
  const db = getDb();
  const rows = await db
    .select({ badgeKey: userBadges.badgeKey, awardedAt: userBadges.awardedAt })
    .from(userBadges)
    .where(eq(userBadges.userId, userId))
    .orderBy(userBadges.awardedAt);

  return rows
    .map((r) => {
      const def = BADGE_MAP.get(r.badgeKey);
      if (!def) return null;
      return { ...def, awardedAt: r.awardedAt };
    })
    .filter(Boolean) as Array<BadgeDef & { awardedAt: Date }>;
}

/** Get badge counts per user for the members list. */
export async function getBadgeCounts(): Promise<Map<string, number>> {
  const db = getDb();
  const rows = await db
    .select({ userId: userBadges.userId, count: sql<number>`count(*)::int` })
    .from(userBadges)
    .groupBy(userBadges.userId);

  return new Map(rows.map((r) => [r.userId, r.count]));
}
