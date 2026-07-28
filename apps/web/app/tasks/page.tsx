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
// inline-controls.tsx (optimistic client controls). The Board is a client
// component (board-view.tsx) so cards can be dragged between columns.

import Link from "next/link";
import { Suspense } from "react";
import { getDb, tasks, projects, users, eq, desc, or, and, ilike, sql } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { getActiveUsers, getProjectsList } from "@/lib/cached-queries";
import { isAdmin, isPrivileged, getDepartmentScope } from "@/lib/access";
import { fmtDueCountdown } from "@/lib/worktime";
import { StatusSelect, AssigneeSelect, DoneCheck } from "./inline-controls";
import { bulkSweepOverdue } from "./actions";
import { TaskPane } from "./task-pane";
import { TaskPaneContent } from "./task-pane-content";
import { GroupForm } from "./group-form";
import { FilterBar } from "./filter-bar";
import { BoardView } from "./board-view";

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

// All bucketing below compares IST calendar-date STRINGS. The previous
// Date-object math used the server's local midnight — on a UTC server,
// between 00:00 and 05:30 IST every night the buckets and red highlighting
// disagreed with the header stats (which are computed in IST SQL).
const TZ = "Asia/Kolkata";

/** Today's date in IST as YYYY-MM-DD. */
function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

