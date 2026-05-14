// apps/web/app/projects/[slug]/project-snapshot.tsx
//
// Client component: Week / Month snapshot filter for project pages.
// Shows filtered task list + summary stats for the selected time window.

"use client";

import { useState } from "react";
import Link from "next/link";

type Period = "all" | "week" | "month";

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  assigneeName: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  backlog: "Backlog", todo: "To do", in_progress: "In progress",
  review: "Review", done: "Done", cancelled: "Cancelled",
};
const STATUS_DOT: Record<string, string> = {
  backlog: "var(--text-3)", todo: "#60A5FA", in_progress: "var(--accent)",
  review: "var(--warning)", done: "var(--success)", cancelled: "var(--text-4)",
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });
}

function getWindowStart(period: Period): Date | null {
  if (period === "all") return null;
  const now = new Date();
  // IST current date
  const istStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const days = period === "week" ? 7 : 30;
  const d = new Date(`${istStr}T00:00:00+05:30`);
  d.setDate(d.getDate() - (days - 1));
  return d;
}

function filterTasks(tasks: TaskRow[], period: Period): TaskRow[] {
  if (period === "all") return tasks;
  const windowStart = getWindowStart(period);
  if (!windowStart) return tasks;
  const ws = windowStart.getTime();

  return tasks.filter((t) => {
    // Show task if it was completed in window, or created in window, or is still open
    const completedInWindow = t.completedAt && new Date(t.completedAt).getTime() >= ws;
    const createdInWindow = new Date(t.createdAt).getTime() >= ws;
    const isOpen = !["done", "cancelled"].includes(t.status);
    return completedInWindow || createdInWindow || isOpen;
  });
}

function computeSummary(tasks: TaskRow[], period: Period) {
  const windowStart = getWindowStart(period);
  const ws = windowStart ? windowStart.getTime() : 0;

  let closed = 0, created = 0, open = 0;
  const byAssignee = new Map<string, { closed: number; open: number }>();
  const byPriority = new Map<string, number>();

  for (const t of tasks) {
    const name = t.assigneeName ?? "Unassigned";
    if (!byAssignee.has(name)) byAssignee.set(name, { closed: 0, open: 0 });

    if (t.status === "done" && t.completedAt && (!windowStart || new Date(t.completedAt).getTime() >= ws)) {
      closed++;
      byAssignee.get(name)!.closed++;
      byPriority.set(t.priority, (byPriority.get(t.priority) ?? 0) + 1);
    }
    if (!["done", "cancelled"].includes(t.status)) {
      open++;
      byAssignee.get(name)!.open++;
    }
    if (!windowStart || new Date(t.createdAt).getTime() >= ws) {
      created++;
    }
  }

  return { closed, created, open, byAssignee, byPriority };
}

export function ProjectSnapshot({ allTasks }: { allTasks: TaskRow[] }) {
  const [period, setPeriod] = useState<Period>("all");

  const filtered = filterTasks(allTasks, period);
  const summary = period !== "all" ? computeSummary(filtered, period) : null;

  // Group tasks by status
  const grouped: Record<string, TaskRow[]> = {};
  for (const t of filtered) {
    if (!grouped[t.status]) grouped[t.status] = [];
    grouped[t.status]!.push(t);
  }
  const statusOrder = ["in_progress", "review", "todo", "backlog", "done", "cancelled"];

  return (
    <>
      {/* Period selector */}
      <div className="snapshot-bar">
        <div className="bento-view-tabs">
          {(["all", "week", "month"] as const).map((p) => (
            <button
              key={p}
              className={`bento-view-tab ${period === p ? "active" : ""}`}
              onClick={() => setPeriod(p)}
            >
              {p === "all" ? "All tasks" : p === "week" ? "This week" : "This month"}
            </button>
          ))}
        </div>
        {period !== "all" && (
          <span className="snapshot-count">{filtered.length} task{filtered.length === 1 ? "" : "s"} in window</span>
        )}
      </div>

      {/* Summary card for week/month */}
      {summary && (
        <div className="snapshot-summary">
          <div className="snapshot-stats">
            <div className="snapshot-stat">
              <div className="snapshot-stat-n">{summary.closed}</div>
              <div className="snapshot-stat-l">Closed</div>
            </div>
            <div className="snapshot-stat">
              <div className="snapshot-stat-n">{summary.open}</div>
              <div className="snapshot-stat-l">Open</div>
            </div>
            <div className="snapshot-stat">
              <div className="snapshot-stat-n">{summary.created}</div>
              <div className="snapshot-stat-l">Created</div>
            </div>
          </div>

          {/* By assignee */}
          {summary.byAssignee.size > 0 && (
            <div className="snapshot-section">
              <div className="snapshot-section-label">By member</div>
              <div className="snapshot-chips">
                {[...summary.byAssignee.entries()]
                  .sort((a, b) => b[1].closed - a[1].closed)
                  .map(([name, v]) => (
                    <span key={name} className="snapshot-chip">
                      {name} <span className="mono">{v.closed}✓ {v.open}○</span>
                    </span>
                  ))}
              </div>
            </div>
          )}

          {/* By priority */}
          {summary.byPriority.size > 0 && (
            <div className="snapshot-section">
              <div className="snapshot-section-label">Closures by priority</div>
              <div className="snapshot-chips">
                {["urgent", "high", "med", "low"].map((p) => {
                  const n = summary.byPriority.get(p);
                  if (!n) return null;
                  return <span key={p} className={`prio ${p}`}>{n} {p}</span>;
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filtered task list */}
      {filtered.length === 0 ? (
        <div className="card text-center py-10 text-text-2">
          No tasks in this {period === "week" ? "week" : "month"} window.
        </div>
      ) : (
        <div className="space-y-4">
          {statusOrder.map((s) => {
            const items = grouped[s];
            if (!items || items.length === 0) return null;
            return (
              <div key={s} className="card p-0 overflow-hidden">
                <div className="px-4 py-2.5 bg-panel-2 border-b border-border text-[11px] uppercase tracking-wider text-text-3 font-semibold flex items-center gap-2">
                  <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: STATUS_DOT[s] }} />
                  {STATUS_LABEL[s]} <span className="text-text-4 font-normal">· {items.length}</span>
                </div>
                <table className="tbl">
                  <tbody>
                    {items.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <Link href={`/tasks/${t.id}`} className="font-medium hover:text-accent-2">{t.title}</Link>
                        </td>
                        <td className="w-32 text-[12px] text-text-2">{t.assigneeName ?? "—"}</td>
                        <td className="w-20"><span className={`prio ${t.priority}`}>{t.priority}</span></td>
                        <td className="w-20 mono text-[11.5px] text-text-2">{fmtDate(t.dueDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
