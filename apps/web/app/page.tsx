// apps/web/app/page.tsx
//
// Daily per-person rollup — the home page. Answers "what did each person do
// today?" Counts (and lists) for each user:
//   • tasks they completed today          (status changed to done, completedAt today)
//   • tasks they created today            (createdAt today)
//   • comments they posted today          (taskComments.createdAt today)
//   • their current open task load        (assigned + status not done/cancelled)
//
// Date filter via ?date=YYYY-MM-DD so you can review yesterday's roll-up too.
// "Today" is interpreted in Asia/Kolkata (Skynet's default user TZ).

import { Suspense } from "react";
import Link from "next/link";
import { MyDayHero } from "./my-day-hero";
import { BriefingCard } from "./briefing-card";
import { ReviewCard } from "./review-card";
import { TeamVelocity } from "./team-velocity";
import {
  getDb,
  users,
  tasks,
  taskComments,
  projects,
  eq,
  and,
  desc,
  gte,
  lte,
  sql,
} from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { isPrivileged, isAdmin, getDepartmentScope } from "@/lib/access";

export const dynamic = "force-dynamic";

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------
const TZ = "Asia/Kolkata";

/** YYYY-MM-DD in the workspace's default timezone (IST). */
function todayInTZ(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());
}

/** Returns [startUTC, endUTC] for the given YYYY-MM-DD in Asia/Kolkata. */
function dayBoundsIST(date: string): [Date, Date] {
  // IST = UTC+5:30, no DST. So local-IST midnight = UTC 18:30 the previous day.
  const start = new Date(`${date}T00:00:00+05:30`);
  const end = new Date(`${date}T23:59:59.999+05:30`);
  return [start, end];
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00+05:30`); // noon avoids DST/edge issues (no-op for IST)
  d.setDate(d.getDate() + days);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

function fmtHumanDate(date: string): string {
  const d = new Date(`${date}T12:00:00+05:30`);
  return d.toLocaleDateString("en-IN", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtTime(d: Date): string {
  return d.toLocaleString("en-IN", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function avaClass(name?: string | null): string {
  if (!name) return "h1";
  const sum = [...name].reduce((s, c) => s + c.charCodeAt(0), 0);
  return ["h1", "h2", "h3", "h4"][sum % 4]!;
}
function avaInitials(name?: string | null): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// -----------------------------------------------------------------------------
// page
// -----------------------------------------------------------------------------
interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function HomePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const today = todayInTZ();
  const date = sp.date && isValidDate(sp.date) ? sp.date : today;
  const isToday = date === today;
  const [dayStart, dayEnd] = dayBoundsIST(date);

  const me = await getCurrentUser();
  const canSeeAll = isAdmin(me);
  const deptScope = getDepartmentScope(me);

  const db = getDb();
  // Data wall: admin sees all, manager sees department, member sees only self.
  const allUsers = canSeeAll
    ? await db
        .select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive })
        .from(users)
        .orderBy(desc(users.isActive), users.name)
    : deptScope
    ? await db
        .select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive })
        .from(users)
        .where(eq(users.departmentId, deptScope))
        .orderBy(desc(users.isActive), users.name)
    : await db
        .select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive })
        .from(users)
        .where(eq(users.id, me.id));

  // ---------- tasks completed in window, grouped by assignee ----------
  const completed = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      assigneeId: tasks.assigneeId,
      completedAt: tasks.completedAt,
      project: { slug: projects.slug, name: projects.name },
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(
      and(
        eq(tasks.status, "done"),
        gte(tasks.completedAt, dayStart),
        lte(tasks.completedAt, dayEnd),
      ),
    )
    .orderBy(desc(tasks.completedAt));

  // ---------- tasks created in window, grouped by creator ----------
  const created = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      createdById: tasks.createdById,
      createdAt: tasks.createdAt,
      project: { slug: projects.slug, name: projects.name },
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(gte(tasks.createdAt, dayStart), lte(tasks.createdAt, dayEnd)))
    .orderBy(desc(tasks.createdAt));

  // ---------- comments in window, grouped by author ----------
  const comments = await db
    .select({
      id: taskComments.id,
      body: taskComments.body,
      authorId: taskComments.authorId,
      createdAt: taskComments.createdAt,
      taskId: taskComments.taskId,
      taskTitle: tasks.title,
    })
    .from(taskComments)
    .leftJoin(tasks, eq(taskComments.taskId, tasks.id))
    .where(and(gte(taskComments.createdAt, dayStart), lte(taskComments.createdAt, dayEnd)))
    .orderBy(desc(taskComments.createdAt));

  // ---------- current open load per assignee ----------
  const openLoad = await db
    .select({
      assigneeId: tasks.assigneeId,
      n: sql<number>`count(*)::int`.as("n"),
    })
    .from(tasks)
    .where(and(sql`${tasks.assigneeId} is not null`, sql`${tasks.status} not in ('done','cancelled')`))
    .groupBy(tasks.assigneeId);

  const openMap = new Map<string, number>();
  for (const r of openLoad) if (r.assigneeId) openMap.set(r.assigneeId, r.n);

  // ---------- hero stat cards data ----------
  const [dueTodayRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.dueDate, date), sql`${tasks.status} not in ('done','cancelled')`));
  const dueToday = dueTodayRow?.n ?? 0;

  const [inProgressRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(sql`${tasks.status} = 'in_progress'`));
  const inProgress = inProgressRow?.n ?? 0;

  // Week completed (Mon-Sun window)
  const mondayStr = shiftDate(today, -(new Date(`${today}T12:00:00+05:30`).getDay() || 7) + 1);
  const weekStart = new Date(`${mondayStr}T00:00:00+05:30`);
  const [weekCompRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.status, "done"), sql`${tasks.completedAt} >= ${weekStart.toISOString()}`));
  const weekCompleted = weekCompRow?.n ?? 0;

  // Focus score: completed / (completed + overdue open) as percentage
  const [overdueRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(sql`${tasks.status} not in ('done','cancelled')`, sql`${tasks.dueDate} < ${date}`));
  const overdueTasks = overdueRow?.n ?? 0;
  const focusScore = weekCompleted + overdueTasks > 0
    ? Math.round((weekCompleted / (weekCompleted + overdueTasks)) * 100)
    : 100;

  // ---------- bucket per user ----------
  // (Bucket type is declared at module scope so PersonTile can consume it.)
  const buckets = new Map<string, Bucket>();
  for (const u of allUsers) {
    buckets.set(u.id, { user: u, completed: [], created: [], comments: [], openLoad: openMap.get(u.id) ?? 0 });
  }
  for (const t of completed) {
    if (t.assigneeId && buckets.has(t.assigneeId)) buckets.get(t.assigneeId)!.completed.push(t);
  }
  for (const t of created) {
    if (buckets.has(t.createdById)) buckets.get(t.createdById)!.created.push(t);
  }
  for (const c of comments) {
    if (buckets.has(c.authorId)) buckets.get(c.authorId)!.comments.push(c);
  }

  const tiles = [...buckets.values()];
  // Sort: people with activity first, then by activity volume desc, then by name
  tiles.sort((a, b) => {
    const av = a.completed.length + a.created.length + a.comments.length;
    const bv = b.completed.length + b.created.length + b.comments.length;
    if (av !== bv) return bv - av;
    return a.user.name.localeCompare(b.user.name);
  });

  const totals = {
    completed: completed.length,
    created: created.length,
    comments: comments.length,
    activePeople: tiles.filter((t) => t.completed.length + t.created.length + t.comments.length > 0).length,
  };

  // ---------- date nav helpers ----------
  const prevDate = shiftDate(date, -1);
  const nextDate = shiftDate(date, 1);
  const showNext = nextDate <= today;

  return (
    <div className="page-content">
      <div className="daily-hero">
        <div className="daily-hero-fade" />
        <div className="daily-hero-content">
          {/* top row */}
          <div className="daily-hero-top">
            <div className="daily-hero-left">
              <div className="daily-hero-kicker">
                <span className="daily-hero-dot" />
                Today's view
              </div>
              <div className="daily-hero-title">SeekPeek</div>
              <div className="daily-hero-tagline">Plan better. Prioritize smarter. Deliver more.</div>
              <div className="daily-hero-date">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
                {fmtHumanDate(date)}
              </div>
              <div className="daily-hero-inline-stats">
                <div className="daily-hero-istat">
                  <div className="daily-hero-istat-icon closed">
                    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>
                  </div>
                  <div>
                    <div className="daily-hero-istat-val">{totals.completed}</div>
                    <div className="daily-hero-istat-label">Closed today</div>
                  </div>
                </div>
                <div className="daily-hero-istat">
                  <div className="daily-hero-istat-icon active">
                    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a5.97 5.97 0 00-.75-2.91A3.97 3.97 0 0119 17v1h-3zM4.75 14.09A5.97 5.97 0 004 17v1H1v-1a3.97 3.97 0 013.75-3.91z"/></svg>
                  </div>
                  <div>
                    <div className="daily-hero-istat-val">{totals.activePeople}</div>
                    <div className="daily-hero-istat-label">Active</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="daily-hero-right">
              <div className="daily-hero-stat-card">
                <div className="daily-hero-stat-icon due">
                  <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><rect x="3" y="4" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M7 2v3M13 2v3M3 8h14" fill="none" stroke="currentColor" strokeWidth="1.5"/><circle cx="10" cy="13" r="1.2" fill="currentColor"/></svg>
                </div>
                <div className="daily-hero-stat-info">
                  <span className="daily-hero-stat-label">Tasks due today</span>
                  <span className="daily-hero-stat-val">{dueToday}</span>
                  <span className={`daily-hero-stat-sub ${dueToday > 3 ? "warn" : ""}`}>
                    {dueToday > 3 ? "High priority" : "On track"}
                  </span>
                </div>
              </div>
              <div className="daily-hero-stat-card">
                <div className="daily-hero-stat-icon progress">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><path d="M5 3v4M3 5h4M12 4v6M9 7h6M19 14v6M16 17h6M14 11l-5 8"/></svg>
                </div>
                <div className="daily-hero-stat-info">
                  <span className="daily-hero-stat-label">In progress</span>
                  <span className="daily-hero-stat-val">{inProgress}</span>
                  <span className="daily-hero-stat-sub info">Across projects</span>
                </div>
              </div>
              <div className="daily-hero-stat-card">
                <div className="daily-hero-stat-icon completed">
                  <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                </div>
                <div className="daily-hero-stat-info">
                  <span className="daily-hero-stat-label">Completed this week</span>
                  <span className="daily-hero-stat-val">{weekCompleted}</span>
                  <span className="daily-hero-stat-sub">Keep it up!</span>
                </div>
              </div>
              <div className="daily-hero-stat-card">
                <div className="daily-hero-stat-icon focus">
                  <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/></svg>
                </div>
                <div className="daily-hero-stat-info">
                  <span className="daily-hero-stat-label">Focus score</span>
                  <span className="daily-hero-stat-val">{focusScore}%</span>
                  <span className={`daily-hero-stat-sub ${focusScore < 70 ? "warn" : ""}`}>
                    {focusScore >= 85 ? "On track" : focusScore >= 70 ? "Good" : "Needs attention"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <ReviewCard />
      </Suspense>

      <Suspense fallback={null}>
        <BriefingCard />
      </Suspense>

      <Suspense fallback={<div className="myday" style={{ minHeight: 200 }} />}>
        <MyDayHero />
      </Suspense>

      <Suspense fallback={null}>
        <TeamVelocity />
      </Suspense>

      <div className="page-head team-head">
        <div>
          <div className="page-title">Team today</div>
          <div className="page-sub">
            {fmtHumanDate(date)}
            {isToday ? "" : <span className="text-text-3"> · viewing the past</span>}
            {" · "}
            {totals.completed} completed · {totals.created} new · {totals.comments} comments · {totals.activePeople} active
          </div>
        </div>

        {/* date nav */}
        <div className="flex items-center gap-1">
          <Link href={`/?date=${prevDate}`} className="btn btn-ghost btn-sm" title="Previous day">
            ← {prevDate.slice(5)}
          </Link>
          {!isToday ? (
            <Link href="/" className="btn btn-ghost btn-sm">
              Today
            </Link>
          ) : null}
          {showNext ? (
            <Link href={`/?date=${nextDate}`} className="btn btn-ghost btn-sm" title="Next day">
              {nextDate.slice(5)} →
            </Link>
          ) : (
            <span className="btn btn-ghost btn-sm opacity-30 cursor-not-allowed">→</span>
          )}
        </div>
      </div>

      {tiles.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-text-2 mb-2">No members yet.</div>
          <Link href="/members" className="text-accent-2 hover:underline text-[13px]">
            Add the first member →
          </Link>
        </div>
      ) : totals.activePeople === 0 ? (
        <div className="card text-center py-12">
          <div className="text-text-2 mb-1">
            No activity logged on {fmtHumanDate(date).split(",")[0]}.
          </div>
          <div className="text-text-3 text-[12px]">
            {isToday
              ? "Quiet day so far — once tasks get completed, created, or commented, they'll show up here."
              : "Nothing happened in the system on that date."}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tiles.map((t) => (
            <PersonTile key={t.user.id} bucket={t} />
          ))}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// PersonTile
// -----------------------------------------------------------------------------
type UserBrief = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "member" | "viewer" | "agent";
  isActive: boolean;
};
type CompletedRow = {
  id: string;
  title: string;
  status: string;
  assigneeId: string | null;
  completedAt: Date | null;
  project: { slug: string; name: string };
};
type CreatedRow = {
  id: string;
  title: string;
  createdById: string;
  createdAt: Date;
  project: { slug: string; name: string };
};
type CommentRow = {
  id: string;
  body: string;
  authorId: string;
  createdAt: Date;
  taskId: string;
  taskTitle: string | null;
};
type Bucket = {
  user: UserBrief;
  completed: CompletedRow[];
  created: CreatedRow[];
  comments: CommentRow[];
  openLoad: number;
};

function PersonTile({ bucket }: { bucket: Bucket }) {
  const { user, completed, created, comments, openLoad } = bucket;
  const isQuiet = completed.length === 0 && created.length === 0 && comments.length === 0;

  return (
    <div className={`card ${isQuiet ? "opacity-60" : ""}`} style={{ padding: "16px 16px 14px" }}>
      {/* header */}
      <div className="flex items-center gap-3 mb-3">
        <span className={`tava ${avaClass(user.name)}`} style={{ width: 32, height: 32, fontSize: 12 }}>
          {avaInitials(user.name)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">
            {user.name}
            {!user.isActive ? <span className="text-text-3 text-[11px] ml-2">inactive</span> : null}
          </div>
          <div className="mono text-[11px] text-text-3 truncate">{user.email}</div>
        </div>
        <span
          className="text-[11px] mono"
          style={{
            color: openLoad > 5 ? "var(--warning)" : "var(--text-3)",
          }}
          title="Currently open tasks assigned to this person"
        >
          {openLoad} open
        </span>
      </div>

      {isQuiet ? (
        <div className="text-text-3 italic text-[12px] py-2">No activity.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {completed.length > 0 ? (
            <Section
              tone="var(--success)"
              label="Completed"
              count={completed.length}
              items={completed.map((t) => ({
                href: `/tasks/${t.id}`,
                title: t.title,
                meta: t.completedAt ? fmtTime(t.completedAt) : "",
                projectSlug: t.project.slug,
                projectName: t.project.name,
              }))}
            />
          ) : null}
          {created.length > 0 ? (
            <Section
              tone="var(--accent-2)"
              label="Created"
              count={created.length}
              items={created.map((t) => ({
                href: `/tasks/${t.id}`,
                title: t.title,
                meta: fmtTime(t.createdAt),
                projectSlug: t.project.slug,
                projectName: t.project.name,
              }))}
            />
          ) : null}
          {comments.length > 0 ? (
            <Section
              tone="var(--info)"
              label="Commented"
              count={comments.length}
              items={comments.slice(0, 3).map((c) => ({
                href: `/tasks/${c.taskId}`,
                title: c.taskTitle ?? "(deleted task)",
                meta: fmtTime(c.createdAt),
                preview: c.body.slice(0, 90) + (c.body.length > 90 ? "…" : ""),
              }))}
              more={comments.length > 3 ? comments.length - 3 : 0}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function Section({
  tone,
  label,
  count,
  items,
  more = 0,
}: {
  tone: string;
  label: string;
  count: number;
  items: Array<{
    href: string;
    title: string;
    meta?: string;
    preview?: string;
    projectSlug?: string;
    projectName?: string;
  }>;
  more?: number;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="inline-block rounded-full"
          style={{ width: 6, height: 6, background: tone }}
        />
        <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: tone }}>
          {label}
        </span>
        <span className="text-[11px] text-text-3 mono">{count}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.map((it, i) => (
          <li key={i}>
            <Link href={it.href} className="block group">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="flex-1 truncate text-text-2 group-hover:text-text">
                  {it.title}
                </span>
                {it.meta ? (
                  <span className="text-[11px] mono text-text-4 shrink-0">{it.meta}</span>
                ) : null}
              </div>
              {it.preview ? (
                <div className="text-[11.5px] text-text-3 leading-snug pl-2 mt-0.5 italic truncate">
                  {it.preview}
                </div>
              ) : null}
              {it.projectSlug ? (
                <div className="mt-0.5 pl-2">
                  <span className={`pchip ${it.projectSlug}`}>{it.projectName}</span>
                </div>
              ) : null}
            </Link>
          </li>
        ))}
        {more > 0 ? (
          <li className="text-[11px] text-text-3 italic pl-2">+{more} more</li>
        ) : null}
      </ul>
    </div>
  );
}

