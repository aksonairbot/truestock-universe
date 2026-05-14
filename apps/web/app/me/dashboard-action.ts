// apps/web/app/me/dashboard-action.ts
//
// Server actions for the weekly + monthly personal bento dashboards.
// Computes a rich stat snapshot, asks the LLM to write a 3–4-sentence
// narrative that calls out a non-obvious pattern + one focus area, caches
// everything in ai_dashboards.body_json so re-renders skip the query layer.

"use server";

import { revalidatePath } from "next/cache";
import {
  getDb,
  aiDashboards,
  tasks,
  taskComments,
  projects,
  users,
  eq,
  and,
  desc,
  sql,
} from "@tu/db";
import { getCurrentUserId, getCurrentUser } from "@/lib/auth";
import { llm } from "@/lib/llm";
import { log } from "@/lib/log";

export type Period = "week" | "month";

const TZ = "Asia/Kolkata";

function istDayString(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
function shiftIST(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00+05:30`);
  d.setDate(d.getDate() + n);
  return istDayString(d);
}
function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
function monthKey(d: Date): string {
  return istDayString(d).slice(0, 7); // YYYY-MM
}

export interface BentoStats {
  period: Period;
  periodKey: string;
  rangeLabel: string;
  startIST: string;
  endIST: string;

  // headline
  closed: number;
  closedPrev: number;
  comments: number;
  commentsReceived: number;
  newCreated: number;
  daysActive: number;

  // daily breakdown — N cells (7 or 30)
  daily: Array<{ day: string; closed: number; commented: number }>;

  // multi-week trend
  weeklyTrend: Array<{ weekStart: string; weekKey: string; closed: number }>;

  // day-of-week pattern (always 7 entries Mon..Sun, average closures per day)
  dayOfWeek: Array<{ dow: number; label: string; total: number }>;

  // priority mix of closures in window
  priorityMix: Array<{ priority: "urgent" | "high" | "med" | "low"; n: number }>;

  // projects — all projects with activity in window
  topProjects: Array<{ slug: string; name: string; closed: number }>;

  // full project breakdown (all projects, closed + open + created)
  projectBreakdown: Array<{ slug: string; name: string; closed: number; open: number; created: number }>;

  // department breakdown
  deptBreakdown: Array<{ name: string; color: string | null; closed: number; open: number; created: number; members: number }>;

  // team breakdown (all members, closures in window)
  teamBreakdown: Array<{ name: string; closed: number; comments: number; created: number }>;

  // recognition
  oldestOpen?: { id: string; title: string; project: string; ageDays: number };
  fastest?: { id: string; title: string; project: string; days: number };
  slowest?: { id: string; title: string; project: string; days: number };

  longerThanMedian: Array<{ id: string; title: string; project: string; days: number; medianDays: number }>;

  streak: number;
  streakBest: number;
}

function dayBoundsIST(day: string): { start: Date; end: Date } {
  return { start: new Date(`${day}T00:00:00+05:30`), end: new Date(`${day}T23:59:59.999+05:30`) };
}

async function computeStreak(userId: string): Promise<{ current: number; best: number }> {
  const db = getDb();
  const rows = await db.execute(sql<{ d: string }>`
    select distinct (completed_at at time zone 'Asia/Kolkata')::date::text as d
    from tasks
    where assignee_id = ${userId} and status = 'done' and completed_at is not null
      and completed_at >= now() - interval '2 years'
    order by d desc
  `);
  const days = (rows as unknown as Array<{ d: string }>).map((r) => r.d.toString().slice(0, 10));
  if (days.length === 0) return { current: 0, best: 0 };
  const today = istDayString(new Date());
  const yesterday = shiftIST(today, -1);
  let current = 0;
  let cursor: string | null = days[0] === today ? today : days[0] === yesterday ? yesterday : null;
  if (cursor) {
    for (const d of days) {
      if (d === cursor) { current++; cursor = shiftIST(cursor, -1); }
      else if (cursor && d < cursor) break;
    }
  }
  let best = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(`${days[i - 1]}T12:00:00+05:30`);
    const cur  = new Date(`${days[i]}T12:00:00+05:30`);
    const gap = Math.round((prev.getTime() - cur.getTime()) / 86400000);
    if (gap === 1) { run += 1; best = Math.max(best, run); } else { run = 1; }
  }
  return { current, best: Math.max(best, current) };
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function computeStats(userId: string, period: Period): Promise<BentoStats> {
  const db = getDb();
  const now = new Date();
  const todayIST = istDayString(now);

  const windowDays = period === "week" ? 7 : 30;
  const startDay = shiftIST(todayIST, -(windowDays - 1));
  const endDay = todayIST;
  const prevStartDay = shiftIST(todayIST, -(2 * windowDays - 1));
  const prevEndDay = shiftIST(todayIST, -windowDays);
  const periodKey = period === "week" ? isoWeekKey(now) : monthKey(now);
  const startFmt = new Date(`${startDay}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: TZ });
  const endFmt = new Date(`${endDay}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: TZ });
  const rangeLabel = `${startFmt} → ${endFmt}`;

  const { start: startStart } = dayBoundsIST(startDay);
  const { end: endEnd } = dayBoundsIST(endDay);
  const { start: prevStartStart } = dayBoundsIST(prevStartDay);
  const { end: prevEndEnd } = dayBoundsIST(prevEndDay);

  // ----- headline counts -----
  const [closedRow] = await db.select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.assigneeId, userId), eq(tasks.status, "done"),
      sql`${tasks.completedAt} >= ${startStart.toISOString()} and ${tasks.completedAt} <= ${endEnd.toISOString()}`));
  const closed = closedRow?.n ?? 0;

  const [closedPrevRow] = await db.select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.assigneeId, userId), eq(tasks.status, "done"),
      sql`${tasks.completedAt} >= ${prevStartStart.toISOString()} and ${tasks.completedAt} <= ${prevEndEnd.toISOString()}`));
  const closedPrev = closedPrevRow?.n ?? 0;

  const [commentsSent] = await db.select({ n: sql<number>`count(*)::int` })
    .from(taskComments)
    .where(and(eq(taskComments.authorId, userId),
      sql`${taskComments.createdAt} >= ${startStart.toISOString()} and ${taskComments.createdAt} <= ${endEnd.toISOString()}`));
  const comments = commentsSent?.n ?? 0;

  // Comments BY OTHERS on tasks assigned to user
  const [commentsRcvRow] = await db.execute(sql<{ n: number }>`
    select count(*)::int as n
    from task_comments c
    join tasks t on t.id = c.task_id
    where t.assignee_id = ${userId}
      and c.author_id <> ${userId}
      and c.created_at >= ${startStart.toISOString()}
      and c.created_at <= ${endEnd.toISOString()}
  `) as unknown as Array<{ n: number }>;
  const commentsReceived = Number(commentsRcvRow?.n) || 0;

  const [createdRow] = await db.select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.createdById, userId),
      sql`${tasks.createdAt} >= ${startStart.toISOString()} and ${tasks.createdAt} <= ${endEnd.toISOString()}`));
  const newCreated = createdRow?.n ?? 0;

  // ----- daily breakdown -----
  const dailyRows = await db.execute(sql<{ d: string; closed: number; commented: number }>`
    with d as (
      select generate_series(${startStart.toISOString()}::timestamptz, ${endEnd.toISOString()}::timestamptz, '1 day') as ts
    )
    select to_char((d.ts at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as d,
      coalesce((select count(*) from tasks t
        where t.assignee_id = ${userId} and t.status = 'done'
          and (t.completed_at at time zone 'Asia/Kolkata')::date = (d.ts at time zone 'Asia/Kolkata')::date), 0)::int as closed,
      coalesce((select count(*) from task_comments c
        where c.author_id = ${userId}
          and (c.created_at at time zone 'Asia/Kolkata')::date = (d.ts at time zone 'Asia/Kolkata')::date), 0)::int as commented
    from d order by d
  `);
  const daily = (dailyRows as unknown as Array<{ d: string; closed: number; commented: number }>).map((r) => ({
    day: r.d.toString().slice(0, 10),
    closed: Number(r.closed) || 0,
    commented: Number(r.commented) || 0,
  }));
  const daysActive = daily.filter((d) => d.closed > 0 || d.commented > 0).length;

  // ----- multi-week trend (week=4 buckets of 7d; month=8 buckets of 7d) -----
  const trendWeeks = period === "week" ? 4 : 8;
  const weeklyTrend: BentoStats["weeklyTrend"] = [];
  for (let i = trendWeeks - 1; i >= 0; i--) {
    const weekEnd = shiftIST(todayIST, -i * 7);
    const weekStart = shiftIST(weekEnd, -6);
    const wsStart = dayBoundsIST(weekStart).start;
    const wsEnd = dayBoundsIST(weekEnd).end;
    const [r] = await db.select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.assigneeId, userId), eq(tasks.status, "done"),
        sql`${tasks.completedAt} >= ${wsStart.toISOString()} and ${tasks.completedAt} <= ${wsEnd.toISOString()}`));
    const wd = new Date(`${weekStart}T12:00:00+05:30`);
    const wkKey = isoWeekKey(wd);
    weeklyTrend.push({ weekStart, weekKey: wkKey, closed: r?.n ?? 0 });
  }

  // ----- day-of-week pattern across the window -----
  const dowRows = await db.execute(sql<{ dow: number; n: number }>`
    select extract(dow from (completed_at at time zone 'Asia/Kolkata'))::int as dow,
           count(*)::int as n
    from tasks
    where assignee_id = ${userId} and status = 'done'
      and completed_at >= ${startStart.toISOString()}
      and completed_at <= ${endEnd.toISOString()}
    group by dow
  `);
  const dowMap = new Map<number, number>();
  for (const r of (dowRows as unknown as Array<{ dow: number; n: number }>)) {
    dowMap.set(Number(r.dow), Number(r.n) || 0);
  }
  // Order Mon..Sun in display
  const dowDisplayOrder = [1, 2, 3, 4, 5, 6, 0];
  const dayOfWeek = dowDisplayOrder.map((d) => ({
    dow: d, label: DOW_LABELS[d]!, total: dowMap.get(d) ?? 0,
  }));

  // ----- priority mix -----
  const prioRows = await db.execute(sql<{ priority: string; n: number }>`
    select priority::text as priority, count(*)::int as n
    from tasks
    where assignee_id = ${userId} and status = 'done'
      and completed_at >= ${startStart.toISOString()}
      and completed_at <= ${endEnd.toISOString()}
    group by priority
  `);
  const prioMap = new Map<string, number>();
  for (const r of (prioRows as unknown as Array<{ priority: string; n: number }>)) {
    prioMap.set(r.priority, Number(r.n) || 0);
  }
  const priorityMix: BentoStats["priorityMix"] = (["urgent", "high", "med", "low"] as const).map((p) => ({
    priority: p, n: prioMap.get(p) ?? 0,
  }));

  // ----- top 3 projects -----
  const projectRows = await db
    .select({ slug: projects.slug, name: projects.name, n: sql<number>`count(*)::int` })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(eq(tasks.assigneeId, userId), eq(tasks.status, "done"),
      sql`${tasks.completedAt} >= ${startStart.toISOString()} and ${tasks.completedAt} <= ${endEnd.toISOString()}`))
    .groupBy(projects.slug, projects.name)
    .orderBy(desc(sql`count(*)`))
    .limit(3);
  const topProjects = projectRows.map((r) => ({ slug: r.slug, name: r.name, closed: r.n }));

  // ----- full project breakdown (all projects, closed + open + created in window) -----
  const projBreakdownRows = await db.execute(sql<{
    slug: string; name: string; closed: number; open: number; created: number;
  }>`
    select p.slug, p.name,
      coalesce(sum(case when t.status = 'done' and t.completed_at >= ${startStart.toISOString()}
        and t.completed_at <= ${endEnd.toISOString()} then 1 else 0 end), 0)::int as closed,
      coalesce(sum(case when t.status not in ('done', 'cancelled') then 1 else 0 end), 0)::int as open,
      coalesce(sum(case when t.created_at >= ${startStart.toISOString()}
        and t.created_at <= ${endEnd.toISOString()} then 1 else 0 end), 0)::int as created
    from projects p
    left join tasks t on t.project_id = p.id
    group by p.slug, p.name
    having coalesce(sum(case when t.status = 'done' and t.completed_at >= ${startStart.toISOString()}
        and t.completed_at <= ${endEnd.toISOString()} then 1 else 0 end), 0) > 0
      or coalesce(sum(case when t.status not in ('done', 'cancelled') then 1 else 0 end), 0) > 0
      or coalesce(sum(case when t.created_at >= ${startStart.toISOString()}
        and t.created_at <= ${endEnd.toISOString()} then 1 else 0 end), 0) > 0
    order by closed desc, open desc
  `);
  const projectBreakdown = (projBreakdownRows as unknown as Array<{
    slug: string; name: string; closed: number; open: number; created: number;
  }>).map((r) => ({
    slug: r.slug, name: r.name,
    closed: Number(r.closed) || 0, open: Number(r.open) || 0, created: Number(r.created) || 0,
  }));

  // ----- team breakdown (all members, closures + comments + created in window) -----
  const teamRows = await db.execute(sql<{
    name: string; closed: number; comments: number; created: number;
  }>`
    select u.name,
      coalesce((select count(*) from tasks t
        where t.assignee_id = u.id and t.status = 'done'
          and t.completed_at >= ${startStart.toISOString()}
          and t.completed_at <= ${endEnd.toISOString()}), 0)::int as closed,
      coalesce((select count(*) from task_comments c
        where c.author_id = u.id
          and c.created_at >= ${startStart.toISOString()}
          and c.created_at <= ${endEnd.toISOString()}), 0)::int as comments,
      coalesce((select count(*) from tasks t2
        where t2.created_by_id = u.id
          and t2.created_at >= ${startStart.toISOString()}
          and t2.created_at <= ${endEnd.toISOString()}), 0)::int as created
    from users u
    where u.is_active = true
    order by closed desc, comments desc
  `);
  const teamBreakdown = (teamRows as unknown as Array<{
    name: string; closed: number; comments: number; created: number;
  }>).map((r) => ({
    name: r.name, closed: Number(r.closed) || 0,
    comments: Number(r.comments) || 0, created: Number(r.created) || 0,
  }));

  // ----- department breakdown -----
  const deptRows = await db.execute(sql<{
    name: string; color: string | null; closed: number; open: number; created: number; members: number;
  }>`
    select d.name, d.color,
      coalesce(sum(case when t.status = 'done' and t.completed_at >= ${startStart.toISOString()}
        and t.completed_at <= ${endEnd.toISOString()} then 1 else 0 end), 0)::int as closed,
      coalesce(sum(case when t.status not in ('done', 'cancelled') then 1 else 0 end), 0)::int as open,
      coalesce(sum(case when t.created_at >= ${startStart.toISOString()}
        and t.created_at <= ${endEnd.toISOString()} then 1 else 0 end), 0)::int as created,
      (select count(*)::int from users u2 where u2.department_id = d.id and u2.is_active = true) as members
    from departments d
    left join users u on u.department_id = d.id and u.is_active = true
    left join tasks t on t.assignee_id = u.id
    group by d.id, d.name, d.color
    order by closed desc, open desc
  `);
  const deptBreakdown = (deptRows as unknown as Array<{
    name: string; color: string | null; closed: number; open: number; created: number; members: number;
  }>).map((r) => ({
    name: r.name, color: r.color ?? null,
    closed: Number(r.closed) || 0, open: Number(r.open) || 0,
    created: Number(r.created) || 0, members: Number(r.members) || 0,
  }));

  // ----- oldest open -----
  const oldestRows = await db
    .select({ id: tasks.id, title: tasks.title, createdAt: tasks.createdAt, project: projects.name })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(eq(tasks.assigneeId, userId), sql`${tasks.status} not in ('done', 'cancelled')`))
    .orderBy(tasks.createdAt)
    .limit(1);
  const oldestOpen = oldestRows[0] ? {
    id: oldestRows[0].id, title: oldestRows[0].title, project: oldestRows[0].project,
    ageDays: Math.floor((Date.now() - (oldestRows[0].createdAt instanceof Date ? oldestRows[0].createdAt : new Date(oldestRows[0].createdAt)).getTime()) / 86400000),
  } : undefined;

  // ----- fastest + slowest closures in window -----
  const fastRows = await db.execute(sql<{ id: string; title: string; project: string; days: number }>`
    select t.id, t.title, p.name as project,
           extract(epoch from (t.completed_at - t.created_at)) / 86400.0 as days
    from tasks t join projects p on t.project_id = p.id
    where t.assignee_id = ${userId} and t.status = 'done'
      and t.completed_at >= ${startStart.toISOString()}
      and t.completed_at <= ${endEnd.toISOString()}
      and t.created_at is not null
      and t.completed_at - t.created_at > interval '5 minutes'
    order by days asc limit 1
  `);
  const slowRows = await db.execute(sql<{ id: string; title: string; project: string; days: number }>`
    select t.id, t.title, p.name as project,
           extract(epoch from (t.completed_at - t.created_at)) / 86400.0 as days
    from tasks t join projects p on t.project_id = p.id
    where t.assignee_id = ${userId} and t.status = 'done'
      and t.completed_at >= ${startStart.toISOString()}
      and t.completed_at <= ${endEnd.toISOString()}
      and t.created_at is not null
    order by days desc limit 1
  `);
  const fr = (fastRows as unknown as Array<{ id: string; title: string; project: string; days: number }>)[0];
  const sr = (slowRows as unknown as Array<{ id: string; title: string; project: string; days: number }>)[0];
  const fastest = fr ? { id: fr.id, title: fr.title, project: fr.project, days: Math.max(1, Math.round(Number(fr.days))) } : undefined;
  const slowest = sr ? { id: sr.id, title: sr.title, project: sr.project, days: Math.max(1, Math.round(Number(sr.days))) } : undefined;

  // ----- tougher than median (limit 3) -----
  const longerRows = await db.execute(sql<{
    id: string; title: string; project: string; days: number; median_days: number;
  }>`
    with closed_in_window as (
      select t.id, t.title, p.name as project,
             extract(epoch from (t.completed_at - t.created_at)) / 86400.0 as days,
             t.project_id
      from tasks t join projects p on t.project_id = p.id
      where t.assignee_id = ${userId} and t.status = 'done'
        and t.completed_at >= ${startStart.toISOString()}
        and t.completed_at <= ${endEnd.toISOString()}
        and t.created_at is not null
    ),
    medians as (
      select project_id,
             percentile_cont(0.5) within group (
               order by extract(epoch from (completed_at - created_at)) / 86400.0
             ) as median_days
      from tasks
      where status = 'done' and completed_at >= now() - interval '90 days'
        and created_at is not null
      group by project_id
    )
    select cw.id, cw.title, cw.project, cw.days, coalesce(m.median_days, 2) as median_days
    from closed_in_window cw left join medians m on m.project_id = cw.project_id
    where cw.days > coalesce(m.median_days, 2)
    order by (cw.days - coalesce(m.median_days, 2)) desc limit 3
  `);
  const longerThanMedian = (longerRows as unknown as Array<{
    id: string; title: string; project: string; days: number; median_days: number;
  }>).map((r) => ({
    id: r.id, title: r.title, project: r.project,
    days: Math.round(Number(r.days)),
    medianDays: Math.max(1, Math.round(Number(r.median_days))),
  }));

  const { current: streak, best: streakBest } = await computeStreak(userId);

  return {
    period, periodKey, rangeLabel, startIST: startDay, endIST: endDay,
    closed, closedPrev, comments, commentsReceived, newCreated, daysActive,
    daily, weeklyTrend, dayOfWeek, priorityMix, topProjects, projectBreakdown, deptBreakdown, teamBreakdown,
    oldestOpen, fastest, slowest, longerThanMedian,
    streak, streakBest,
  };
}

async function generateNarrative(stats: BentoStats, name: string): Promise<{ body: string; model: string; durationMs: number }> {
  const periodLabel = stats.period === "week" ? "this week" : "this month";
  const priorLabel = stats.period === "week" ? "last week" : "prior 30 days";
  const delta = stats.closed - stats.closedPrev;
  const trendDir = delta > 0 ? `up ${delta}` : delta < 0 ? `down ${Math.abs(delta)}` : "flat";

  const bestDow = [...stats.dayOfWeek].sort((a, b) => b.total - a.total)[0];
  const priorityCallouts = stats.priorityMix
    .filter((p) => p.n > 0)
    .map((p) => `${p.n} ${p.priority}`)
    .join(", ");
  const topProjLines = stats.topProjects.map((p) => `${p.name} (${p.closed})`).join(", ");
  const longerLines = stats.longerThanMedian.map((t) => `- "${t.title}" (${t.project}): ${t.days}d vs median ${t.medianDays}d`).join("\n");

  const system =
    "You write a 3-4 sentence personal recap for a software-startup teammate's weekly/monthly dashboard. " +
    "Tone: warm but specific, data-aware, no cheerleading, no exclamation points, no emoji, no markdown. " +
    "First sentence: address them by first name, name what they closed (number + 1 specific task). " +
    "Second sentence: call out a non-obvious PATTERN from the data they wouldn't catch in raw numbers (best day of week, priority skew, project concentration, trend direction). " +
    "Third sentence: name ONE concrete area to focus on next, citing specific tasks if relevant. " +
    "Plain prose only.";

  const prompt =
`First name: ${name.split(/\s+/)[0]}
Window: ${periodLabel} (${stats.rangeLabel}, Asia/Kolkata)

Closures: ${stats.closed} (${trendDir} vs ${priorLabel})
Comments sent: ${stats.comments}, received: ${stats.commentsReceived}
New captured: ${stats.newCreated}
Active days: ${stats.daysActive}/${stats.daily.length}
Streak: ${stats.streak} (best ever ${stats.streakBest})

Priority mix of closures: ${priorityCallouts || "no closures"}
Top projects: ${topProjLines || "none"}
Day-of-week activity (Mon→Sun): ${stats.dayOfWeek.map((d) => `${d.label}:${d.total}`).join(", ")}
Best day: ${bestDow ? `${bestDow.label} (${bestDow.total} closures)` : "n/a"}

Multi-week trend (closures by week, oldest→newest): ${stats.weeklyTrend.map((w) => w.closed).join(", ")}

Oldest open: ${stats.oldestOpen ? `"${stats.oldestOpen.title}" (${stats.oldestOpen.project}, ${stats.oldestOpen.ageDays}d old)` : "none"}
Fastest closure: ${stats.fastest ? `"${stats.fastest.title}" — ${stats.fastest.days}d` : "n/a"}
Slowest closure: ${stats.slowest ? `"${stats.slowest.title}" — ${stats.slowest.days}d` : "n/a"}
Tasks exceeding project median:
${longerLines || "(none)"}

Write the recap.`;

  const started = Date.now();
  const r = await llm.complete({
    sensitivity: "internal", system, prompt,
    temperature: 0.5, maxTokens: 320, timeoutMs: 30_000,
  });
  return { body: (r.text ?? "").trim(), model: r.model, durationMs: Date.now() - started };
}

export interface DashboardResult {
  ok: boolean;
  stats?: BentoStats;
  narrative?: string;
  model?: string;
  generatedAt?: Date;
  cached?: boolean;
  error?: string;
}

const NARRATIVE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function getOrGenerateDashboard(period: Period, opts?: { force?: boolean }): Promise<DashboardResult> {
  const userId = await getCurrentUserId();
  const me = await getCurrentUser();
  const now = new Date();
  const periodKey = period === "week" ? isoWeekKey(now) : monthKey(now);
  const db = getDb();

  // Always compute fresh stats so numbers are live
  try {
    const stats = await computeStats(userId, period);

    // Reuse cached narrative if it's recent enough (saves LLM call)
    let narrative = "", model = "", durationMs = 0;
    let generatedAt = now;
    let narrativeCached = false;

    if (!opts?.force) {
      const [existing] = await db
        .select()
        .from(aiDashboards)
        .where(and(eq(aiDashboards.userId, userId), eq(aiDashboards.period, period), eq(aiDashboards.periodKey, periodKey)))
        .limit(1);
      if (existing?.narrative && existing.generatedAt) {
        const age = now.getTime() - new Date(existing.generatedAt).getTime();
        if (age < NARRATIVE_TTL_MS) {
          narrative = existing.narrative;
          model = existing.model ?? "";
          generatedAt = existing.generatedAt;
          narrativeCached = true;
        }
      }
    }

    // Generate fresh narrative if needed
    if (!narrative) {
      try {
        const r = await generateNarrative(stats, me.name);
        narrative = r.body; model = r.model; durationMs = r.durationMs;
        generatedAt = now;
      } catch (e) {
        log.warn("dashboard.narrative_failed", { period, error: (e as Error).message });
      }
    }

    // Persist latest stats + narrative
    await db
      .insert(aiDashboards)
      .values({
        userId, period, periodKey,
        bodyJson: stats as unknown as object,
        narrative: narrative || null, model: model || null, durationMs,
      })
      .onConflictDoUpdate({
        target: [aiDashboards.userId, aiDashboards.period, aiDashboards.periodKey],
        set: {
          bodyJson: stats as unknown as object,
          ...(!narrativeCached ? {
            narrative: narrative || null, model: model || null, durationMs,
            generatedAt: new Date(),
          } : {}),
        },
      });

    if (!narrativeCached) {
      log.info("dashboard.generated", { period, periodKey, durationMs, model });
    }
    return { ok: true, stats, narrative: narrative || undefined, model, generatedAt, cached: narrativeCached };
  } catch (e) {
    log.error("dashboard.failed", { period, error: (e as Error).message });
    return { ok: false, error: (e as Error).message };
  }
}

export async function refreshDashboard(formData: FormData): Promise<void> {
  const period = (formData.get("period") as Period) === "month" ? "month" : "week";
  await getOrGenerateDashboard(period, { force: true });
  revalidatePath(`/me/${period}`);
}
