// apps/web/app/tasks/page.tsx
//
// Asana-inspired Tasks page (dark Skynet palette).
//
// Layout:
//   page-head           — title + signed-in chip
//   .view-tabs          — List / Board / Calendar / Timeline / Files
//   .toolbar            — + Add task · Filter · Sort · Group:[…] · search
//   List view           — sectioned by `group` searchParam (default: due)
//   Board view          — kanban grouped by status (always)
//
// Server component. Inline status / assignee mutations live in
// inline-controls.tsx. Completion toggle is an inline <form> hitting
// updateTaskStatus directly (no JS).

import Link from "next/link";
import { getDb, tasks, projects, users, eq, desc, or, and, ilike, inArray, sql } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, getDepartmentScope } from "@/lib/access";
import { fmtDueCountdown, dueStatus } from "@/lib/worktime";
import { StatusSelect, AssigneeSelect } from "./inline-controls";
import { updateTaskStatus } from "./actions";
import { TaskPane } from "./task-pane";
import { TaskPaneContent } from "./task-pane-content";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
  cancelled: "Cancelled",
};
const STATUS_DOT: Record<string, string> = {
  backlog: "var(--text-3)",
  todo: "#60A5FA",
  in_progress: "var(--accent)",
  review: "var(--warning)",
  done: "var(--success)",
  cancelled: "var(--text-4)",
};
const PRIORITY_DOT: Record<string, string> = {
  low: "var(--text-3)",
  med: "var(--text-2)",
  high: "var(--warning)",
  urgent: "var(--danger)",
};
const BOARD_COLUMNS = ["backlog", "todo", "in_progress", "review", "done"] as const;

