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
  departments,
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
  deptBreakdown: Array<{ id: string; name: string; color: string | null; closed: number; open: number; created: number; members: number }>;

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
    where assignee_id = ${userId} and status = 'done'::task_status and completed_at is not null
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

  // ----- Run all independent query groups in parallel -----
  const trendWeeks = period === "week" ? 4 : 8;
  const trendStartDay = shiftIST(todayIST, -(trendWeeks - 1) * 7 - 6);
  const trendStartBound = dayBoundsIST(trendStartDay).start;

  const [
    headlineCounts,
    dailyRows,
    trendRows,
    dowRows,
    prioRows,
    projectRows,
    projBreakdownRows,
    teamRows,
    deptRows,
    oldestRows,
    fastSlowRows,
    longerRows,
    streakResult,
  ] = await Promise.all([
    // 1. Headline counts — single query instead of 5
    db.execute(sql<{ closed: number; closed_prev: number; comments: number; comments_rcv: number; created: number }>`
      select
        coalesce((select count(*) from tasks
          where assignee_id = ${userId} and status = 'done'::task_status
            and completed_at >= ${startStart.toISOString()} and completed_at <= ${endEnd.toISOString()}), 0)::int as closed,
        coalesce((select count(*) from tasks
          where assignee_id = ${userId} and status = 'done'::task_status
            and completed_at >= ${prevStartStart.toISOString()} and completed_at <= ${prevEndEnd.toISOString()}), 0)::int as closed_prev,
        coalesce((select count(*) from task_comments
          where author_id = ${userId}
            and created_at >= ${startStart.toISOString()} and created_at <= ${endEnd.toISOString()}), 0)::int as comments,
        coalesce((select count(*) from task_comments c join tasks t on t.id = c.task_id
          where t.assignee_id = ${userId} and c.author_id <> ${userId}
            and c.created_at >= ${startStart.toISOString()} and c.created_at <= ${endEnd.toISOString()}), 0)::int as comments_rcv,
        coalesce((select count(*) from tasks
          where created_by_id = ${userId}
            and created_at >= ${startStart.toISOString()} and created_at <= ${endEnd.toISOString()}), 0)::int as created
    `),

    // 2. Daily breakdown
    db.execute(sql<{ d: string; closed: number; commented: number }>`
      with d as (
        select generate_series(${startStart.toISOString()}::timestamptz, ${endEnd.toISOString()}::timestamptz, '1 day') as ts
      )
      select to_char((d.ts at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as d,
        coalesce((select count(*) from tasks t
          where t.assignee_id = ${userId} and t.status = 'done'::task_status
            and (t.completed_at at time zone 'Asia/Kolkata')::date = (d.ts at time zone 'Asia/Kolkata')::date), 0)::int as closed,
        coalesce((select count(*) from task_comments c
          where c.author_id = ${userId}
            and (c.created_at at time zone 'Asia/Kolkata')::date = (d.ts at time zone 'Asia/Kolkata')::date), 0)::int as commented
      from d order by d
    `),

    // 3. Multi-week trend — single query instead of 4-8 loop
    db.execute(sql<{ week_start: string; n: number }>`
      with weeks as (
        select generate_series(
          ${trendStartBound.toISOString()}::timestamptz,
          ${endEnd.toISOString()}::timestamptz,
          '7 days'
        )::date as ws
      )
      select to_char(w.ws, 'YYYY-MM-DD') as week_start,
        coalesce((select count(*) from tasks t
          where t.assignee_id = ${userId} and t.status = 'done'::task_status
            and t.completed_at >= w.ws::timestamptz
            and t.completed_at < (w.ws + 7)::timestamptz), 0)::int as n
      from weeks w order by w.ws
    `),

    // 4. Day-of-week pattern
    db.execute(sql<{ dow: number; n: number }>`
      select extract(dow from (completed_at at time zone 'Asia/Kolkata'))::int as dow,
             count(*)::int as n
      from tasks
      where assignee_id = ${userId} and status = 'done'::task_status
        and completed_at >= ${startStart.toISOString()}
        and completed_at <= ${endEnd.toISOString()}
      group by dow
    `),

    // 5. Priority mix
    db.execute(sql<{ priority: string; n: number }>`
      select priority::text as priority, count(*)::int as n
      from tasks
      where assignee_id = ${userId} and status = 'done'::task_status
        and completed_at >= ${startStart.toISOString()}
        and completed_at <= ${endEnd.toISOString()}
      group by priority
    `),

    // 6. Top 3 projects
    db.select({ slug: projects.slug, name: projects.name, n: sql<number>`count(*)::int` })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(eq(tasks.assigneeId, userId), eq(tasks.status, "done"),
        sql`${tasks.completedAt} >= ${startStart.toISOString()} and ${tasks.completedAt} <= ${endEnd.toISOString()}`))
      .groupBy(projects.slug, projects.name)
      .orderBy(desc(sql`count(*)`))
      .limit(3),

    // 7. Full project breakdown
    db.execute(sql<{ slug: string; name: string; closed: number; open: number; created: number }>`
      select p.slug, p.name,
        coalesce(sum(case when t.status = 'done'::task_status and t.completed_at >= ${startStart.toISOString()}
          and t.completed_at <= ${endEnd.toISOString()} then 1 else 0 end), 0)::int as closed,
        coalesce(sum(case when t.status not in ('done'::task_status, 'cancelled'::task_status) then 1 else 0 end), 0)::int as open,
        coalesce(sum(case when t.created_at >= ${startStart.toISOString()}
          and t.created_at <= ${endEnd.toISOString()} then 1 else 0 end), 0)::int as created
      from projects p
      left join tasks t on t.project_id = p.id
      group by p.slug, p.name
      having coalesce(sum(case when t.status = 'done'::task_status and t.completed_at >= ${startStart.toISOString()}
          and t.completed_at <= ${endEnd.toISOString()} then 1 else 0 end), 0) > 0
        or coalesce(sum(case when t.status not in ('done'::task_status, 'cancelled'::task_status) then 1 else 0 end), 0) > 0
        or coalesce(sum(case when t.created_at >= ${startStart.toISOString()}
          and t.created_at <= ${endEnd.toISOString()} then 1 else 0 end), 0) > 0
      order by closed desc, open desc
    `),

    // 8. Team breakdown
    db.execute(sql<{ name: string; closed: number; comments: number; created: number }>`
      select u.name,
        coalesce((select count(*) from tasks t
          where t.assignee_id = u.id and t.status = 'done'::task_status
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
    `),

    // 9. Department breakdown
    db.execute(sql<{ id: string; name: string; color: string | null; closed: number; open: number; created: number; members: number }>`
      select d.id, d.name, d.color,
        coalesce(sum(case when t.status = 'done'::task_status and t.completed_at >= ${startStart.toISOString()}
          and t.completed_at <= ${endEnd.toISOString()} then 1 else 0 end), 0)::int as closed,
        coalesce(sum(case when t.status not in ('done'::task_status, 'cancelled'::task_status) then 1 else 0 end), 0)::int as open,
        coalesce(sum(case when t.created_at >= ${startStart.toISOString()}
          and t.created_at <= ${endEnd.toISOString()} then 1 else 0 end), 0)::int as created,
        (select count(*)::int from users u2 where u2.department_id = d.id and u2.is_active = true) as members
      from departments d
      left join users u on u.department_id = d.id and u.is_active = true
      left join tasks t on t.assignee_id = u.id
      group by d.id, d.name, d.color
      order by closed desc, open desc
    `),

    // 10. Oldest open
    db.select({ id: tasks.id, title: tasks.title, createdAt: tasks.createdAt, project: projects.name })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(eq(tasks.assigneeId, userId), sql`${tasks.status} not in ('done'::task_status, 'cancelled'::task_status)`))
      .orderBy(tasks.createdAt)
      .limit(1),

    // 11. Fastest + slowest closures — single query
    db.execute(sql<{ id: string; title: string; project: string; days: number; rk: number }>`
      (select t.id, t.title, p.name as project,
              extract(epoch from (t.completed_at - t.created_at)) / 86400.0 as days, 1 as rk
       from tasks t join projects p on t.project_id = p.id
       where t.assignee_id = ${userId} and t.status = 'done'::task_status
         and t.completed_at >= ${startStart.toISOString()} and t.completed_at <= ${endEnd.toISOString()}
         and t.created_at is not null and t.completed_at - t.created_at > interval '5 minutes'
       order by days asc limit 1)
      union all
      (select t.id, t.title, p.name as project,
              extract(epoch from (t.completed_at - t.created_at)) / 86400.0 as days, 2 as rk
       from tasks t join projects p on t.project_id = p.id
       where t.assignee_id = ${userId} and t.status = 'done'::task_status
         and t.completed_at >= ${startStart.toISOString()} and t.completed_at <= ${endEnd.toISOString()}
         and t.created_at is not null
       order by days desc limit 1)
    `),

    // 12. Tougher than median
    db.execute(sql<{ id: string; title: string; project: string; days: number; median_days: number }>`
      with closed_in_window as (
        select t.id, t.title, p.name as project,
               extract(epoch from (t.completed_at - t.created_at)) / 86400.0 as days,
               t.project_id
        from tasks t join projects p on t.project_id = p.id
        where t.assignee_id = ${userId} and t.status = 'done'::task_status
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
        where status = 'done'::task_status and completed_at >= now() - interval '90 days'
          and created_at is not null
        group by project_id
      )
      select cw.id, cw.title, cw.project, cw.days, coalesce(m.median_days, 2) as median_days
      from closed_in_window cw left join medians m on m.project_id = cw.project_id
      where cw.days > coalesce(m.median_days, 2)
      order by (cw.days - coalesce(m.median_days, 2)) desc limit 3
    `),

    // 13. Streak
    computeStreak(userId),
  ]);

  // ----- Unpack results -----

  const hl = (headlineCounts as unknown as Array<any>)[0] ?? {};
  const closed = Number(hl.closed) || 0;
  const closedPrev = Number(hl.closed_prev) || 0;
  const comments = Number(hl.comments) || 0;
  const commentsReceived = Number(hl.comments_rcv) || 0;
  const newCreated = Number(hl.created) || 0;

  const daily = (dailyRows as unknown as Array<{ d: string; closed: number; commented: number }>).map((r) => ({
    day: r.d.toString().slice(0, 10),
    closed: Number(r.closed) || 0,
    commented: Number(r.commented) || 0,
  }));
  const daysActive = daily.filter((d) => d.closed > 0 || d.commented > 0).length;

  // Build weeklyTrend from the single trend query
  const rawTrend = (trendRows as unknown as Array<{ week_start: string; n: number }>);
  const weeklyTrend: BentoStats["weeklyTrend"] = rawTrend.map((r) => {
    const ws = r.week_start.toString().slice(0, 10);
    return { weekStart: ws, weekKey: isoWeekKey(new Date(`${ws}T12:00:00+05:30`)), closed: Number(r.n) || 0 };
  });

  const dowMap = new Map<number, number>();
  for (const r of (dowRows as unknown as Array<{ dow: number; n: number }>)) {
    dowMap.set(Number(r.dow), Number(r.n) || 0);
  }
  const dowDisplayOrder = [1, 2, 3, 4, 5, 6, 0];
  const dayOfWeek = dowDisplayOrder.map((d) => ({
    dow: d, label: DOW_LABELS[d]!, total: dowMap.get(d) ?? 0,
  }));

  const prioMap = new Map<string, number>();
  for (const r of (prioRows as unknown as Array<{ priority: string; n: number }>)) {
    prioMap.set(r.priority, Number(r.n) || 0);
  }
  const priorityMix: BentoStats["priorityMix"] = (["urgent", "high", "med", "low"] as const).map((p) => ({
    priority: p, n: prioMap.get(p) ?? 0,
  }));

  const topProjects = projectRows.map((r) => ({ slug: r.slug, name: r.name, closed: r.n }));

  const projectBreakdown = (projBreakdownRows as unknown as Array<{
    slug: string; name: string; closed: number; open: number; created: number;
  }>).map((r) => ({
    slug: r.slug, name: r.name,
    closed: Number(r.closed) || 0, open: Number(r.open) || 0, created: Number(r.created) || 0,
  }));

  const teamBreakdown = (teamRows as unknown as Array<{
    name: string; closed: number; comments: number; created: number;
  }>).map((r) => ({
    name: r.name, closed: Number(r.closed) || 0,
    comments: Number(r.comments) || 0, created: Number(r.created) || 0,
  }));

  const deptBreakdown = (deptRows as unknown as Array<{
    id: string; name: string; color: string | null; closed: number; open: number; created: number; members: number;
  }>).map((r) => ({
    id: r.id, name: r.name, color: r.color ?? null,
    closed: Number(r.closed) || 0, open: Number(r.open) || 0,
    created: Number(r.created) || 0, members: Number(r.members) || 0,
  }));

  const oldestOpen = oldestRows[0] ? {
    id: oldestRows[0].id, title: oldestRows[0].title, project: oldestRows[0].project,
    ageDays: Math.floor((Date.now() - (oldestRows[0].createdAt instanceof Date ? oldestRows[0].createdAt : new Date(oldestRows[0].createdAt)).getTime()) / 86400000),
  } : undefined;

  const fsRows = fastSlowRows as unknown as Array<{ id: string; title: string; project: string; days: number; rk: number }>;
  const fr = fsRows.find((r) => Number(r.rk) === 1);
  const sr = fsRows.find((r) => Number(r.rk) === 2);
  const fastest = fr ? { id: fr.id, title: fr.title, project: fr.project, days: Math.max(1, Math.round(Number(fr.days))) } : undefined;
  const slowest = sr ? { id: sr.id, title: sr.title, project: sr.project, days: Math.max(1, Math.round(Number(sr.days))) } : undefined;

  const longerThanMedian = (longerRows as unknown as Array<{
    id: string; title: string; project: string; days: number; median_days: number;
  }>).map((r) => ({
    id: r.id, title: r.title, project: r.project,
    days: Math.round(Number(r.days)),
    medianDays: Math.max(1, Math.round(Number(r.median_days))),
  }));

  const { current: streak, best: streakBest } = streakResult;

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