/** Normalize a due value (YYYY-MM-DD string or Date) to an IST date string. */
function dateStrOf(d: string | Date): string {
  if (typeof d === "string") return d.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

/** Shift a YYYY-MM-DD calendar date by n days. */
function shiftDateStr(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** This week ends next Sunday (Asana-style), as YYYY-MM-DD. */
function endOfThisWeekStr(today: string): string {
  const day = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
  return shiftDateStr(today, (7 - day) % 7);
}

function dueBucket(due: string | Date | null, status: string): string {
  if (status === "done") return "done";
  if (status === "cancelled") return "cancelled";
  if (!due) return "no_due";
  const dueStr = dateStrOf(due);
  const today = todayIST();
  if (dueStr < today) return "overdue";
  if (dueStr === today) return "today";
  if (dueStr <= endOfThisWeekStr(today)) return "this_week";
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
  return dateStrOf(t.dueDate) < todayIST();
}

// ---------------------------------------------------------------------------
// page
// ---------------------------------------------------------------------------
const PAGE_SIZE = 50;

interface PageProps {
  searchParams: Promise<{ view?: string; group?: string; q?: string; task?: string; page?: string; assignee?: string; priority?: string; project?: string; closed?: string }>;
}

const FILTER_PRIORITIES = ["low", "med", "high", "urgent"] as const;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SLUG_RE = /^[a-z0-9-]+$/;

export default async function TasksPage({ searchParams }: PageProps) {
  const t0 = Date.now();
  const { view, group: groupRaw, q: qRaw, task: taskIdRaw, page: pageRaw, assignee: assigneeRaw, priority: priorityRaw, project: projectRaw, closed: closedRaw } = await searchParams;
  const showClosed = (closedRaw ?? "").trim() === "1";
  const taskId = (taskIdRaw ?? "").trim() || null;
  const isBoard = view === "board";
  const group: GroupKey = (GROUP_OPTIONS.find((g) => g.value === groupRaw)?.value ?? "due") as GroupKey;
  const q = (qRaw ?? "").trim();
  const page = Math.max(1, parseInt(pageRaw ?? "1", 10) || 1);

  // Filters — validated before they touch SQL. "me"/"none" are shortcuts;
  // anything else must look like a UUID (assignee) or slug (project).
  const assigneeParamRaw = (assigneeRaw ?? "").trim();
  const assigneeParam = assigneeParamRaw === "me" || assigneeParamRaw === "none" || UUID_RE.test(assigneeParamRaw) ? assigneeParamRaw : "";
  const priorityParam = (FILTER_PRIORITIES as readonly string[]).includes((priorityRaw ?? "").trim()) ? (priorityRaw ?? "").trim() : "";
  const projectParam = SLUG_RE.test((projectRaw ?? "").trim()) ? (projectRaw ?? "").trim() : "";
  const filtersActive = Boolean(assigneeParam || priorityParam || projectParam);

  const tAuth0 = Date.now();
  const me = await getCurrentUser();
  const tAuth1 = Date.now();
  const canSeeAll = isAdmin(me);
  const canAssignOthers = isPrivileged(me);
  const deptScope = getDepartmentScope(me);
  const db = getDb();

  // Search filter on title/description, case-insensitive.
  const searchFilter = q
    ? or(ilike(tasks.title, `%${q}%`), ilike(tasks.description, `%${q}%`))
    : undefined;

  // Data wall: admin sees all, manager sees department tasks, member sees own.
  // Uses SQL subqueries instead of pre-fetching IDs — eliminates 2 sequential round-trips.
  let scopeFilter;
  if (canSeeAll) {
    scopeFilter = undefined;
  } else if (deptScope) {
    // Manager — see tasks where assignee or creator is in their department,
    // OR tasks whose subtasks are assigned to me (parent visibility).
    scopeFilter = or(
      sql`${tasks.assigneeId} in (select id from users where department_id = ${deptScope})`,
      sql`${tasks.createdById} in (select id from users where department_id = ${deptScope})`,
      sql`${tasks.id} in (select parent_task_id from tasks where assignee_id = ${me.id} and parent_task_id is not null)`
    );
  } else {
    // Member — own tasks + parent tasks whose subtasks are assigned to me
    scopeFilter = or(
      eq(tasks.assigneeId, me.id),
      eq(tasks.createdById, me.id),
      sql`${tasks.id} in (select parent_task_id from tasks where assignee_id = ${me.id} and parent_task_id is not null)`
    );
  }

  // User-chosen filters (validated above)
  const assigneeFilter =
    assigneeParam === "me"
      ? eq(tasks.assigneeId, me.id)
      : assigneeParam === "none"
        ? sql`${tasks.assigneeId} is null`
        : assigneeParam
          ? eq(tasks.assigneeId, assigneeParam)
          : undefined;
  const priorityFilter = priorityParam ? sql`${tasks.priority} = ${priorityParam}` : undefined;
  // Subquery (not a join) so the stats query stays join-free
  const projectFilter = projectParam
    ? sql`${tasks.projectId} in (select id from projects where slug = ${projectParam})`
    : undefined;

  // Closed-work visibility. Default: the list shows LIVE work only — 572 of
  // 575 tasks here are done/cancelled, and paging through 12 pages of finished
  // work to find 3 open ones is not a task list, it's an archive. Asana and
  // monday both hide completed items until asked. "Show closed" reveals them.
  // The Board keeps its Done column (a kanban without one is confusing) but
  // caps it to the last 7 days so it can't accumulate hundreds of cards.
  const visibleCond = isBoard
    ? sql`(${tasks.status} not in ('done'::task_status,'cancelled'::task_status) or (${tasks.status} = 'done'::task_status and ${tasks.completedAt} >= now() - interval '7 days'))`
    : sql`${tasks.status} not in ('done'::task_status,'cancelled'::task_status)`;

  const baseConds = [searchFilter, scopeFilter, assigneeFilter, priorityFilter, projectFilter].filter(
    (c): c is NonNullable<typeof c> => Boolean(c),
  );
  const rowConds = showClosed ? baseConds : [...baseConds, visibleCond];

  const toWhere = (cs: typeof baseConds) =>
    cs.length === 0 ? undefined : cs.length === 1 ? cs[0] : and(...cs);
  // Stats stay computed over EVERYTHING that matches the user's filters, so
  // the header can still say "575 total" while the list shows only live work.
  const statsWhere = toWhere(baseConds);
  const where = toWhere(rowConds);

  // Parallel: paginated rows + combined stats (single scan) + user list
  const offset = (page - 1) * PAGE_SIZE;
  const tQ0 = Date.now();

  const [rows, [statsRow], allUsers, projectsList] = await Promise.all([
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        createdAt: tasks.createdAt,
        recurrence: tasks.recurrence,
        project: { slug: projects.slug, name: projects.name, color: projects.color, iconUrl: projects.iconUrl },
        assignee: { id: users.id, name: users.name },
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .where(where)
      // In the due-grouped list view, open tasks sort by earliest due first so
      // every overdue task is on page 1 (previously createdAt-desc paging could
      // say "12 overdue" in the header while the Overdue section showed 2 —
      // the rest were on later pages). Closed tasks sink to the bottom.
      .orderBy(
        ...(!isBoard && group === "due"
          ? [
              sql`case when ${tasks.status} in ('done'::task_status,'cancelled'::task_status) then 1 else 0 end asc`,
              sql`${tasks.dueDate} asc nulls last`,
            ]
          : []),
        desc(tasks.createdAt),
      )
      .limit(PAGE_SIZE)
      .offset(offset),
    // One query, three stats via FILTER — single table scan instead of three.
    // No projects join: the filters never reference projects, and the join
    // silently dropped tasks whose project row was missing, making this page's
    // counts disagree with the Today page.
    db
      .select({
        total: sql<number>`count(*)::int`,
        open: sql<number>`count(*) filter (where status not in ('done','cancelled'))::int`,
        overdue: sql<number>`count(*) filter (where status not in ('done','cancelled') and due_date < (now() at time zone 'Asia/Kolkata')::date)::int`,
        // How many rows the CURRENT view will page through
        visible: showClosed
          ? sql<number>`count(*)::int`
          : sql<number>`count(*) filter (where ${visibleCond})::int`,
      })
      .from(tasks)
      .where(statsWhere),
    // Cached per-request — shared with TaskPaneContent if panel is open
    getActiveUsers(),
    // Cross-request cached project list for the filter dropdown
    getProjectsList(),
  ]);

  const tQ1 = Date.now();
  if (process.env.NODE_ENV !== "production") {
    console.log(`[TASKS-PAGE PERF] auth=${tAuth1-tAuth0}ms  queries=${tQ1-tQ0}ms  total=${tQ1-t0}ms  user=${me.email}  admin=${canSeeAll}  dept=${deptScope ?? 'none'}`);
  }

  const totalCount = statsRow?.total ?? 0;
  const open = statsRow?.open ?? 0;
  const overdueCount = statsRow?.overdue ?? 0;
  // Pagination follows what's actually listed, not the whole archive.
  const visibleCount = statsRow?.visible ?? 0;
  const totalPages = Math.max(1, Math.ceil(visibleCount / PAGE_SIZE));
  const closedCount = Math.max(0, totalCount - open);

  const baseQuery = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if (view) params.set("view", view);
    if (group !== "due") params.set("group", group);
    if (q) params.set("q", q);
    if (assigneeParam) params.set("assignee", assigneeParam);
    if (priorityParam) params.set("priority", priorityParam);
    if (projectParam) params.set("project", projectParam);
    if (showClosed) params.set("closed", "1");
    // preserve page unless explicitly overridden
    if (page > 1 && !("page" in extra)) params.set("page", String(page));
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined || v === "" || v === "1") params.delete(k);
      else params.set(k, v);
    }
    const s = params.toString();
    return s ? `/tasks?${s}` : "/tasks";
  };

  // Current view/filter params as a query string — row click targets append
  // &task=<id>; the client BoardView gets it as a plain string (functions
  // can't cross the server→client boundary).
  const rowParamsQS = (() => {
    const params = new URLSearchParams();
    if (view) params.set("view", view);
    if (group !== "due") params.set("group", group);
    if (q) params.set("q", q);
    if (assigneeParam) params.set("assignee", assigneeParam);
    if (priorityParam) params.set("priority", priorityParam);
    if (projectParam) params.set("project", projectParam);
    if (showClosed) params.set("closed", "1");
    return params.toString();
  })();
  const rowHrefForTask = (id: string) => `/tasks?${rowParamsQS ? `${rowParamsQS}&` : ""}task=${id}`;

  return (
    <div className="page-content">
      {/* ------------------------- header ------------------------- */}
      <div className="page-head">
        <div>
          <div className="page-title">Tasks</div>
          <div className="page-sub">
            <span className="text-text font-medium">{open}</span> open
            {overdueCount > 0 ? (
              <>
                {" · "}
                <span style={{ color: "var(--danger)" }}>{overdueCount} overdue</span>
              </>
            ) : null}
            {closedCount > 0 ? ` · ${closedCount} closed` : null}
            {totalPages > 1 ? ` · page ${page} of ${totalPages}` : null}
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
        {overdueCount > 0 ? (
          <details className="relative">
            <summary
              className="btn btn-ghost btn-sm list-none cursor-pointer select-none"
              style={{ color: "var(--danger)" }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
                <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" />
              </svg>
              Sweep overdue ({overdueCount})
            </summary>
            <div
              className="absolute left-0 top-full mt-1 z-30 p-2 rounded-[10px] border border-border shadow-lg flex flex-col gap-1"
              style={{ background: "var(--panel)", width: 280 }}
            >
              <div className="text-[11px] text-text-3 px-1 pb-1 leading-snug">
                Applies to all {overdueCount} overdue task{overdueCount === 1 ? "" : "s"} you can see. Done and cancelled tasks are untouched.
              </div>
              <form action={bulkSweepOverdue}>
                <input type="hidden" name="op" value="reschedule" />
                <button type="submit" className="btn btn-ghost btn-sm w-full" style={{ justifyContent: "flex-start" }}>
                  Reschedule all to today
                </button>
              </form>
              <form action={bulkSweepOverdue}>
                <input type="hidden" name="op" value="backlog" />
                <button type="submit" className="btn btn-ghost btn-sm w-full" style={{ justifyContent: "flex-start" }}>
                  Move all to Backlog (clears due date)
                </button>
              </form>
              <form action={bulkSweepOverdue}>
                <input type="hidden" name="op" value="cancel" />
                <button type="submit" className="btn btn-ghost btn-sm w-full" style={{ justifyContent: "flex-start", color: "var(--danger)" }}>
                  Cancel all overdue
                </button>
              </form>
            </div>
          </details>
        ) : null}
        <FilterBar
          view={view}
          group={group}
          q={q}
          assignee={assigneeParam}
          priority={priorityParam}
          project={projectParam}
          showClosed={showClosed}
          users={allUsers}
          projects={projectsList}
        />
        {!isBoard ? (
          <GroupForm view={view} group={group} q={q} extra={{ assignee: assigneeParam, priority: priorityParam, project: projectParam, ...(showClosed ? { closed: "1" } : {}) }} />
        ) : null}
        {closedCount > 0 ? (
          <Link
            href={baseQuery({ closed: showClosed ? undefined : "1", page: undefined })}
            className={`btn btn-ghost btn-sm ${showClosed ? "is-on" : ""}`}
            title={showClosed ? "Hide completed and cancelled tasks" : `Show ${closedCount} completed and cancelled tasks`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
              {showClosed ? (
                <>
                  <path d="M3 3l18 18M10.6 5.1A9.9 9.9 0 0112 5c5 0 9 4.5 10 7-.4 1-1.4 2.6-3 4M6.3 6.4C4.3 7.8 2.9 9.8 2 12c1 2.5 5 7 10 7 1.6 0 3-.4 4.3-1.1" />
                </>
              ) : (
                <>
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              )}
            </svg>
            {showClosed ? "Hide closed" : `Show closed (${closedCount})`}
          </Link>
        ) : null}
        <div className="tb-spacer" />
        <form action="/tasks" method="GET" className="search-form">
          {view ? <input type="hidden" name="view" value={view} /> : null}
          {group !== "due" ? <input type="hidden" name="group" value={group} /> : null}
          {assigneeParam ? <input type="hidden" name="assignee" value={assigneeParam} /> : null}
          {priorityParam ? <input type="hidden" name="priority" value={priorityParam} /> : null}
          {projectParam ? <input type="hidden" name="project" value={projectParam} /> : null}
          {showClosed ? <input type="hidden" name="closed" value="1" /> : null}
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
            {q ? <>No tasks match <span className="mono">"{q}"</span>.</> : filtersActive ? "No tasks match these filters." : "Clean slate. What's the next thing?"}
          </div>
          <div className="text-text-3 text-[12px] mb-3">
            {q || filtersActive ? "Try different filters or clear them to see everything." : "Type the first task — SeekPeak will pick the project, assignee, and priority."}
          </div>
          <Link href={q || filtersActive ? "/tasks" : "/tasks/new"} className="btn btn-primary btn-sm">
            {q || filtersActive ? "Clear filters" : "✨ Capture a task"}
          </Link>
        </div>
      ) : isBoard ? (
        <BoardView rows={rows} hrefParams={rowParamsQS} />
      ) : (
        <ListView rows={rows} users={allUsers} group={group} rowHref={rowHrefForTask} canAssignOthers={canAssignOthers} />
      )}

      {/* ------------------------- pagination ------------------------- */}
      {totalPages > 1 ? (
        <div className="pagination">
          {page > 1 ? (
            <Link href={baseQuery({ page: String(page - 1) })} className="btn btn-ghost btn-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="m15 18-6-6 6-6" />
              </svg>
              Prev
            </Link>
          ) : (
            <span className="btn btn-ghost btn-sm disabled" style={{ opacity: 0.3 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="m15 18-6-6 6-6" />
              </svg>
              Prev
            </span>
          )}
          <span className="pagination-info">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, visibleCount)} of {visibleCount}
          </span>
          {page < totalPages ? (
            <Link href={baseQuery({ page: String(page + 1) })} className="btn btn-ghost btn-sm">
              Next
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Link>
          ) : (
            <span className="btn btn-ghost btn-sm disabled" style={{ opacity: 0.3 }}>
              Next
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </span>
          )}
        </div>
      ) : null}

      {/* Asana-style slide-over — Suspense so list renders without waiting for pane queries */}
      {taskId ? (
        <TaskPane>
          <Suspense fallback={<TaskPaneSkeleton />}>
            <TaskPaneContent taskId={taskId} />
          </Suspense>
        </TaskPane>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task pane loading skeleton
// ---------------------------------------------------------------------------
function TaskPaneSkeleton() {
  return (
    <div className="task-pane-inner animate-pulse">
      <div className="h-3 w-32 bg-panel-2 rounded mb-3" />
      <div className="h-6 w-3/4 bg-panel-2 rounded mb-4" />
      <div className="space-y-3 mb-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-4 bg-panel-2 rounded w-full" />
        ))}
      </div>
      <div className="h-20 bg-panel-2 rounded" />
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
  canAssignOthers,
}: {
  rows: any[];
  users: Array<{ id: string; name: string }>;
  group: GroupKey;
  rowHref: (id: string) => string;
  canAssignOthers: boolean;
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

          {/* Empty sections stay as a slim header + the Add task affordance
              below — the old "Drop a task here" line was both untrue (the
              list has no drop target) and repeated in every empty bucket,
              which swallowed the top half of the page once Overdue hit 0. */}
          {sec.items.length > 0
            ? sec.items.map((t) => <TaskRow key={t.id} t={t} users={users} rowHref={rowHref} canAssignOthers={canAssignOthers} />)
            : null}

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
  canAssignOthers,
}: {
  t: any;
  users: Array<{ id: string; name: string }>;
  rowHref: (id: string) => string;
  canAssignOthers: boolean;
}) {
  const overdue = isOverdue(t);
  const done = t.status === "done";
  const cancelled = t.status === "cancelled";

  return (
    <div className={`arow ${done ? "is-done" : ""} ${cancelled ? "is-cancelled" : ""}`}>
      {/* completion check — optimistic client control with a satisfying
          pop animation; guards cancelled tasks against accidental revival */}
      <div className="alist-cell-check">
        <DoneCheck taskId={t.id} done={done} cancelled={cancelled} />
      </div>

      <div className="alist-cell-title">
        <Link href={rowHref(t.id)} className="atitle" scroll={false}>
          {t.title}
        </Link>
        {t.recurrence && t.recurrence !== "none" ? (
          <span
            className="ml-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: "var(--accent-wash)", color: "var(--accent-2)" }}
            title={`Recurring task — repeats ${t.recurrence}`}
          >
            <span aria-hidden="true">↻</span>
            {t.recurrence}
          </span>
        ) : null}
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
            <AssigneeSelect taskId={t.id} assigneeId={t.assignee?.id ?? null} users={users} canAssignOthers={canAssignOthers} />
          </span>
        ) : (
          <AssigneeSelect taskId={t.id} assigneeId={null} users={users} canAssignOthers={canAssignOthers} />
        )}
      </div>

      <div className="alist-cell-status">
        <StatusSelect taskId={t.id} status={t.status} />
      </div>

      <div className={`alist-cell-due ${overdue ? "is-overdue" : ""}`}>
        {t.dueDate ? (
          // For closed tasks, show the static due date — the live countdown
          // would say "overdue 4h" on a task that was already done on time.
          done || cancelled ? (
            <span className="text-text-3" title={fmtDate(t.dueDate)}>{fmtDate(t.dueDate)}</span>
          ) : (
            <span title={fmtDate(t.dueDate)}>{fmtDueCountdown(t.dueDate)}</span>
          )
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
