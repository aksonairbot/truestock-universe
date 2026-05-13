// apps/web/app/members/page.tsx
//
// Manager view of the team. Each row is one person with their current
// workload + recent throughput so a manager can scan "who's drowning,
// who's idle, who shipped last week" without opening individual tasks.
//
// Columns:
//   • Open        — currently assigned tasks not in done/cancelled
//   • Overdue     — open tasks with due_date < today
//   • Done 7d     — tasks completed in the trailing 7 days (completedAt)
//   • Comments 7d — comments authored in the trailing 7 days
//   • Busy        — weighted score over open tasks:
//                     urgent=4, high=3, med=2, low=1; doubled if overdue.
//                   Captures "stressed/over-loaded" instead of raw counts.
//
// Sortable via ?sort=<col>&dir=<asc|desc>. Default: busy desc.
// Click a row → /members/[id] for the per-person drill-down.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb, users, tasks, taskComments, departments, eq, and, desc, asc, sql } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { isPrivileged } from "@/lib/access";
import { createMember, createDepartment } from "./actions";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin", manager: "Manager", member: "Member", viewer: "Viewer", agent: "Agent",
};
const ROLE_TONE: Record<string, string> = {
  admin: "var(--danger)", manager: "var(--warning)", member: "var(--accent-2)", viewer: "var(--text-3)", agent: "var(--info)",
};

const SORTABLE = ["name", "role", "open", "overdue", "done1d", "done7d", "done30d", "comments7d", "busy"] as const;
type SortKey = (typeof SORTABLE)[number];

