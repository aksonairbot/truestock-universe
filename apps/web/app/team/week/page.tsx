// apps/web/app/team/week/page.tsx
//
// Team Weekly Dashboard — summary cards per member showing done, in-progress,
// and overdue counts for the selected week. Manager-only (privileged).

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getDb,
  users,
  tasks,
  eq,
  and,
  gte,
  lte,
  sql,
  inArray,
} from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { isPrivileged, getDepartmentScope } from "@/lib/access";

export const dynamic = "force-dynamic";

const TZ = "Asia/Kolkata";

export const metadata = {
  title: "Team Week · SeekPeek",
  description: "Weekly team activity summary",
};

/* ── date helpers ── */

function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** ISO week number for a date string (YYYY-MM-DD) → "YYYY-Www" */
function isoWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00+05:30`);
  const day = d.getDay() || 7; // Mon=1 … Sun=7
  d.setDate(d.getDate() + 4 - day); // nearest Thursday
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/** Parse "YYYY-Www" → Monday 00:00 IST */
function weekStart(wk: string): Date {
  const [yearStr, wStr] = wk.split("-W");
  const year = Number(yearStr);
  const week = Number(wStr);
  // Jan 4 always falls in week 1
  const jan4 = new Date(`${year}-01-04T00:00:00+05:30`);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
  return new Date(`${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}T00:00:00+05:30`);
}

/** Sunday 23:59:59 of the week */
function weekEnd(wk: string): Date {
  const mon = weekStart(wk);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return sun;
}

function shiftWeek(wk: string, offset: number): string {
  const mon = weekStart(wk);
  mon.setDate(mon.getDate() + offset * 7);
  const shifted = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
  return isoWeekKey(shifted);
}

function fmtDateShort(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
  });
}

/* ── page ── */

interface PageProps {
  searchParams: Promise<{ week?: string }>;
}

export default async function TeamWeekPage({ searchParams }: PageProps) {
  const me = await getCurrentUser();
  if (!isPrivileged(me)) redirect("/");

  const sp = await searchParams;
  const today = todayIST();
  const currentWeek = isoWeekKey(today);
  const week = sp.week && /^\d{4}-W\d{2}$/.test(sp.week) ? sp.week : currentWeek;

  const wStart = weekStart(week);
  const wEnd = weekEnd(week);
  const todayDate = new Date(`${today}T00:00:00+05:30`);

  const db = getDb();
  const deptScope = getDepartmentScope(me);

  // Fetch team members
  const teamUsers = deptScope
    ? await db
        .select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl })
        .from(users)
        .where(and(eq(users.departmentId, deptScope), eq(users.isActive, true)))
        .orderBy(users.name)
    : await db
        .select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl })
        .from(users)
        .where(eq(users.isActive, true))
        .orderBy(users.name);

  const userIds = teamUsers.map((u) => u.id);
  if (userIds.length === 0) {
    return (
      <div className="page-content">
        <div className="page-head">
          <div>
            <h1 className="page-title">Team Week</h1>
            <p className="page-sub">No active team members found.</p>
          </div>
        </div>
      </div>
    );
  }

  // All 4 stat queries run in parallel — no dependencies between them.
  const [completedRows, inProgressRows, overdueRows, openRows] = await Promise.all([
    // Completed this week
    db
      .select({
        assigneeId: tasks.assigneeId,
        n: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.status, "done"),
          gte(tasks.completedAt, wStart),
          lte(tasks.completedAt, wEnd),
          inArray(tasks.assigneeId, userIds),
        ),
      )
      .groupBy(tasks.assigneeId),
    // In progress right now
    db
      .select({
        assigneeId: tasks.assigneeId,
        n: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.status, "in_progress"),
          inArray(tasks.assigneeId, userIds),
        ),
      )
      .groupBy(tasks.assigneeId),
    // Overdue (not done/cancelled, dueDate < today)
    db
      .select({
        assigneeId: tasks.assigneeId,
        n: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .where(
        and(
          sql`${tasks.status} NOT IN ('done'::task_status,'cancelled'::task_status)`,
          sql`${tasks.dueDate}::date < ${today}::date`,
          inArray(tasks.assigneeId, userIds),
        ),
      )
      .groupBy(tasks.assigneeId),
    // Open (backlog + todo + in_progress + review)
    db
      .select({
        assigneeId: tasks.assigneeId,
        n: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .where(
        and(
          sql`${tasks.status} = ANY(ARRAY['backlog','todo','in_progress','review']::task_status[])`,
          inArray(tasks.assigneeId, userIds),
        ),
      )
      .groupBy(tasks.assigneeId),
  ]);

  // Build maps
  const completedMap = new Map(completedRows.map((r) => [r.assigneeId, r.n]));
  const inProgressMap = new Map(inProgressRows.map((r) => [r.assigneeId, r.n]));
  const overdueMap = new Map(overdueRows.map((r) => [r.assigneeId, r.n]));
  const openMap = new Map(openRows.map((r) => [r.assigneeId, r.n]));

  const cards = teamUsers.map((u) => ({
    user: u,
    completed: completedMap.get(u.id) ?? 0,
    inProgress: inProgressMap.get(u.id) ?? 0,
    overdue: overdueMap.get(u.id) ?? 0,
    open: openMap.get(u.id) ?? 0,
  }));

  // Sort: overdue desc, then completed desc
  cards.sort((a, b) => b.overdue - a.overdue || b.completed - a.completed);

  const totals = {
    completed: cards.reduce((s, c) => s + c.completed, 0),
    inProgress: cards.reduce((s, c) => s + c.inProgress, 0),
    overdue: cards.reduce((s, c) => s + c.overdue, 0),
    open: cards.reduce((s, c) => s + c.open, 0),
  };

  const prevWeek = shiftWeek(week, -1);
  const nextWeek = shiftWeek(week, 1);
  const showNext = nextWeek <= currentWeek;

  const rangeLabel = `${fmtDateShort(wStart)} – ${fmtDateShort(wEnd)}`;

  return (
    <div className="page-content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Team Week</h1>
          <div className="page-sub">
            {rangeLabel} · {week}
            {" · "}
            {totals.completed} done · {totals.inProgress} active · {totals.overdue} overdue
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Link href={`/team/week?week=${prevWeek}`} className="btn btn-ghost btn-sm">
            ← Prev
          </Link>
          {week !== currentWeek ? (
            <Link href="/team/week" className="btn btn-ghost btn-sm">
              This week
            </Link>
          ) : null}
          {showNext ? (
            <Link href={`/team/week?week=${nextWeek}`} className="btn btn-ghost btn-sm">
              Next →
            </Link>
          ) : (
            <span className="btn btn-ghost btn-sm opacity-30 cursor-not-allowed">→</span>
          )}
        </div>
      </div>

      {/* summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <SummaryCard label="Completed" value={totals.completed} color="var(--success)" />
        <SummaryCard label="In Progress" value={totals.inProgress} color="var(--accent-2)" />
        <SummaryCard label="Overdue" value={totals.overdue} color="var(--danger)" />
        <SummaryCard label="Open" value={totals.open} color="var(--text-2)" />
      </div>

      {/* member cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <MemberCard key={c.user.id} card={c} />
        ))}
      </div>
    </div>
  );
}

/* ── components ── */

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="card flex flex-col items-center py-4">
      <span className="text-[22px] font-bold" style={{ color }}>{value}</span>
      <span className="text-[11px] text-text-3 uppercase tracking-wider mt-0.5">{label}</span>
    </div>
  );
}

function MemberCard({
  card,
}: {
  card: {
    user: { id: string; name: string; email: string; avatarUrl: string | null };
    completed: number;
    inProgress: number;
    overdue: number;
    open: number;
  };
}) {
  const { user, completed, inProgress, overdue, open } = card;
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="card">
      <div className="flex items-center gap-2.5 mb-3">
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt={user.name} className="w-8 h-8 rounded-full" />
        ) : (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold"
            style={{ background: "linear-gradient(135deg,#7B5CFF,#22D3EE)", color: "var(--avatar-contrast)" }}
          >
            {initials}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-text truncate">{user.name}</div>
          <div className="text-[11px] text-text-3 truncate">{user.email}</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <StatCell label="Done" value={completed} color="var(--success)" />
        <StatCell label="Active" value={inProgress} color="var(--accent-2)" />
        <StatCell label="Overdue" value={overdue} color="var(--danger)" />
        <StatCell label="Open" value={open} color="var(--text-2)" />
      </div>

      {overdue > 0 && (
        <Link
          href={`/tasks?group=assignee&q=${encodeURIComponent(user.name)}`}
          className="block mt-3 text-[11px] text-danger hover:underline"
        >
          View overdue tasks →
        </Link>
      )}
    </div>
  );
}

function StatCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="text-[16px] font-semibold" style={{ color: value > 0 ? color : "var(--text-4)" }}>
        {value}
      </div>
      <div className="text-[10px] text-text-3 uppercase tracking-wider">{label}</div>
    </div>
  );
}
