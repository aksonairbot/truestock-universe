// apps/web/app/team/month/page.tsx
//
// Team Monthly Dashboard — summary cards per member showing completed, created,
// comments, and overdue counts for the selected month. Manager-only (privileged).

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getDb,
  users,
  tasks,
  taskComments,
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
  title: "Team Month · SeekPeek",
  description: "Monthly team activity summary",
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

function getMonthStart(ym: string): Date {
  const [y, m] = ym.split("-").map(Number);
  return new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00+05:30`);
}

function getMonthEnd(ym: string): Date {
  const [y, m] = ym.split("-").map(Number);
  const next = new Date(`${y}-${String(m! + 1).padStart(2, "0")}-01T00:00:00+05:30`);
  next.setTime(next.getTime() - 1);
  return next;
}

function fmtMonthYear(ym: string): string {
  const d = new Date(`${ym}-01T12:00:00+05:30`);
  return d.toLocaleDateString("en-IN", {
    timeZone: TZ,
    month: "long",
    year: "numeric",
  });
}

function shiftMonth(ym: string, offset: number): string {
  const [y, m] = ym.split("-").map(Number);
  let ny = y!;
  let nm = m! + offset;
  while (nm > 12) { nm -= 12; ny += 1; }
  while (nm < 1) { nm += 12; ny -= 1; }
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/* ── page ── */

interface PageProps {
  searchParams: Promise<{ month?: string }>;
}

export default async function TeamMonthPage({ searchParams }: PageProps) {
  const me = await getCurrentUser();
  if (!isPrivileged(me)) redirect("/");

  const sp = await searchParams;
  const today = todayIST();
  const currentMonth = today.slice(0, 7);
  const month = sp.month ?? currentMonth;

  const mStart = getMonthStart(month);
  const mEnd = getMonthEnd(month);

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
            <h1 className="page-title">Team Month</h1>
            <p className="page-sub">No active team members found.</p>
          </div>
        </div>
      </div>
    );
  }

  // Completed this month
  const completedRows = await db
    .select({ assigneeId: tasks.assigneeId, n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(
        eq(tasks.status, "done"),
        gte(tasks.completedAt, mStart),
        lte(tasks.completedAt, mEnd),
        inArray(tasks.assigneeId, userIds),
      ),
    )
    .groupBy(tasks.assigneeId);

  // Created this month
  const createdRows = await db
    .select({ createdById: tasks.createdById, n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(
        gte(tasks.createdAt, mStart),
        lte(tasks.createdAt, mEnd),
        inArray(tasks.createdById, userIds),
      ),
    )
    .groupBy(tasks.createdById);

  // Comments this month
  const commentRows = await db
    .select({ authorId: taskComments.authorId, n: sql<number>`count(*)::int` })
    .from(taskComments)
    .where(
      and(
        gte(taskComments.createdAt, mStart),
        lte(taskComments.createdAt, mEnd),
        inArray(taskComments.authorId, userIds),
      ),
    )
    .groupBy(taskComments.authorId);

  // Overdue right now
  const overdueRows = await db
    .select({ assigneeId: tasks.assigneeId, n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(
        sql`${tasks.status} NOT IN ('done','cancelled')`,
        sql`${tasks.dueDate}::date < ${today}::date`,
        inArray(tasks.assigneeId, userIds),
      ),
    )
    .groupBy(tasks.assigneeId);

  // Build maps
  const completedMap = new Map(completedRows.map((r) => [r.assigneeId, r.n]));
  const createdMap = new Map(createdRows.map((r) => [r.createdById, r.n]));
  const commentMap = new Map(commentRows.map((r) => [r.authorId, r.n]));
  const overdueMap = new Map(overdueRows.map((r) => [r.assigneeId, r.n]));

  const cards = teamUsers.map((u) => ({
    user: u,
    completed: completedMap.get(u.id) ?? 0,
    created: createdMap.get(u.id) ?? 0,
    comments: commentMap.get(u.id) ?? 0,
    overdue: overdueMap.get(u.id) ?? 0,
    total: (completedMap.get(u.id) ?? 0) + (createdMap.get(u.id) ?? 0) + (commentMap.get(u.id) ?? 0),
  }));

  // Sort: overdue desc, then total activity desc
  cards.sort((a, b) => b.overdue - a.overdue || b.total - a.total);

  const totals = {
    completed: cards.reduce((s, c) => s + c.completed, 0),
    created: cards.reduce((s, c) => s + c.created, 0),
    comments: cards.reduce((s, c) => s + c.comments, 0),
    overdue: cards.reduce((s, c) => s + c.overdue, 0),
  };

  const prevMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);
  const showNext = nextMonth <= currentMonth;

  return (
    <div className="page-content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Team Month</h1>
          <div className="page-sub">
            {fmtMonthYear(month)}
            {" · "}
            {totals.completed} done · {totals.created} new · {totals.comments} comments · {totals.overdue} overdue
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Link href={`/team/month?month=${prevMonth}`} className="btn btn-ghost btn-sm">
            ← {prevMonth.slice(5)}
          </Link>
          {month !== currentMonth ? (
            <Link href="/team/month" className="btn btn-ghost btn-sm">
              This month
            </Link>
          ) : null}
          {showNext ? (
            <Link href={`/team/month?month=${nextMonth}`} className="btn btn-ghost btn-sm">
              {nextMonth.slice(5)} →
            </Link>
          ) : (
            <span className="btn btn-ghost btn-sm opacity-30 cursor-not-allowed">→</span>
          )}
        </div>
      </div>

      {/* summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <SummaryCard label="Completed" value={totals.completed} color="var(--success)" />
        <SummaryCard label="Created" value={totals.created} color="var(--accent-2)" />
        <SummaryCard label="Comments" value={totals.comments} color="var(--info)" />
        <SummaryCard label="Overdue" value={totals.overdue} color="var(--danger)" />
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
    created: number;
    comments: number;
    overdue: number;
    total: number;
  };
}) {
  const { user, completed, created, comments, overdue } = card;
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
            style={{ background: "linear-gradient(135deg,#7B5CFF,#22D3EE)", color: "#0B0D12" }}
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
        <StatCell label="Created" value={created} color="var(--accent-2)" />
        <StatCell label="Comments" value={comments} color="var(--info)" />
        <StatCell label="Overdue" value={overdue} color="var(--danger)" />
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