// =====================================================================
// Department dashboard
// =====================================================================

export interface DeptDashStats {
  period: Period;
  rangeLabel: string;
  deptId: string;
  deptName: string;
  deptColor: string | null;

  // headline
  closed: number;
  closedPrev: number;
  open: number;
  created: number;
  comments: number;
  daysActive: number;

  // per-member breakdown
  members: Array<{
    id: string;
    name: string;
    closed: number;
    open: number;
    created: number;
    comments: number;
  }>;

  // per-project breakdown
  projectMix: Array<{ slug: string; name: string; closed: number; open: number }>;

  // priority mix
  priorityMix: Array<{ priority: "urgent" | "high" | "med" | "low"; n: number }>;

  // daily breakdown
  daily: Array<{ day: string; closed: number; commented: number }>;
}

export interface DeptDashResult {
  ok: boolean;
  stats?: DeptDashStats;
  error?: string;
}

export async function getDeptDashboard(deptId: string, period: Period): Promise<DeptDashResult> {
  const db = getDb();
  const now = new Date();
  const todayIST = istDayString(now);
  const windowDays = period === "week" ? 7 : 30;
  const startDay = shiftIST(todayIST, -(windowDays - 1));
  const endDay = todayIST;
  const prevStartDay = shiftIST(todayIST, -(2 * windowDays - 1));
  const prevEndDay = shiftIST(todayIST, -windowDays);
  const startFmt = new Date(`${startDay}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: TZ });
  const endFmt = new Date(`${endDay}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: TZ });
  const rangeLabel = `${startFmt} → ${endFmt}`;

  const { start: startStart } = dayBoundsIST(startDay);
  const { end: endEnd } = dayBoundsIST(endDay);
  const { start: prevStartStart } = dayBoundsIST(prevStartDay);
  const { end: prevEndEnd } = dayBoundsIST(prevEndDay);

  try {
    // Fetch department info
    const [dept] = await db.select().from(departments).where(eq(departments.id, deptId)).limit(1);
    if (!dept) return { ok: false, error: "Department not found" };

    // Get member IDs
    const memberRows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.departmentId, deptId), eq(users.isActive, true)));
    const memberIds = memberRows.map((m) => m.id);

    if (memberIds.length === 0) {
      return {
        ok: true,
        stats: {
          period, rangeLabel, deptId, deptName: dept.name, deptColor: dept.color,
          closed: 0, closedPrev: 0, open: 0, created: 0, comments: 0, daysActive: 0,
          members: [], projectMix: [], priorityMix: [], daily: [],
        },
      };
    }

    const memberIdList = memberIds.map((id) => `'${id}'`).join(",");

    // Headline counts
    const headlineRows = await db.execute(sql.raw(`
      select
        coalesce(sum(case when status = 'done'::task_status and completed_at >= '${startStart.toISOString()}'
          and completed_at <= '${endEnd.toISOString()}' then 1 else 0 end), 0)::int as closed,
        coalesce(sum(case when status = 'done'::task_status and completed_at >= '${prevStartStart.toISOString()}'
          and completed_at <= '${prevEndEnd.toISOString()}' then 1 else 0 end), 0)::int as closed_prev,
        coalesce(sum(case when status not in ('done'::task_status, 'cancelled'::task_status) then 1 else 0 end), 0)::int as open,
        coalesce(sum(case when created_at >= '${startStart.toISOString()}'
          and created_at <= '${endEnd.toISOString()}' then 1 else 0 end), 0)::int as created
      from tasks where assignee_id in (${memberIdList})
    `));
    const hl = (headlineRows as unknown as Array<any>)[0] ?? {};

    // Comments count
    const [commentRow] = await db.execute(sql.raw(`
      select count(*)::int as n from task_comments
      where author_id in (${memberIdList})
        and created_at >= '${startStart.toISOString()}'
        and created_at <= '${endEnd.toISOString()}'
    `)) as unknown as Array<{ n: number }>;

    // Per-member breakdown
    const memberStatRows = await db.execute(sql.raw(`
      select u.id, u.name,
        coalesce(sum(case when t.status = 'done'::task_status and t.completed_at >= '${startStart.toISOString()}'
          and t.completed_at <= '${endEnd.toISOString()}' then 1 else 0 end), 0)::int as closed,
        coalesce(sum(case when t.status not in ('done'::task_status, 'cancelled'::task_status) then 1 else 0 end), 0)::int as open,
        coalesce(sum(case when t.created_at >= '${startStart.toISOString()}'
          and t.created_at <= '${endEnd.toISOString()}' then 1 else 0 end), 0)::int as created,
        coalesce((select count(*)::int from task_comments c where c.author_id = u.id
          and c.created_at >= '${startStart.toISOString()}'
          and c.created_at <= '${endEnd.toISOString()}'), 0)::int as comments
      from users u left join tasks t on t.assignee_id = u.id
      where u.id in (${memberIdList})
      group by u.id, u.name order by closed desc
    `));

    // Per-project breakdown
    const projRows = await db.execute(sql.raw(`
      select p.slug, p.name,
        coalesce(sum(case when t.status = 'done'::task_status and t.completed_at >= '${startStart.toISOString()}'
          and t.completed_at <= '${endEnd.toISOString()}' then 1 else 0 end), 0)::int as closed,
        coalesce(sum(case when t.status not in ('done'::task_status, 'cancelled'::task_status) then 1 else 0 end), 0)::int as open
      from tasks t join projects p on t.project_id = p.id
      where t.assignee_id in (${memberIdList})
      group by p.slug, p.name
      having coalesce(sum(case when t.status = 'done'::task_status and t.completed_at >= '${startStart.toISOString()}'
        and t.completed_at <= '${endEnd.toISOString()}' then 1 else 0 end), 0) > 0
        or coalesce(sum(case when t.status not in ('done'::task_status, 'cancelled'::task_status) then 1 else 0 end), 0) > 0
      order by closed desc
    `));

    // Priority mix
    const prioRows = await db.execute(sql.raw(`
      select priority::text as priority, count(*)::int as n
      from tasks where assignee_id in (${memberIdList}) and status = 'done'::task_status
        and completed_at >= '${startStart.toISOString()}'
        and completed_at <= '${endEnd.toISOString()}'
      group by priority
    `));
    const prioMap = new Map<string, number>();
    for (const r of (prioRows as unknown as Array<{ priority: string; n: number }>)) {
      prioMap.set(r.priority, Number(r.n) || 0);
    }

    // Daily breakdown
    const dailyRows = await db.execute(sql.raw(`
      with d as (
        select generate_series('${startStart.toISOString()}'::timestamptz, '${endEnd.toISOString()}'::timestamptz, '1 day') as ts
      )
      select to_char((d.ts at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as d,
        coalesce((select count(*) from tasks t
          where t.assignee_id in (${memberIdList}) and t.status = 'done'::task_status
            and (t.completed_at at time zone 'Asia/Kolkata')::date = (d.ts at time zone 'Asia/Kolkata')::date), 0)::int as closed,
        coalesce((select count(*) from task_comments c
          where c.author_id in (${memberIdList})
            and (c.created_at at time zone 'Asia/Kolkata')::date = (d.ts at time zone 'Asia/Kolkata')::date), 0)::int as commented
      from d order by d
    `));
    const daily = (dailyRows as unknown as Array<{ d: string; closed: number; commented: number }>).map((r) => ({
      day: r.d.toString().slice(0, 10), closed: Number(r.closed) || 0, commented: Number(r.commented) || 0,
    }));
    const daysActive = daily.filter((d) => d.closed > 0 || d.commented > 0).length;

    return {
      ok: true,
      stats: {
        period, rangeLabel, deptId, deptName: dept.name, deptColor: dept.color,
        closed: Number(hl.closed) || 0,
        closedPrev: Number(hl.closed_prev) || 0,
        open: Number(hl.open) || 0,
        created: Number(hl.created) || 0,
        comments: Number(commentRow?.n) || 0,
        daysActive,
        members: (memberStatRows as unknown as Array<any>).map((r) => ({
          id: r.id, name: r.name, closed: Number(r.closed) || 0,
          open: Number(r.open) || 0, created: Number(r.created) || 0, comments: Number(r.comments) || 0,
        })),
        projectMix: (projRows as unknown as Array<any>).map((r) => ({
          slug: r.slug, name: r.name, closed: Number(r.closed) || 0, open: Number(r.open) || 0,
        })),
        priorityMix: (["urgent", "high", "med", "low"] as const).map((p) => ({
          priority: p, n: prioMap.get(p) ?? 0,
        })),
        daily,
      },
    };
  } catch (e) {
    log.error("dept_dashboard.failed", { deptId, period, error: (e as Error).message });
    return { ok: false, error: (e as Error).message };
  }
}

/** Fetch all departments for navigation */
export async function getAllDepartments(): Promise<Array<{ id: string; name: string; color: string | null }>> {
  const db = getDb();
  const rows = await db.select({ id: departments.id, name: departments.name, color: departments.color }).from(departments).orderBy(departments.name);
  return rows;
}
