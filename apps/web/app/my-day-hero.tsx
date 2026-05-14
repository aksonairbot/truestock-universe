// apps/web/app/my-day-hero.tsx
//
// "My Day" hero — the top pane of the home page. Answers, for whoever is
// signed in: "what should I do right now, and how am I doing this week?"
//
// Visible to current user only. Manager/admin still sees the team rollup
// underneath. The streak chip + lifetime stats + personal-best are private
// — never exposed on /members or any peer-visible surface.

import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getDb, tasks, taskComments, projects, eq, and, sql, desc } from "@tu/db";
import { CountUp } from "./count-up";
import { QuickCapture } from "./quick-capture";
import { LatestBadgeBanner } from "./badge-shelf";

const TZ = "Asia/Kolkata";
const PRIORITY_WEIGHT: Record<string, number> = { urgent: 4, high: 3, med: 2, low: 1 };
const PRIORITY_RANK: Record<string, number> = { urgent: 4, high: 3, med: 2, low: 1 };

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
function startOfTodayIST(): Date {
  return new Date(`${istDayString(new Date())}T00:00:00+05:30`);
}

function fmtDateShort(d: string | Date | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(`${d}T12:00:00+05:30`) : d;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}
function fmtTime(d: Date): string {
  return d.toLocaleString("en-IN", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit",
  });
}

function greeting(): string {
  const hour = parseInt(new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ, hour: "2-digit", hour12: false,
  }).format(new Date()), 10);
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// Compute current streak: consecutive distinct IST days the user closed ≥1
// task, ending today or yesterday (allow today-empty until end of day).
async function computeStreak(userId: string): Promise<{ current: number; thresholdHit: number | null; best: number }> {
  const db = getDb();
  const rows = await db.execute(sql<{ d: string }>`
    select distinct (completed_at at time zone 'Asia/Kolkata')::date::text as d
    from tasks
    where assignee_id = ${userId}
      and status = 'done'
      and completed_at is not null
      and completed_at >= now() - interval '2 years'
    order by d desc
  `);
  const days = (rows as unknown as Array<{ d: string }>).map((r) => r.d.toString().slice(0, 10));
  if (days.length === 0) return { current: 0, thresholdHit: null, best: 0 };

  // Compute longest-ever streak by walking the full sorted-desc list and
  // looking for consecutive-day runs (a gap of exactly 1 IST day between
  // adjacent entries).
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const prevDay = new Date(`${days[i - 1]}T12:00:00+05:30`);
    const cur = new Date(`${days[i]}T12:00:00+05:30`);
    const gap = Math.round((prevDay.getTime() - cur.getTime()) / 86400000);
    if (gap === 1) { run += 1; best = Math.max(best, run); }
    else { run = 1; }
  }

  const today = istDayString(new Date());
  const yesterday = shiftIST(today, -1);

  let streak = 0;
  let cursor: string;

  if (days[0] === today) {
    cursor = today;
  } else if (days[0] === yesterday) {
    // Today still in play — yesterday counts as keeping the streak alive.
    cursor = yesterday;
  } else {
    return { current: 0, thresholdHit: null, best };
  }

  for (const d of days) {
    if (d === cursor) {
      streak++;
      cursor = shiftIST(cursor, -1);
    } else if (d < cursor) {
      break;
    }
  }

  // Which milestone, if any, was hit exactly today?
  const THRESHOLDS = [3, 7, 14, 30, 60, 100];
  const hitToday = days[0] === today && THRESHOLDS.includes(streak) ? streak : null;
  return { current: streak, thresholdHit: hitToday, best: Math.max(best, streak) };
}