function avaClass(name?: string | null): string {
  if (!name) return "h1";
  const sum = [...name].reduce((s, c) => s + c.charCodeAt(0), 0);
  return ["h1", "h2", "h3", "h4"][sum % 4]!;
}
function avaInitials(name?: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

interface PageProps {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}

export default async function MembersPage({ searchParams }: PageProps) {
  const me = await getCurrentUser();
  if (!isPrivileged(me)) redirect("/");

  const sp = await searchParams;
  const sort: SortKey = (SORTABLE as readonly string[]).includes(sp.sort ?? "")
    ? (sp.sort as SortKey)
    : "busy";
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";

  const db = getDb();

  // 7-day window anchored to start-of-today IST.
  const now = new Date();
  const todayStartIST = new Date(now);
  todayStartIST.setUTCHours(-5, -30, 0, 0); // 00:00 IST in UTC
  // If we've crossed midnight UTC past IST midnight, the above already lands on today's IST date.
  // Re-anchor: take IST date string from `now` and parse 00:00 IST as UTC explicitly.
  const istDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const startToday = new Date(`${istDay}T00:00:00+05:30`);
  const start7d = new Date(startToday);
  start7d.setDate(start7d.getDate() - 6); // inclusive of today → trailing 7 days
  const start30d = new Date(startToday);
  start30d.setDate(start30d.getDate() - 29);

  const deptRows = await db.select().from(departments).orderBy(departments.name);
  const deptMap = new Map(deptRows.map((d) => [d.id, d]));
  const managerMap = new Map<string, string>(); // userId → manager name

  const memberRows = await db.select().from(users).orderBy(desc(users.isActive), users.name);

  // Build manager name map
  for (const u of memberRows) {
    if (u.managerId) {
      const mgr = memberRows.find((m) => m.id === u.managerId);
      if (mgr) managerMap.set(u.id, mgr.name);
    }
  }

  // ---------------- open + overdue + busy per assignee ----------------
  // Busy formula in SQL keeps it server-side & cheap.
  const workloadRows = await db.execute(sql<{
    assignee_id: string;
    open: number;
    overdue: number;
    busy: number;
  }>`
    select
      assignee_id,
      count(*)::int as open,
      count(*) filter (where due_date < (now() at time zone 'Asia/Kolkata')::date)::int as overdue,
      sum(
        (case priority
           when 'urgent' then 4
           when 'high'   then 3
           when 'med'    then 2
           else 1
         end)
        * (case when due_date < (now() at time zone 'Asia/Kolkata')::date then 2 else 1 end)
      )::int as busy
    from tasks
    where assignee_id is not null
      and status not in ('done', 'cancelled')
    group by assignee_id
  `);

  const done7dRows = await db
    .select({
      assigneeId: tasks.assigneeId,
      n: sql<number>`count(*)::int`.as("n"),
    })
    .from(tasks)
    .where(
      and(
        sql`${tasks.assigneeId} is not null`,
        eq(tasks.status, "done"),
        sql`${tasks.completedAt} >= ${start7d.toISOString()}`,
      ),
    )
    .groupBy(tasks.assigneeId);

  const done1dRows = await db
    .select({
      assigneeId: tasks.assigneeId,
      n: sql<number>`count(*)::int`.as("n"),
    })
    .from(tasks)
    .where(
      and(
        sql`${tasks.assigneeId} is not null`,
        eq(tasks.status, "done"),
        sql`${tasks.completedAt} >= ${startToday.toISOString()}`,
      ),
    )
    .groupBy(tasks.assigneeId);

  const done30dRows = await db
    .select({
      assigneeId: tasks.assigneeId,
      n: sql<number>`count(*)::int`.as("n"),
    })
    .from(tasks)
    .where(
      and(
        sql`${tasks.assigneeId} is not null`,
        eq(tasks.status, "done"),
        sql`${tasks.completedAt} >= ${start30d.toISOString()}`,
      ),
    )
    .groupBy(tasks.assigneeId);

  const comments7dRows = await db
    .select({
      authorId: taskComments.authorId,
      n: sql<number>`count(*)::int`.as("n"),
    })
    .from(taskComments)
    .where(sql`${taskComments.createdAt} >= ${start7d.toISOString()}`)
    .groupBy(taskComments.authorId);

  const openMap = new Map<string, number>();
  const overdueMap = new Map<string, number>();
  const busyMap = new Map<string, number>();
  // workloadRows comes back as an array of records — drizzle's execute returns the postgres-js Result.
  for (const r of (workloadRows as unknown as Array<{ assignee_id: string; open: number; overdue: number; busy: number }>)) {
    if (!r.assignee_id) continue;
    openMap.set(r.assignee_id, Number(r.open) || 0);
    overdueMap.set(r.assignee_id, Number(r.overdue) || 0);
    busyMap.set(r.assignee_id, Number(r.busy) || 0);
  }
  const done7dMap = new Map<string, number>();
  for (const r of done7dRows) if (r.assigneeId) done7dMap.set(r.assigneeId, r.n);
  const done1dMap = new Map<string, number>();
  for (const r of done1dRows) if (r.assigneeId) done1dMap.set(r.assigneeId, r.n);
  const done30dMap = new Map<string, number>();
  for (const r of done30dRows) if (r.assigneeId) done30dMap.set(r.assigneeId, r.n);
  const comments7dMap = new Map<string, number>();
  for (const r of comments7dRows) if (r.authorId) comments7dMap.set(r.authorId, r.n);

  type Augmented = (typeof memberRows)[number] & {
    open: number;
    overdue: number;
    done1d: number;
    done7d: number;
    done30d: number;
    comments7d: number;
    busy: number;
  };
  const augmented: Augmented[] = memberRows.map((u) => ({
    ...u,
    open: openMap.get(u.id) ?? 0,
    overdue: overdueMap.get(u.id) ?? 0,
    done1d: done1dMap.get(u.id) ?? 0,
    done7d: done7dMap.get(u.id) ?? 0,
    done30d: done30dMap.get(u.id) ?? 0,
    comments7d: comments7dMap.get(u.id) ?? 0,
    busy: busyMap.get(u.id) ?? 0,
  }));

  // sort
  const cmp = (a: Augmented, b: Augmented) => {
    let av: number | string;
    let bv: number | string;
    switch (sort) {
      case "name": av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
      case "role": av = a.role; bv = b.role; break;
      case "open": av = a.open; bv = b.open; break;
      case "overdue": av = a.overdue; bv = b.overdue; break;
      case "done1d": av = a.done1d; bv = b.done1d; break;
      case "done7d": av = a.done7d; bv = b.done7d; break;
      case "done30d": av = a.done30d; bv = b.done30d; break;
      case "comments7d": av = a.comments7d; bv = b.comments7d; break;
      default: av = a.busy; bv = b.busy;
    }
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return a.name.localeCompare(b.name);
  };
  augmented.sort(cmp);

  const total = memberRows.length;
  const active = memberRows.filter((u) => u.isActive).length;
  const totalOpen = augmented.reduce((s, u) => s + u.open, 0);
  const totalOverdue = augmented.reduce((s, u) => s + u.overdue, 0);
  const totalDone1d = augmented.reduce((s, u) => s + u.done1d, 0);
  const totalDone7d = augmented.reduce((s, u) => s + u.done7d, 0);
  const totalDone30d = augmented.reduce((s, u) => s + u.done30d, 0);

  const sortHref = (col: SortKey): string => {
    let nextDir: "asc" | "desc";
    if (col === sort) nextDir = dir === "desc" ? "asc" : "desc";
    else nextDir = col === "name" || col === "role" ? "asc" : "desc";
    return `/members?sort=${col}&dir=${nextDir}`;
  };
  const sortArrow = (col: SortKey): string => {
    if (col !== sort) return "";
    return dir === "asc" ? " ↑" : " ↓";
  };

  return (
    <div className="page-content">
      <div className="page-head">
        <div>
          <div className="page-title">Members</div>
          <div className="page-sub">
            {total} total · {active} active · {totalOpen} open · {totalOverdue > 0 ? <span style={{ color: "var(--danger)" }}>{totalOverdue} overdue</span> : `${totalOverdue} overdue`} · {totalDone1d} done today · {totalDone7d} 7d · {totalDone30d} 30d
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* ------------- list ------------- */}
        <div className="card p-0 overflow-hidden">
          <table className="tbl tbl-sortable">
            <thead>
              <tr>
                <th><Link href={sortHref("name")} className="th-link">Name{sortArrow("name")}</Link></th>
                <th><Link href={sortHref("role")} className="th-link">Role{sortArrow("role")}</Link></th>
                <th>Dept</th>
                <th>Reports to</th>
                <th className="text-right"><Link href={sortHref("open")} className="th-link">Open{sortArrow("open")}</Link></th>
                <th className="text-right"><Link href={sortHref("overdue")} className="th-link">Overdue{sortArrow("overdue")}</Link></th>
                <th className="text-right"><Link href={sortHref("done1d")} className="th-link">Done today{sortArrow("done1d")}</Link></th>
                <th className="text-right"><Link href={sortHref("done7d")} className="th-link">Done 7d{sortArrow("done7d")}</Link></th>
                <th className="text-right"><Link href={sortHref("done30d")} className="th-link">Done 30d{sortArrow("done30d")}</Link></th>
                <th className="text-right"><Link href={sortHref("comments7d")} className="th-link">Cmt 7d{sortArrow("comments7d")}</Link></th>
                <th className="text-right" title="Weighted: urgent=4, high=3, med=2, low=1; ×2 if overdue."><Link href={sortHref("busy")} className="th-link">Busy{sortArrow("busy")}</Link></th>
              </tr>
            </thead>
            <tbody>
              {augmented.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-10 text-text-3">
                    No members yet. Use the form on the right to add the first one.
                  </td>
                </tr>
              ) : (
                augmented.map((u) => (
                  <tr key={u.id} className="row-link">
                    <td>
                      <Link href={`/members/${u.id}`} className="member-name-link">
                        <span className="inline-flex items-center gap-2.5">
                          <span className={`tava ${avaClass(u.name)}`}>{avaInitials(u.name)}</span>
                          <span className={u.isActive ? "" : "text-text-3 line-through"}>
                            {u.name}
                          </span>
                        </span>
                      </Link>
                      <div className="mono text-[11px] text-text-4 pl-9">{u.email}</div>
                    </td>
                    <td>
                      <span
                        className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-medium"
                        style={{ color: ROLE_TONE[u.role] }}
                      >
                        <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: ROLE_TONE[u.role] }} />
                        {ROLE_LABEL[u.role] ?? u.role}
                      </span>
                    </td>
                    <td>
                      {u.departmentId && deptMap.has(u.departmentId) ? (
                        <span className="text-[11px] font-medium" style={{ color: deptMap.get(u.departmentId)!.color ?? "var(--text-2)" }}>
                          {deptMap.get(u.departmentId)!.name}
                        </span>
                      ) : (
                        <span className="text-text-4 text-[11px]">—</span>
                      )}
                    </td>
                    <td>
                      {managerMap.has(u.id) ? (
                        <span className="text-[11px] text-text-2">{managerMap.get(u.id)}</span>
                      ) : (
                        <span className="text-text-4 text-[11px]">—</span>
                      )}
                    </td>
                    <td className="text-right mono text-[12px]">{u.open || <span className="text-text-4">0</span>}</td>
                    <td className="text-right mono text-[12px]">
                      {u.overdue > 0 ? <span style={{ color: "var(--danger)" }}>{u.overdue}</span> : <span className="text-text-4">0</span>}
                    </td>
                    <td className="text-right mono text-[12px]">
                      {u.done1d > 0 ? <span className="text-success">{u.done1d}</span> : <span className="text-text-4">0</span>}
                    </td>
                    <td className="text-right mono text-[12px]">
                      {u.done7d > 0 ? <span className="text-success">{u.done7d}</span> : <span className="text-text-4">0</span>}
                    </td>
                    <td className="text-right mono text-[12px]">
                      {u.done30d > 0 ? <span className="text-success">{u.done30d}</span> : <span className="text-text-4">0</span>}
                    </td>
                    <td className="text-right mono text-[12px]">
                      {u.comments7d || <span className="text-text-4">0</span>}
                    </td>
                    <td className="text-right">
                      <BusyChip score={u.busy} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ------------- add member ------------- */}
        <aside className="card">
          <div className="text-[11px] text-text-3 uppercase tracking-wider font-medium mb-3">
            Add member
          </div>
          <form action={createMember} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-text-3 uppercase tracking-wider">Name</span>
              <input name="name" type="text" required placeholder="Priya Nair"
                className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-[13px]" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-text-3 uppercase tracking-wider">Email</span>
              <input name="email" type="email" required placeholder="priya@truestock.in"
                className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-[13px]" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-text-3 uppercase tracking-wider">Role</span>
              <select name="role" defaultValue="member"
                className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-[13px]">
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
                <option value="agent">Agent</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-text-3 uppercase tracking-wider">Department</span>
              <select name="departmentId" defaultValue=""
                className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-[13px]">
                <option value="">None</option>
                {deptRows.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-text-3 uppercase tracking-wider">Reports to</span>
              <select name="managerId" defaultValue=""
                className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-[13px]">
                <option value="">None</option>
                {memberRows.filter((u) => u.isActive).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </label>
            <div className="flex items-center justify-end pt-1">
              <button type="submit" className="btn btn-primary btn-sm">Add member</button>
            </div>
            <div className="text-[11px] text-text-3 leading-relaxed pt-1 border-t border-border">
              Busy = sum over open tasks of priority weight (urgent=4, high=3, med=2, low=1), doubled when overdue. Click any row for the per-person drill-down.
            </div>
          </form>

          {/* departments */}
          <div className="border-t border-border mt-4 pt-4">
            <div className="text-[11px] text-text-3 uppercase tracking-wider font-medium mb-3">
              Departments
            </div>
            {deptRows.length === 0 ? (
              <div className="text-text-3 italic text-[12px] mb-3">No departments yet.</div>
            ) : (
              <div className="flex flex-col gap-1.5 mb-3">
                {deptRows.map((d) => {
                  const headUser = d.headId ? memberRows.find((u) => u.id === d.headId) : null;
                  const memberCount = memberRows.filter((u) => u.departmentId === d.id).length;
                  return (
                    <div key={d.id} className="flex items-center gap-2 text-[12px]">
                      <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: d.color ?? "var(--text-3)", flexShrink: 0 }} />
                      <span className="font-medium" style={{ color: d.color ?? "var(--text)" }}>{d.name}</span>
                      <span className="text-text-4 ml-auto">{memberCount}</span>
                      {headUser ? <span className="text-text-3 text-[10px]">→ {headUser.name}</span> : null}
                    </div>
                  );
                })}
              </div>
            )}
            <form action={createDepartment} className="flex flex-col gap-2">
              <input name="name" type="text" required placeholder="Department name"
                className="bg-panel-2 border border-border-2 rounded-md px-3 py-1.5 text-[12px]" />
              <div className="flex gap-2">
                <input name="color" type="color" defaultValue="#3B82F6"
                  className="w-8 h-8 rounded border border-border-2 bg-panel-2 cursor-pointer p-0.5" />
                <select name="headId" defaultValue=""
                  className="flex-1 bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-[12px]">
                  <option value="">Head (optional)</option>
                  {memberRows.filter((u) => u.isActive).map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn btn-primary btn-sm self-end">Add dept</button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Busy chip — a single coloured pill so workload jumps off the page.
// Thresholds:  ≤4 calm · 5–9 steady · 10–17 busy · 18+ swamped
// ---------------------------------------------------------------------------
function BusyChip({ score }: { score: number }) {
  if (score <= 0)  return <span className="busy-chip busy-idle"    title="idle">·</span>;
  if (score <= 4)  return <span className="busy-chip busy-calm"    title="calm">{score}</span>;
  if (score <= 9)  return <span className="busy-chip busy-steady"  title="steady">{score}</span>;
  if (score <= 17) return <span className="busy-chip busy-busy"    title="busy">{score}</span>;
  return            <span className="busy-chip busy-swamped" title="swamped">{score}</span>;
}
