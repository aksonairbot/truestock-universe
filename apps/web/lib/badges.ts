// apps/web/lib/badges.ts
//
// Achievement badge system — 30 badges with XP, progress tracking, and card-grid UI.
// Badge definitions, award engine, and progress computation all live here.

import { getDb, userBadges, tasks, taskComments, eq, and, sql } from "@tu/db";
import { log } from "@/lib/log";

// ---------------------------------------------------------------------------
// Badge catalogue — 30 badges matching the card-grid reference design
// ---------------------------------------------------------------------------

export interface BadgeDef {
  key: string;
  num: number;
  name: string;
  description: string;
  icon: string;
  xp: number;
  color: string;
  target: number;
  statKey: string;
}

export const BADGES: BadgeDef[] = [
  // Row 1
  { key: "first_step",        num: 1,  name: "First Step",          description: "Create your first task and get things rolling.",          icon: "🚀", xp: 10,  color: "#a78bfa", target: 1,    statKey: "doneCount" },
  { key: "on_track",          num: 2,  name: "On Track",            description: "Complete 5 tasks and build momentum.",                    icon: "📋", xp: 50,  color: "#60a5fa", target: 5,    statKey: "doneCount" },
  { key: "focus_master",      num: 3,  name: "Focus Master",        description: "Complete 10 tasks with high priority.",                   icon: "🎯", xp: 100, color: "#34d399", target: 10,   statKey: "highPriorityDone" },
  { key: "streak_starter",    num: 4,  name: "Streak Starter",      description: "Maintain a streak of 3 active days.",                    icon: "🔥", xp: 75,  color: "#fb923c", target: 3,    statKey: "streak" },
  { key: "week_warrior",      num: 5,  name: "Week Warrior",        description: "Close 20 tasks in a single week.",                       icon: "📅", xp: 150, color: "#60a5fa", target: 20,   statKey: "weeklyDone" },
  // Row 2
  { key: "consistent_closer", num: 6,  name: "Consistent Closer",   description: "Close 50 tasks in total.",                               icon: "🏆", xp: 250, color: "#34d399", target: 50,   statKey: "doneCount" },
  { key: "collaborator",      num: 7,  name: "Collaborator",        description: "Comment on 10 tasks across projects.",                   icon: "💬", xp: 75,  color: "#c084fc", target: 10,   statKey: "tasksCommentedOn" },
  { key: "project_pro",       num: 8,  name: "Project Pro",         description: "Add tasks to 3 different projects.",                     icon: "📁", xp: 100, color: "#67e8f9", target: 3,    statKey: "projectCount" },
  { key: "speed_demon",       num: 9,  name: "Speed Demon",         description: "Complete a task within 24 hours of creating it.",         icon: "⏱️", xp: 75,  color: "#fb923c", target: 3,    statKey: "speedTaskCount" },
  { key: "task_legend",       num: 10, name: "Task Legend",         description: "Close 100 tasks. Legendary work!",                       icon: "💎", xp: 500, color: "#f472b6", target: 100,  statKey: "doneCount" },
  // Row 3
  { key: "early_bird",        num: 11, name: "Early Bird",          description: "Complete a task before 9 AM.",                           icon: "🌅", xp: 75,  color: "#a78bfa", target: 5,    statKey: "earlyBirdCount" },
  { key: "no_miss",           num: 12, name: "No Miss",             description: "Complete a task every day for 7 days.",                  icon: "🎯", xp: 200, color: "#60a5fa", target: 7,    statKey: "streak" },
  { key: "detail_oriented",   num: 13, name: "Detail Oriented",     description: "Add descriptions to 20 tasks.",                         icon: "✅", xp: 150, color: "#34d399", target: 20,   statKey: "tasksWithDesc" },
  { key: "reliable",          num: 14, name: "Reliable",            description: "Never miss a due date for 2 weeks.",                     icon: "🛡️", xp: 250, color: "#fbbf24", target: 14,   statKey: "onTimeCount" },
  { key: "level_up",          num: 15, name: "Level Up",            description: "Earn 1000 XP in total.",                                 icon: "📈", xp: 300, color: "#60a5fa", target: 1000, statKey: "totalXp" },
  // Row 4
  { key: "team_player",       num: 16, name: "Team Player",         description: "Assign 15 tasks to others.",                             icon: "👥", xp: 150, color: "#34d399", target: 15,   statKey: "assignedToOthers" },
  { key: "great_communicator", num: 17, name: "Great Communicator", description: "Leave 25 meaningful comments.",                          icon: "💜", xp: 125, color: "#c084fc", target: 25,   statKey: "commentCount" },
  { key: "planner",           num: 18, name: "Planner",             description: "Schedule 10 tasks with due dates.",                      icon: "🗓️", xp: 125, color: "#67e8f9", target: 10,   statKey: "tasksWithDue" },
  { key: "checklist_champ",   num: 19, name: "Checklist Champ",     description: "Use subtasks in 20 tasks.",                              icon: "✅", xp: 175, color: "#fb923c", target: 20,   statKey: "tasksWithSubtasks" },
  { key: "comeback_king",     num: 20, name: "Comeback King",       description: "Return and complete a task after 7 days.",               icon: "⏪", xp: 200, color: "#f472b6", target: 1,    statKey: "comebackCount" },
  // Row 5
  { key: "priority_master",   num: 21, name: "Priority Master",     description: "Complete 30 high priority tasks.",                       icon: "🏆", xp: 200, color: "#a78bfa", target: 30,   statKey: "highPriorityDone" },
  { key: "focus_mode",        num: 22, name: "Focus Mode",          description: "Stay distraction-free and complete 5 tasks in a row.",   icon: "🎯", xp: 150, color: "#60a5fa", target: 5,    statKey: "dailyMax" },
  { key: "quick_finisher",    num: 23, name: "Quick Finisher",      description: "Complete a task in under 30 minutes.",                   icon: "⏱️", xp: 150, color: "#34d399", target: 10,   statKey: "quickFinishCount" },
  { key: "inbox_zero",        num: 24, name: "Inbox Zero",          description: "Clear all items from your inbox.",                       icon: "📥", xp: 125, color: "#fb923c", target: 10,   statKey: "onTimeCount" },
  { key: "review_pro",        num: 25, name: "Review Pro",          description: "Review and update 15 tasks.",                            icon: "🔍", xp: 125, color: "#60a5fa", target: 15,   statKey: "tasksCommentedOn" },
  // Row 6
  { key: "milestone_maker",   num: 26, name: "Milestone Maker",     description: "Complete 5 tasks in a single day.",                      icon: "⛰️", xp: 175, color: "#34d399", target: 5,    statKey: "dailyMax" },
  { key: "week_streaker",     num: 27, name: "Week Streaker",       description: "Complete tasks on 7 consecutive days.",                  icon: "📅", xp: 200, color: "#c084fc", target: 7,    statKey: "streak" },
  { key: "dependency_solver", num: 28, name: "Dependency Solver",   description: "Unblock 10 tasks by resolving dependencies.",            icon: "🔗", xp: 150, color: "#67e8f9", target: 10,   statKey: "subtasksDone" },
  { key: "blocker_buster",    num: 29, name: "Blocker Buster",      description: "Resolve 10 blockers and keep things moving.",            icon: "🐛", xp: 175, color: "#fb923c", target: 10,   statKey: "comebackCount" },
  { key: "all_rounder",       num: 30, name: "All-Rounder",         description: "Complete tasks across 5 different projects.",             icon: "🎉", xp: 200, color: "#f472b6", target: 5,    statKey: "projectCount" },
];