export async function MyDayHero() {
  const me = await getCurrentUser();
  const db = getDb();
  const today = istDayString(new Date());
  const yesterday = shiftIST(today, -1);
  const start7d = new Date(`${shiftIST(today, -6)}T00:00:00+05:30`);
  const startToday = new Date(`${today}T00:00:00+05:30`);
  const startYesterday = new Date(`${yesterday}T00:00:00+05:30`);
  const endYesterday = new Date(`${yesterday}T23:59:59.999+05:30`);

  // ---------- stats ----------
  const [closedTodayRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.assigneeId, me.id), eq(tasks.status, "done"), sql`${tasks.completedAt} >= ${startToday.toISOString()}`));
  const closedToday = closedTodayRow?.n ?? 0;

  const [closed7dRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.assigneeId, me.id), eq(tasks.status, "done"), sql`${tasks.completedAt} >= ${start7d.toISOString()}`));
  const closed7d = closed7dRow?.n ?? 0;

  const [commentsTodayRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(taskComments)
    .where(and(eq(taskComments.authorId, me.id), sql`${taskComments.createdAt} >= ${startToday.toISOString()}`));
  const commentsToday = commentsTodayRow?.n ?? 0;

  const [lifetimeRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.assigneeId, me.id), eq(tasks.status, "done")));
  const lifetimeClosed = lifetimeRow?.n ?? 0;

  const { current: streak, thresholdHit, best: streakBest } = await computeStreak(me.id);

  // ---------- top priorities (≤5) ----------
  const open = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      project: { slug: projects.slug, name: projects.name },
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(eq(tasks.assigneeId, me.id), sql`${tasks.status} not in ('done','cancelled')`));

  function dueRank(due: string | null): number {
    if (!due) return 3; // no due date → lowest tier within "later"
    const d = new Date(`${due}T12:00:00+05:30`);
    const t = startOfTodayIST();
    if (d < t) return 0; // overdue
    if (istDayString(d) === today) return 1; // today
    const wk = new Date(t); wk.setDate(wk.getDate() + 7);
    if (d <= wk) return 2; // this week
    return 3; // later
  }

  const priorities = [...open]
    .map((t) => ({ ...t, _due: dueRank(t.dueDate), _prio: PRIORITY_RANK[t.priority] ?? 0 }))
    .sort((a, b) => {
      if (a._due !== b._due) return a._due - b._due;
      if (a._prio !== b._prio) return b._prio - a._prio;
      return 0;
    })
    .slice(0, 5);

  // ---------- yesterday's wins ----------
  const yesterdaysWins = await db
    .select({
      id: tasks.id, title: tasks.title, completedAt: tasks.completedAt,
      project: { slug: projects.slug, name: projects.name },
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(
      eq(tasks.assigneeId, me.id),
      eq(tasks.status, "done"),
      sql`${tasks.completedAt} >= ${startYesterday.toISOString()}`,
      sql`${tasks.completedAt} <= ${endYesterday.toISOString()}`,
    ))
    .orderBy(desc(tasks.completedAt))
    .limit(5);

  // ---------- "waiting on you": tasks assigned to me that someone ELSE recently commented on
  const waitingOnMe = await db.execute(sql<{
    id: string; title: string; project_slug: string; project_name: string;
    last_comment_at: Date; last_commenter: string;
  }>`
    with my_open as (
      select t.id, t.title, p.slug as project_slug, p.name as project_name
      from tasks t join projects p on t.project_id = p.id
      where t.assignee_id = ${me.id}
        and t.status not in ('done','cancelled')
    ),
    latest as (
      select c.task_id, c.created_at, c.author_id,
             row_number() over (partition by c.task_id order by c.created_at desc) as rn
      from task_comments c
      where c.author_id <> ${me.id}
        and c.created_at >= now() - interval '7 days'
    )
    select m.id, m.title, m.project_slug, m.project_name,
           l.created_at as last_comment_at,
           u.name as last_commenter
    from my_open m
    join latest l on l.task_id = m.id and l.rn = 1
    join users u on u.id = l.author_id
    order by l.created_at desc
    limit 5
  `);
  const waiting = waitingOnMe as unknown as Array<{
    id: string; title: string; project_slug: string; project_name: string;
    last_comment_at: Date; last_commenter: string;
  }>;

  return (
    <section className="myday">
      <div className="myday-head">
        <div>
          <div className="myday-greeting">{greeting()}, {me.name.split(/\s+/)[0]}.</div>
          <div className="myday-date">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}</div>
        </div>
        {streak > 0 ? (
          <div className={`streak-chip ${streak >= 7 ? "streak-hot" : ""}`} title={`Current streak: ${streak} day${streak === 1 ? "" : "s"}. ${closedToday === 0 ? "Close 1 today to keep it alive." : "Already closed today — locked in."}`}>
            <span className="streak-flame" aria-hidden="true">🔥</span>
            <span className="streak-n"><CountUp value={streak} /></span>
            <span className="streak-label">day streak</span>
            {streakBest > streak ? (
              <span className="streak-best" title={`Your personal best: ${streakBest} days`}>
                best {streakBest}
              </span>
            ) : streak >= 3 ? (
              <span className="streak-best streak-best-record" title="This is your longest streak yet.">
                personal best
              </span>
            ) : null}
          </div>
        ) : null}
        {thresholdHit ? (
          <StreakCelebrate threshold={thresholdHit} />
        ) : null}
      </div>

      <div className="myday-stats">
        <div className="myday-stat">
          <div className="myday-stat-label">Closed today</div>
          <div className="myday-stat-val"><CountUp value={closedToday} /></div>
        </div>
        <div className="myday-stat">
          <div className="myday-stat-label">Closed · 7d</div>
          <div className="myday-stat-val"><CountUp value={closed7d} /></div>
        </div>
        <div className="myday-stat">
          <div className="myday-stat-label">Comments today</div>
          <div className="myday-stat-val"><CountUp value={commentsToday} /></div>
        </div>
        <div className="myday-stat">
          <div className="myday-stat-label">Lifetime</div>
          <div className="myday-stat-val"><CountUp value={lifetimeClosed} /></div>
        </div>
      </div>

      <LatestBadgeBanner userId={me.id} />

      <div className="myday-grid">
        {/* ----- top priorities ----- */}
        <div className="myday-card stagger-1">
          <h3 className="myday-card-h">
            Top priorities
            <span className="text-text-3 font-normal ml-2">· {priorities.length}</span>
          </h3>
          {priorities.length === 0 ? (
            <div className="text-text-3 italic text-sm">Nothing on your plate. Use quick capture below to add something, or look at the team rollup.</div>
          ) : (
            <ul className="myday-task-list">
              {priorities.map((t) => {
                const overdue = t._due === 0;
                const today_ = t._due === 1;
                return (
                  <li key={t.id} className="myday-task">
                    <Link href={`/tasks?task=${t.id}`} className="myday-task-title" scroll={false}>
                      {t.title}
                    </Link>
                    <div className="myday-task-meta">
                      <span className={`pchip ${t.project.slug}`}>{t.project.name}</span>
                      <span className={`prio-chip prio-${t.priority}`}>{t.priority}</span>
                      <span className={`myday-due ${overdue ? "overdue" : today_ ? "today" : ""}`}>
                        {t.dueDate ? fmtDateShort(t.dueDate) : "—"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ----- yesterday's wins ----- */}
        <div className="myday-card stagger-2">
          <h3 className="myday-card-h">
            Yesterday's wins
            <span className="text-text-3 font-normal ml-2">· {yesterdaysWins.length}</span>
          </h3>
          {yesterdaysWins.length === 0 ? (
            <div className="text-text-3 italic text-sm">Quiet yesterday. Today's a fresh start.</div>
          ) : (
            <ul className="myday-task-list">
              {yesterdaysWins.map((t) => (
                <li key={t.id} className="myday-task">
                  <Link href={`/tasks?task=${t.id}`} className="myday-task-title done" scroll={false}>
                    <span className="myday-check" aria-hidden="true">✓</span>
                    {t.title}
                  </Link>
                  <div className="myday-task-meta">
                    <span className={`pchip ${t.project.slug}`}>{t.project.name}</span>
                    {t.completedAt ? <span className="myday-due">{fmtTime(t.completedAt)}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ----- waiting on you ----- */}
        <div className="myday-card stagger-3">
          <h3 className="myday-card-h">
            Waiting on you
            <span className="text-text-3 font-normal ml-2">· {waiting.length}</span>
          </h3>
          {waiting.length === 0 ? (
            <div className="text-text-3 italic text-sm">No recent comments needing a reply.</div>
          ) : (
            <ul className="myday-task-list">
              {waiting.map((w) => (
                <li key={w.id} className="myday-task">
                  <Link href={`/tasks?task=${w.id}`} className="myday-task-title" scroll={false}>
                    {w.title}
                  </Link>
                  <div className="myday-task-meta">
                    <span className={`pchip ${w.project_slug}`}>{w.project_name}</span>
                    <span className="myday-due" title={w.last_comment_at?.toString()}>
                      {w.last_commenter} · {fmtDateShort(w.last_comment_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ----- quick capture ----- */}
        <div className="myday-card stagger-4">
          <h3 className="myday-card-h">
            <span className="suggest-sparkle" aria-hidden="true">✨</span>
            Quick capture
          </h3>
          <QuickCapture />
        </div>
      </div>
    </section>
  );
}

// Server-rendered confetti trigger: render an invisible element with data
// attributes that a tiny client effect picks up to fire firePersonalMilestoneConfetti.
function StreakCelebrate({ threshold }: { threshold: number }) {
  return <StreakClientCelebrate threshold={threshold} />;
}
// re-exported from client file:
import { StreakClientCelebrate } from "./streak-celebrate";