const GROUP_OPTIONS = [
  { value: "due", label: "Due date" },
  { value: "status", label: "Status" },
  { value: "assignee", label: "Assignee" },
  { value: "project", label: "Project" },
] as const;
type GroupKey = (typeof GROUP_OPTIONS)[number]["value"];

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function fmtDate(d: string | Date | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfThisWeek(): Date {
  // ISO week: Monday=0, Sunday=6 — but Asana commonly uses Sunday end of week.
  // We use "next Sunday 23:59:59.999" to feel familiar.
  const d = startOfToday();
  const day = d.getDay(); // 0=Sun..6=Sat
  const daysUntilSunday = (7 - day) % 7; // today is Sunday → 0 (this Sunday)
  d.setDate(d.getDate() + daysUntilSunday);
  d.setHours(23, 59, 59, 999);
  return d;
}

function dueBucket(due: string | Date | null, status: string): string {
  if (status === "done") return "done";
  if (status === "cancelled") return "cancelled";
  if (!due) return "no_due";
  const dueDate = typeof due === "string" ? new Date(due) : due;
  const today = startOfToday();
  const weekEnd = endOfThisWeek();
  if (dueDate < today) return "overdue";
  // Treat dates that fall on today (any time) as Today
  const sameDay =
    dueDate.getFullYear() === today.getFullYear() &&
    dueDate.getMonth() === today.getMonth() &&
    dueDate.getDate() === today.getDate();
  if (sameDay) return "today";
  if (dueDate <= weekEnd) return "this_week";
  return "later";
}

const DUE_BUCKET_ORDER = ["overdue", "today", "this_week", "later", "no_due", "done", "cancelled"] as const;
const DUE_BUCKET_LABEL: Record<string, string> = {
  overdue: "Overdue",
  today: "Today",
  this_week: "This week",
  later: "Later",
  no_due: "No due date",
  done: "Done",
  cancelled: "Cancelled",
};
const DUE_BUCKET_TONE: Record<string, string> = {
  overdue: "var(--danger)",
  today: "var(--accent-2)",
  this_week: "var(--info)",
  later: "var(--text-2)",
  no_due: "var(--text-3)",
  done: "var(--success)",
  cancelled: "var(--text-4)",
};

// hash user name to one of 4 avatar gradients (h1..h4) so people are visually consistent
function avaClass(name?: string | null): string {
  if (!name) return "h1";
  const sum = [...name].reduce((s, c) => s + c.charCodeAt(0), 0);
  return ["h1", "h2", "h3", "h4"][sum % 4]!;
}
function avaInitial(name?: string | null): string {
  if (!name) return "?";
  return name.trim()[0]?.toUpperCase() ?? "?";
}

function isOverdue(t: { dueDate: string | Date | null; status: string }): boolean {
  if (!t.dueDate || t.status === "done" || t.status === "cancelled") return false;
  const d = typeof t.dueDate === "string" ? new Date(t.dueDate) : t.dueDate;
  return d < startOfToday();
}

// ---------------------------------------------------------------------------
// page
// ---------------------------------------------------------------------------
interface PageProps {
  searchParams: Promise<{ view?: string; group?: string; q?: string; task?: string }>;
}

export default async function TasksPage({ searchParams }: PageProps) {
  const { view, group: groupRaw, q: qRaw, task: taskIdRaw } = await searchParams;
  const taskId = (taskIdRaw ?? "").trim() || null;
  const isBoard = view === "board";
  const group: GroupKey = (GROUP_OPTIONS.find((g) => g.value === groupRaw)?.value ?? "due") as GroupKey;
  const q = (qRaw ?? "").trim();

  const me = await getCurrentUser();
  const canSeeAll = isAdmin(me);
  const deptScope = getDepartmentScope(me);
  const db = getDb();

  // Search filter on title/description, case-insensitive.
  const searchFilter = q
    ? or(ilike(tasks.title, `%${q}%`), ilike(tasks.description, `%${q}%`))
    : undefined;

  // Data wall: admin sees all, manager sees department tasks, member sees own.
  // Always include parent tasks where a subtask is assigned to the user.
  const hasMySubtask = sql`${tasks.id} in (select parent_task_id from tasks where assignee_id = ${me.id} and parent_task_id is not null)`;

  let scopeFilter;
  if (canSeeAll) {
    scopeFilter = undefined;
  } else if (deptScope) {
    // Manager — see tasks where assignee or creator is in their department
    const deptMembers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.departmentId, deptScope));
    const deptIds = deptMembers.map((u) => u.id);
    if (deptIds.length > 0) {
      scopeFilter = or(inArray(tasks.assigneeId, deptIds), inArray(tasks.createdById, deptIds), hasMySubtask);
    } else {
      scopeFilter = or(eq(tasks.assigneeId, me.id), eq(tasks.createdById, me.id), hasMySubtask);
    }
  } else {
    scopeFilter = or(eq(tasks.assigneeId, me.id), eq(tasks.createdById, me.id), hasMySubtask);
  }

  const where = searchFilter && scopeFilter
    ? and(searchFilter, scopeFilter)
    : searchFilter ?? scopeFilter ?? undefined;

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      createdAt: tasks.createdAt,
      project: { slug: projects.slug, name: projects.name, color: projects.color, iconUrl: projects.iconUrl },
      assignee: { id: users.id, name: users.name },
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(where)
    .orderBy(desc(tasks.createdAt));

  const allUsers = await db.select({ id: users.id, name: users.name }).from(users);

  const open = rows.filter((r) => r.status !== "done" && r.status !== "cancelled").length;
  const overdueCount = rows.filter((r) => isOverdue(r)).length;

  const baseQuery = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if (view) params.set("view", view);
    if (group !== "due") params.set("group", group);
    if (q) params.set("q", q);
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined || v === "") params.delete(k);
      else params.set(k, v);
    }
    const s = params.toString();
    return s ? `/tasks?${s}` : "/tasks";
  };

  // Build /tasks?task=<id>&view=...&group=...&q=... — used as the row click target
  const rowHrefForTask = (id: string) => {
    const params = new URLSearchParams();
    if (view) params.set("view", view);
    if (group !== "due") params.set("group", group);
    if (q) params.set("q", q);
    params.set("task", id);
    return `/tasks?${params.toString()}`;
  };

  return (
    <div className="page-content">
      {/* ------------------------- header ------------------------- */}
      <div className="page-head">
        <div>
          <div className="page-title">Tasks</div>
          <div className="page-sub">
            {rows.length} total · {open} open
            {overdueCount > 0 ? (
              <>
                {" · "}
                <span style={{ color: "var(--danger)" }}>{overdueCount} overdue</span>
              </>
            ) : null}
            {" · signed in as "}
            <span className="mono">{me.email}</span>
          </div>
        </div>
      </div>

      {/* ------------------------- view tabs ------------------------- */}
      <div className="view-tabs">
        <Link
          href={baseQuery({ view: undefined })}
          className={`view-tab ${!isBoard ? "active" : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          List
        </Link>
        <Link
          href={baseQuery({ view: "board" })}
          className={`view-tab ${isBoard ? "active" : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
            <rect x="3" y="4" width="5" height="16" rx="1" />
            <rect x="10" y="4" width="5" height="10" rx="1" />
            <rect x="17" y="4" width="4" height="13" rx="1" />
          </svg>
          Board
        </Link>
        <span className="view-tab disabled" title="Soon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
          Calendar
        </span>
        <span className="view-tab disabled" title="Soon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
            <path d="M3 6h18M3 12h12M3 18h6" />
          </svg>
          Timeline
        </span>
        <span className="view-tab disabled" title="Soon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
            <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <path d="M14 3v6h6" />
          </svg>
          Files
        </span>
      </div>

      {/* ------------------------- toolbar ------------------------- */}
      <div className="toolbar">
        <Link href="/tasks/new" className="btn btn-primary btn-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add task
        </Link>
        <div className="tb-divider" />
        <button type="button" className="btn btn-ghost btn-sm" disabled title="Filters land in v2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
            <path d="M3 5h18M6 12h12M10 19h4" />
          </svg>
          Filter
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled title="Sort lands in v2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
            <path d="M7 4v16M3 8l4-4 4 4M17 4v16M13 16l4 4 4-4" />
          </svg>
          Sort
        </button>
        {!isBoard ? (
          <form action="/tasks" method="GET" className="group-form">
            {view ? <input type="hidden" name="view" value={view} /> : null}
            {q ? <input type="hidden" name="q" value={q} /> : null}
            <label className="group-select">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
                <rect x="3" y="4" width="18" height="4" rx="1" />
                <rect x="3" y="10" width="18" height="4" rx="1" />
                <rect x="3" y="16" width="18" height="4" rx="1" />
              </svg>
              <span>Group:</span>
              <select name="group" defaultValue={group}>
                {GROUP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <noscript>
                <button type="submit" className="btn btn-ghost btn-sm">Go</button>
              </noscript>
            </label>
          </form>
        ) : null}
        <div className="tb-spacer" />
        <form action="/tasks" method="GET" className="search-form">
          {view ? <input type="hidden" name="view" value={view} /> : null}
          {group !== "due" ? <input type="hidden" name="group" value={group} /> : null}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            name="q"
            type="search"
            placeholder="Search tasks…"
            defaultValue={q}
            autoComplete="off"
          />
        </form>
      </div>

      {/* ------------------------- body ------------------------- */}
      {rows.length === 0 ? (
        <div className="card text-center py-16 mt-2">
          <div className="text-text-2 mb-2">
            {q ? <>No tasks match <span className="mono">"{q}"</span>.</> : "Clean slate. What's the next thing?"}
          </div>
          <div className="text-text-3 text-[12px] mb-3">
            {q ? "Try a different search or clear it to see everything." : "Type the first task — Skynet will pick the project, assignee, and priority."}
          </div>
          <Link href="/tasks/new" className="btn btn-primary btn-sm">
            {q ? "Clear search" : "✨ Capture a task"}
          </Link>
        </div>
      ) : isBoard ? (
        <BoardView rows={rows} users={allUsers} rowHref={rowHrefForTask} />
      ) : (
        <ListView rows={rows} users={allUsers} group={group} rowHref={rowHrefForTask} />
      )}

      {/* Asana-style slide-over — server-rendered content inside a client shell */}
      {taskId ? (
        <TaskPane>
          <TaskPaneContent taskId={taskId} />
        </TaskPane>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List view — Asana-style sectioned rows
// ---------------------------------------------------------------------------
function ListView({
  rows,
  users,
  group,
  rowHref,
}: {
  rows: any[];
  users: Array<{ id: string; name: string }>;
  group: GroupKey;
  rowHref: (id: string) => string;
}) {
  // Group rows by the chosen dimension and produce ordered sections.
  type Section = { key: string; label: string; tone: string; items: any[] };
  let sections: Section[] = [];

  if (group === "due") {
    const buckets: Record<string, any[]> = {};
    for (const k of DUE_BUCKET_ORDER) buckets[k] = [];
    for (const t of rows) {
      const k = dueBucket(t.dueDate, t.status);
      (buckets[k] ?? buckets.no_due!).push(t);
    }
    sections = DUE_BUCKET_ORDER.map((k) => ({
      key: k,
      label: DUE_BUCKET_LABEL[k]!,
      tone: DUE_BUCKET_TONE[k]!,
      items: buckets[k] ?? [],
    })).filter((s) => s.items.length > 0 || (s.key !== "done" && s.key !== "cancelled"));
  } else if (group === "status") {
    const order = ["backlog", "todo", "in_progress", "review", "done", "cancelled"];
    const buckets: Record<string, any[]> = {};
    for (const k of order) buckets[k] = [];
    for (const t of rows) (buckets[t.status] ?? buckets.todo!).push(t);
    sections = order.map((k) => ({
      key: k,
      label: STATUS_LABEL[k]!,
      tone: STATUS_DOT[k]!,
      items: buckets[k] ?? [],
    })).filter((s) => s.items.length > 0);
  } else if (group === "assignee") {
    const buckets: Record<string, { label: string; items: any[] }> = {};
    for (const t of rows) {
      const id = t.assignee?.id ?? "__unassigned__";
      const label = t.assignee?.name ?? "Unassigned";
      (buckets[id] ??= { label, items: [] }).items.push(t);
    }
    sections = Object.entries(buckets).map(([k, v]) => ({
      key: k,
      label: v.label,
      tone: k === "__unassigned__" ? "var(--text-3)" : "var(--accent-2)",
      items: v.items,
    }));
    // Unassigned last
    sections.sort((a, b) => (a.key === "__unassigned__" ? 1 : b.key === "__unassigned__" ? -1 : a.label.localeCompare(b.label)));
  } else {
    // project
    const buckets: Record<string, { label: string; items: any[]; slug: string }> = {};
    for (const t of rows) {
      const k = t.project.slug;
      (buckets[k] ??= { label: t.project.name, slug: k, items: [] }).items.push(t);
    }
    sections = Object.entries(buckets).map(([k, v]) => ({
      key: k,
      label: v.label,
      tone: "var(--accent-2)",
      items: v.items,
    }));
    sections.sort((a, b) => a.label.localeCompare(b.label));
  }

  return (
    <div className="alist">
      {/* column headers — render once, sections share them */}
      <div className="alist-head">
        <div className="alist-cell-check"></div>
        <div className="alist-cell-title">Task</div>
        <div className="alist-cell-project">Project</div>
        <div className="alist-cell-assignee">Assignee</div>
        <div className="alist-cell-status">Status</div>
        <div className="alist-cell-due">Due</div>
        <div className="alist-cell-prio">Priority</div>
      </div>

      {sections.map((sec) => (
        <section key={sec.key} className="asec">
          <header className="asec-head">
            <span className="asec-chev" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
            <span className="asec-tone" style={{ background: sec.tone }} />
            <span className="asec-label">{sec.label}</span>
            <span className="asec-count">{sec.items.length}</span>
          </header>

          {sec.items.length === 0 ? (
            <div className="asec-empty">Drop a task here · or click below to add one</div>
          ) : (
            sec.items.map((t) => <TaskRow key={t.id} t={t} users={users} rowHref={rowHref} />)
          )}

          <Link href="/tasks/new" className="asec-add">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add task
          </Link>
        </section>
      ))}
    </div>
  );
}

function TaskRow({
  t,
  users,
  rowHref,
}: {
  t: any;
  users: Array<{ id: string; name: string }>;
  rowHref: (id: string) => string;
}) {
  const overdue = isOverdue(t);
  const done = t.status === "done";
  const cancelled = t.status === "cancelled";

  return (
    <div className={`arow ${done ? "is-done" : ""} ${cancelled ? "is-cancelled" : ""}`}>
      {/* completion check — server form, no JS needed */}
      <div className="alist-cell-check">
        <form action={updateTaskStatus}>
          <input type="hidden" name="taskId" value={t.id} />
          <input type="hidden" name="status" value={done ? "todo" : "done"} />
          <button
            type="submit"
            aria-label={done ? "Mark as to do" : "Mark as done"}
            className={`acheck ${done ? "is-done" : ""}`}
            title={done ? "Mark as to do" : "Mark as done"}
          >
            {done ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11">
                <path d="m5 12 5 5L20 7" />
              </svg>
            ) : null}
          </button>
        </form>
      </div>

      <div className="alist-cell-title">
        <Link href={rowHref(t.id)} className="atitle" scroll={false}>
          {t.title}
        </Link>
      </div>

      <div className="alist-cell-project">
        <Link href={`/projects/${t.project.slug}`} className={`pchip ${t.project.slug}`}>
          {t.project.iconUrl ? <img src={t.project.iconUrl} alt="" className="pchip-icon" /> : null}
          {t.project.name}
        </Link>
      </div>

      <div className="alist-cell-assignee">
        {t.assignee?.name ? (
          <span className="aassignee">
            <span className={`tava ${avaClass(t.assignee.name)}`}>{avaInitial(t.assignee.name)}</span>
            <AssigneeSelect taskId={t.id} assigneeId={t.assignee?.id ?? null} users={users} />
          </span>
        ) : (
          <AssigneeSelect taskId={t.id} assigneeId={null} users={users} />
        )}
      </div>

      <div className="alist-cell-status">
        <StatusSelect taskId={t.id} status={t.status} />
      </div>

      <div className={`alist-cell-due ${overdue ? "is-overdue" : ""}`}>
        {t.dueDate ? (
          <span title={fmtDate(t.dueDate)}>{fmtDueCountdown(t.dueDate)}</span>
        ) : (
          <span className="text-text-4">—</span>
        )}
      </div>

      <div className="alist-cell-prio">
        <span className="aprio">
          <span className="aprio-dot" style={{ background: PRIORITY_DOT[t.priority] }} />
          {t.priority}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board view — kanban (cleaner card chrome, inline + add per column)
// ---------------------------------------------------------------------------
function BoardView({
  rows,
  users: _users,
  rowHref,
}: {
  rows: any[];
  users: Array<{ id: string; name: string }>;
  rowHref: (id: string) => string;
}) {
  const grouped: Record<string, any[]> = {
    backlog: [], todo: [], in_progress: [], review: [], done: [], cancelled: [],
  };
  for (const t of rows) (grouped[t.status] ?? grouped.todo!).push(t);

  return (
    <div className="kanban">
      {BOARD_COLUMNS.map((s) => {
        const items = grouped[s] ?? [];
        return (
          <div key={s} className="kcol">
            <div className="kcol-head">
              <div className="kcol-title flex items-center gap-2">
                <span
                  className="inline-block rounded-full"
                  style={{ width: 8, height: 8, background: STATUS_DOT[s] }}
                />
                {STATUS_LABEL[s]}
              </div>
              <div className="kcol-count">{items.length}</div>
            </div>

            {items.length === 0 ? (
              <div className="text-text-3 italic text-xs px-2 py-3 text-center">empty</div>
            ) : (
              items.map((t) => (
                <Link key={t.id} href={rowHref(t.id)} className="tcard no-underline" scroll={false}>
                  <div className="flex gap-1 flex-wrap">
                    <span className={`pchip ${t.project.slug}`}>{t.project.name}</span>
                    {t.priority === "urgent" || t.priority === "high" ? (
                      <span className={`prio ${t.priority}`}>{t.priority}</span>
                    ) : null}
                  </div>
                  <div className="ttitle">{t.title}</div>
                  <div className="tmeta">
                    {t.assignee?.name ? (
                      <span className="flex items-center gap-1.5">
                        <span className={`tava ${avaClass(t.assignee.name)}`}>
                          {avaInitial(t.assignee.name)}
                        </span>
                        {t.assignee.name}
                      </span>
                    ) : (
                      <span className="text-text-3 italic">unassigned</span>
                    )}
                    <span
                      className={`tdue ${
                        t.dueDate && new Date(t.dueDate) < startOfToday() && t.status !== "done"
                          ? "red"
                          : ""
                      }`}
                      title={t.dueDate ? fmtDate(t.dueDate) : ""}
                    >
                      {t.dueDate ? fmtDueCountdown(t.dueDate) : ""}
                    </span>
                  </div>
                </Link>
              ))
            )}

            <Link href="/tasks/new" className="kcol-add">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add task
            </Link>
          </div>
        );
      })}
    </div>
  );
}