export const BADGE_MAP = new Map(BADGES.map((b) => [b.key, b]));

// ---------------------------------------------------------------------------
// User stats — batched queries for progress computation
// ---------------------------------------------------------------------------

export interface UserStats {
  doneCount: number;
  highPriorityDone: number;
  streak: number;
  weeklyDone: number;
  commentCount: number;
  projectCount: number;
  speedTaskCount: number;
  earlyBirdCount: number;
  tasksWithDesc: number;
  onTimeCount: number;
  assignedToOthers: number;
  tasksWithDue: number;
  tasksWithSubtasks: number;
  comebackCount: number;
  dailyMax: number;
  quickFinishCount: number;
  subtasksDone: number;
  tasksCommentedOn: number;
  totalXp: number;
}

export async function computeUserStats(userId: string): Promise<UserStats> {
  const db = getDb();

  // Single SQL with scalar subqueries — one round-trip for all counts
  const rows = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM tasks WHERE assignee_id = ${userId} AND status = 'done') AS done_count,
      (SELECT count(*)::int FROM tasks WHERE assignee_id = ${userId} AND status = 'done' AND priority IN ('high', 'urgent')) AS high_priority_done,
      (SELECT count(*)::int FROM tasks WHERE assignee_id = ${userId} AND status = 'done' AND completed_at IS NOT NULL AND completed_at >= now() - interval '7 days') AS weekly_done,
      (SELECT count(*)::int FROM task_comments WHERE author_id = ${userId}) AS comment_count,
      (SELECT count(DISTINCT project_id)::int FROM tasks WHERE assignee_id = ${userId} AND status = 'done') AS project_count,
      (SELECT count(*)::int FROM tasks WHERE assignee_id = ${userId} AND status = 'done' AND completed_at IS NOT NULL AND completed_at - created_at <= interval '24 hours') AS speed_task_count,
      (SELECT count(*)::int FROM tasks WHERE assignee_id = ${userId} AND status = 'done' AND completed_at IS NOT NULL AND extract(hour FROM completed_at AT TIME ZONE 'Asia/Kolkata') < 9) AS early_bird_count,
      (SELECT count(*)::int FROM tasks WHERE created_by_id = ${userId} AND description IS NOT NULL AND description != '') AS tasks_with_desc,
      (SELECT count(*)::int FROM tasks WHERE assignee_id = ${userId} AND status = 'done' AND due_date IS NOT NULL AND completed_at IS NOT NULL AND completed_at <= (due_date::date + interval '1 day')) AS on_time_count,
      (SELECT count(*)::int FROM tasks WHERE created_by_id = ${userId} AND assignee_id IS NOT NULL AND assignee_id != ${userId}) AS assigned_to_others,
      (SELECT count(*)::int FROM tasks WHERE created_by_id = ${userId} AND due_date IS NOT NULL) AS tasks_with_due,
      (SELECT count(DISTINCT t2.parent_task_id)::int FROM tasks t2 WHERE t2.parent_task_id IS NOT NULL AND t2.parent_task_id IN (SELECT id FROM tasks WHERE created_by_id = ${userId})) AS tasks_with_subtasks,
      (SELECT count(*)::int FROM tasks WHERE assignee_id = ${userId} AND status = 'done' AND completed_at IS NOT NULL AND completed_at - created_at >= interval '7 days') AS comeback_count,
      (SELECT COALESCE(max(cnt), 0)::int FROM (SELECT count(*) AS cnt FROM tasks WHERE assignee_id = ${userId} AND status = 'done' AND completed_at IS NOT NULL GROUP BY (completed_at AT TIME ZONE 'Asia/Kolkata')::date) sub) AS daily_max,
      (SELECT count(*)::int FROM tasks WHERE assignee_id = ${userId} AND status = 'done' AND completed_at IS NOT NULL AND completed_at - created_at <= interval '1 hour') AS quick_finish_count,
      (SELECT count(*)::int FROM tasks WHERE assignee_id = ${userId} AND status = 'done' AND parent_task_id IS NOT NULL) AS subtasks_done,
      (SELECT count(DISTINCT task_id)::int FROM task_comments WHERE author_id = ${userId}) AS tasks_commented_on
  `);

  const r = (rows as unknown as Array<Record<string, number>>)[0] ?? {};

  return {
    doneCount: r.done_count ?? 0,
    highPriorityDone: r.high_priority_done ?? 0,
    streak: 0, // computed separately via computeStreak
    weeklyDone: r.weekly_done ?? 0,
    commentCount: r.comment_count ?? 0,
    projectCount: r.project_count ?? 0,
    speedTaskCount: r.speed_task_count ?? 0,
    earlyBirdCount: r.early_bird_count ?? 0,
    tasksWithDesc: r.tasks_with_desc ?? 0,
    onTimeCount: r.on_time_count ?? 0,
    assignedToOthers: r.assigned_to_others ?? 0,
    tasksWithDue: r.tasks_with_due ?? 0,
    tasksWithSubtasks: r.tasks_with_subtasks ?? 0,
    comebackCount: r.comeback_count ?? 0,
    dailyMax: r.daily_max ?? 0,
    quickFinishCount: r.quick_finish_count ?? 0,
    subtasksDone: r.subtasks_done ?? 0,
    tasksCommentedOn: r.tasks_commented_on ?? 0,
    totalXp: 0, // computed from earned badges
  };
}

// ---------------------------------------------------------------------------
// Streak calculation
// ---------------------------------------------------------------------------

async function computeStreak(userId: string): Promise<number> {
  const db = getDb();

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

  const todayIST = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

  const daySet = new Set(rows.map((r) => {
    const d = typeof r.day === "string" ? r.day : new Date(r.day).toISOString().slice(0, 10);
    return d;
  }));

  let current = new Date(`${todayIST}T12:00:00+05:30`);
  if (!daySet.has(todayIST)) {
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
// Award engine — checks all badges on every trigger
// ---------------------------------------------------------------------------

export async function checkAndAwardBadges(
  userId: string,
  _trigger?: string,
  _context?: { taskId?: string; projectId?: string },
): Promise<string[]> {
  const db = getDb();
  const stats = await computeUserStats(userId);
  stats.streak = await computeStreak(userId);

  // Get existing badges
  const existing = await db
    .select({ badgeKey: userBadges.badgeKey })
    .from(userBadges)
    .where(eq(userBadges.userId, userId));
  const has = new Set(existing.map((b) => b.badgeKey));

  // Compute totalXp from earned
  stats.totalXp = BADGES.filter((b) => has.has(b.key)).reduce((sum, b) => sum + b.xp, 0);

  const awarded: string[] = [];

  for (const badge of BADGES) {
    if (has.has(badge.key)) continue;
    const current = (stats as unknown as Record<string, number>)[badge.statKey] ?? 0;
    if (current >= badge.target) {
      try {
        await db.insert(userBadges).values({ userId, badgeKey: badge.key }).onConflictDoNothing();
        awarded.push(badge.key);
        has.add(badge.key);
        // Recompute totalXp after each award (for level_up)
        stats.totalXp = BADGES.filter((b) => has.has(b.key)).reduce((sum, b) => sum + b.xp, 0);
        log.info("badge.awarded", { userId, badge: badge.key, xp: badge.xp });
      } catch (e) {
        log.warn("badge.award_failed", { userId, badge: badge.key, error: (e as Error).message });
      }
    }
  }

  return awarded;
}

// ---------------------------------------------------------------------------
// Progress computation for the badges page UI
// ---------------------------------------------------------------------------

export interface BadgeProgress {
  badge: BadgeDef;
  current: number;
  earned: boolean;
  earnedAt?: Date;
}

export async function getBadgeProgress(userId: string): Promise<BadgeProgress[]> {
  const db = getDb();
  const stats = await computeUserStats(userId);
  stats.streak = await computeStreak(userId);

  // Get earned badges
  const earnedRows = await db
    .select({ badgeKey: userBadges.badgeKey, awardedAt: userBadges.awardedAt })
    .from(userBadges)
    .where(eq(userBadges.userId, userId));
  const earnedMap = new Map(earnedRows.map((r) => [r.badgeKey, r.awardedAt]));

  // Compute totalXp from earned
  stats.totalXp = BADGES.filter((b) => earnedMap.has(b.key)).reduce((sum, b) => sum + b.xp, 0);

  return BADGES.map((badge) => ({
    badge,
    current: Math.min((stats as unknown as Record<string, number>)[badge.statKey] ?? 0, badge.target),
    earned: earnedMap.has(badge.key),
    earnedAt: earnedMap.get(badge.key) ?? undefined,
  }));
}

// ---------------------------------------------------------------------------
// Query helpers (for member list / profile)
// ---------------------------------------------------------------------------

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

export async function getBadgeCounts(): Promise<Map<string, number>> {
  const db = getDb();
  const rows = await db
    .select({ userId: userBadges.userId, count: sql<number>`count(*)::int` })
    .from(userBadges)
    .groupBy(userBadges.userId);
  return new Map(rows.map((r) => [r.userId, r.count]));
}
