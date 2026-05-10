// apps/web/app/members/page.tsx
//
// Members directory — pre-SSO manual capture of teammates so we have real
// users to assign tasks to. Lists everyone with their open task count and
// what they've completed today. Click an email to filter Tasks to theirs.

import Link from "next/link";
import { getDb, users, tasks, eq, and, desc, sql } from "@tu/db";
import { createMember } from "./actions";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  member: "Member",
  viewer: "Viewer",
  agent: "Agent",
};
const ROLE_TONE: Record<string, string> = {
  admin: "var(--danger)",
  manager: "var(--warning)",
  member: "var(--accent-2)",
  viewer: "var(--text-3)",
  agent: "var(--info)",
};

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

export default async function MembersPage() {
  const db = getDb();

  // Today, in IST (matches the users.timezone default)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setHours(23, 59, 59, 999);

  const rows = await db.select().from(users).orderBy(desc(users.isActive), users.name);

  // Aggregate counts per user — done in two queries so we don't blow up the row select.
  const openCounts = await db
    .select({
      assigneeId: tasks.assigneeId,
      n: sql<number>`count(*)::int`.as("n"),
    })
    .from(tasks)
    .where(and(sql`${tasks.assigneeId} is not null`, sql`${tasks.status} not in ('done','cancelled')`))
    .groupBy(tasks.assigneeId);

  const doneTodayCounts = await db
    .select({
      assigneeId: tasks.assigneeId,
      n: sql<number>`count(*)::int`.as("n"),
    })
    .from(tasks)
    .where(
      and(
        sql`${tasks.assigneeId} is not null`,
        eq(tasks.status, "done"),
        sql`${tasks.completedAt} >= ${todayStart.toISOString()}`,
        sql`${tasks.completedAt} <= ${todayEnd.toISOString()}`,
      ),
    )
    .groupBy(tasks.assigneeId);

  const openMap = new Map<string, number>();
  for (const r of openCounts) if (r.assigneeId) openMap.set(r.assigneeId, r.n);
  const doneMap = new Map<string, number>();
  for (const r of doneTodayCounts) if (r.assigneeId) doneMap.set(r.assigneeId, r.n);

  const total = rows.length;
  const active = rows.filter((u) => u.isActive).length;

  return (
    <div className="page-content">
      <div className="page-head">
        <div>
          <div className="page-title">Members</div>
          <div className="page-sub">
            {total} total · {active} active · everyone you can assign a task to
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* ------------- list ------------- */}
        <div className="card p-0 overflow-hidden">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th className="text-right">Open</th>
                <th className="text-right">Done today</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-text-3">
                    No members yet. Use the form on the right to add the first one.
                  </td>
                </tr>
              ) : (
                rows.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="inline-flex items-center gap-2.5">
                        <span className={`tava ${avaClass(u.name)}`}>{avaInitials(u.name)}</span>
                        <span className={u.isActive ? "" : "text-text-3 line-through"}>
                          {u.name}
                        </span>
                      </span>
                    </td>
                    <td>
                      <Link
                        href={`/tasks?q=${encodeURIComponent(u.email)}`}
                        className="mono text-[12px] text-text-2 hover:text-accent-2"
                        title={`Filter tasks by ${u.email}`}
                      >
                        {u.email}
                      </Link>
                    </td>
                    <td>
                      <span
                        className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-medium"
                        style={{ color: ROLE_TONE[u.role] }}
                      >
                        <span
                          className="inline-block rounded-full"
                          style={{ width: 6, height: 6, background: ROLE_TONE[u.role] }}
                        />
                        {ROLE_LABEL[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="text-right mono text-[12px]">{openMap.get(u.id) ?? 0}</td>
                    <td className="text-right mono text-[12px]">
                      {doneMap.get(u.id) ? (
                        <span className="text-success">{doneMap.get(u.id)}</span>
                      ) : (
                        <span className="text-text-4">0</span>
                      )}
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
              <input
                name="name"
                type="text"
                required
                placeholder="Priya Nair"
                className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-[13px]"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-text-3 uppercase tracking-wider">Email</span>
              <input
                name="email"
                type="email"
                required
                placeholder="priya@truestock.in"
                className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-[13px]"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-text-3 uppercase tracking-wider">Role</span>
              <select
                name="role"
                defaultValue="member"
                className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-[13px]"
              >
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
                <option value="agent">Agent</option>
              </select>
            </label>
            <div className="flex items-center justify-end pt-1">
              <button type="submit" className="btn btn-primary btn-sm">
                Add member
              </button>
            </div>
            <div className="text-[11px] text-text-3 leading-relaxed pt-1 border-t border-border">
              Pre-SSO. Once Google SSO is wired, new sign-ins from <span className="mono">@truestock.in</span> auto-provision and this form becomes a backup.
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}
