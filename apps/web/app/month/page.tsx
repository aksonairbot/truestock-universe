// apps/web/app/month/page.tsx
//
// Monthly rollup — aggregated task completion, creation, and activity
// across the full month. Shows per-person stats and trends.

import Link from "next/link";
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

export const dynamic = "force-dynamic";

const TZ = "Asia/Kolkata";

function todayInTZ(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function getMonthStart(dateStr: string): Date {
  const parts = dateStr.split("-").map(Number);
  const year = parts[0]!;
  const month = parts[1]!;
  return new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00+05:30`);
}

function getMonthEnd(dateStr: string): Date {
  const parts = dateStr.split("-").map(Number);
  const year = parts[0]!;
  const month = parts[1]!;
  const next = new Date(`${year}-${String(month + 1).padStart(2, "0")}-01T00:00:00+05:30`);
  next.setTime(next.getTime() - 1);
  return next;
}

function fmtMonthYear(dateStr: string): string {
  const d = new Date(`${dateStr}-01T12:00:00+05:30`);
  return d.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

function shiftMonth(dateStr: string, months: number): string {
  const parts = dateStr.split("-").map(Number);
  let y = parts[0]!;
  let m = parts[1]! + months;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

interface PageProps {
  searchParams: Promise<{ month?: string }>;
}

export const metadata = {
  title: "Month · Skynet",
  description: "Monthly activity rollup",
};

export default async function MonthPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const today = todayInTZ();
  const currentMonth = today.slice(0, 7); // YYYY-MM
  const month = sp.month ?? currentMonth;

  const monthStart = getMonthStart(month);
  const monthEnd = getMonthEnd(month);

  const db = getDb();

  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      isActive: users.isActive,
    })
    .from(users)
    .orderBy(desc(users.isActive), users.name);

  // Tasks completed in the month
  const completed = await db
    .select({
      assigneeId: tasks.assigneeId,
      n: sql<number>`count(*)::int`.as("count"),
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.status, "done"),
        gte(tasks.completedAt, monthStart),
        lte(tasks.completedAt, monthEnd),
      ),
    )
    .groupBy(tasks.assigneeId);

  // Tasks created in the month
  const created = await db
    .select({
      createdById: tasks.createdById,
      n: sql<number>`count(*)::int`.as("count"),
    })
    .from(tasks)
    .where(
      and(
        gte(tasks.createdAt, monthStart),
        lte(tasks.createdAt, monthEnd),
      ),
    )
    .groupBy(tasks.createdById);

  // Comments in the month
  const comments = await db
    .select({
      authorId: taskComments.authorId,
      n: sql<number>`count(*)::int`.as("count"),
    })
    .from(taskComments)
    .where(
      and(
        gte(taskComments.createdAt, monthStart),
        lte(taskComments.createdAt, monthEnd),
      ),
    )
    .groupBy(taskComments.authorId);

  // Build maps
  const completedMap = new Map<string, number>();
  const createdMap = new Map<string, number>();
  const commentsMap = new Map<string, number>();

  for (const r of completed) if (r.assigneeId) completedMap.set(r.assigneeId, r.n);
  for (const r of created) createdMap.set(r.createdById, r.n);
  for (const r of comments) commentsMap.set(r.authorId, r.n);

  // Build stats per user
  const stats = allUsers.map((u) => ({
    user: u,
    completed: completedMap.get(u.id) ?? 0,
    created: createdMap.get(u.id) ?? 0,
    comments: commentsMap.get(u.id) ?? 0,
    total: (completedMap.get(u.id) ?? 0) + (createdMap.get(u.id) ?? 0) + (commentsMap.get(u.id) ?? 0),
  }));

  // Sort by activity
  stats.sort((a, b) => b.total - a.total);

  const totals = {
    completed: Array.from(completedMap.values()).reduce((a, b) => a + b, 0),
    created: Array.from(createdMap.values()).reduce((a, b) => a + b, 0),
    comments: Array.from(commentsMap.values()).reduce((a, b) => a + b, 0),
    activePeople: stats.filter((s) => s.total > 0).length,
  };

  const prevMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);
  const showNext = nextMonth <= currentMonth;

  return (
    <div className="page-content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Month</h1>
          <div className="page-sub">
            {fmtMonthYear(month)}
            {" · "}
            {totals.completed} completed · {totals.created} new · {totals.comments} comments · {totals.activePeople} active
          </div>
        </div>

        {/* month nav */}
        <div className="flex items-center gap-1">
          <Link href={`/month?month=${prevMonth}`} className="btn btn-ghost btn-sm" title="Previous month">
            ← {prevMonth.slice(5)}
          </Link>
          {month !== currentMonth ? (
            <Link href="/month" className="btn btn-ghost btn-sm">
              This month
            </Link>
          ) : null}
          {showNext ? (
            <Link href={`/month?month=${nextMonth}`} className="btn btn-ghost btn-sm" title="Next month">
              {nextMonth.slice(5)} →
            </Link>
          ) : (
            <span className="btn btn-ghost btn-sm opacity-30 cursor-not-allowed">→</span>
          )}
        </div>
      </div>

      {/* stats table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-text-2">
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-right px-4 py-3 font-medium">Completed</th>
                <th className="text-right px-4 py-3 font-medium">Created</th>
                <th className="text-right px-4 py-3 font-medium">Comments</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {stats.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-text-2">
                    No members yet.
                  </td>
                </tr>
              ) : (
                stats.map((s) => (
                  <tr key={s.user.id} className="border-b border-border hover:bg-hover transition">
                    <td className="px-4 py-3 text-text">{s.user.name}</td>
                    <td className="text-right px-4 py-3 text-text-2">
                      {s.completed > 0 && <span className="text-success font-medium">{s.completed}</span>}
                    </td>
                    <td className="text-right px-4 py-3 text-text-2">
                      {s.created > 0 && <span className="text-accent-2 font-medium">{s.created}</span>}
                    </td>
                    <td className="text-right px-4 py-3 text-text-2">
                      {s.comments > 0 && <span className="text-info font-medium">{s.comments}</span>}
                    </td>
                    <td className="text-right px-4 py-3 font-semibold text-text">
                      {s.total > 0 ? s.total : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
