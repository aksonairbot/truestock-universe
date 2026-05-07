import Link from "next/link";
import { getDb, tasks, projects, users, eq, desc } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { StatusSelect, AssigneeSelect } from "./inline-controls";

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
const BOARD_COLUMNS = ["backlog", "todo", "in_progress", "review", "done"] as const;

function fmtDate(d: string | Date | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

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

interface PageProps {
  searchParams: Promise<{ view?: string }>;
}

export default async function TasksPage({ searchParams }: PageProps) {
  const { view } = await searchParams;
  const isBoard = view === "board";
  const me = await getCurrentUser();
  const db = getDb();

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      createdAt: tasks.createdAt,
      project: { slug: projects.slug, name: projects.name, color: projects.color },
      assignee: { id: users.id, name: users.name },
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .orderBy(desc(tasks.createdAt));

  const allUsers = await db.select({ id: users.id, name: users.name }).from(users);
  const open = rows.filter((r) => r.status !== "done" && r.status !== "cancelled").length;

  return (
    <div className="page-content">
      <div className="page-head">
        <div>
          <div className="page-title">Tasks</div>
          <div className="page-sub">
            {rows.length} total · {open} open · signed in as <span className="mono">{me.email}</span>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <div className="inline-flex rounded-md border border-border-2 overflow-hidden">
            <Link
              href="/tasks"
              className={`px-3 py-1.5 text-[13px] transition ${!isBoard ? "bg-panel-2 text-text" : "text-text-2 hover:text-text"}`}
            >
              List
            </Link>
            <Link
              href="/tasks?view=board"
              className={`px-3 py-1.5 text-[13px] transition ${isBoard ? "bg-panel-2 text-text" : "text-text-2 hover:text-text"}`}
            >
              Board
            </Link>
          </div>
          <Link href="/tasks/new" className="btn btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New task
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-text-2 mb-2">No tasks yet.</div>
          <Link href="/tasks/new" className="text-accent-2 hover:underline text-[13px]">
            Create the first one →
          </Link>
        </div>
      ) : isBoard ? (
        <BoardView rows={rows} users={allUsers} />
      ) : (
        <ListView rows={rows} users={allUsers} />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// List view — uses .tbl
// -----------------------------------------------------------------------------
function ListView({
  rows,
  users,
}: {
  rows: any[];
  users: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="card p-0 overflow-hidden">
      <table className="tbl">
        <thead>
          <tr>
            <th>Title</th>
            <th>Project</th>
            <th>Assignee</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td>
                <Link href={`/tasks/${t.id}`} className="font-medium hover:text-accent-2">
                  {t.title}
                </Link>
              </td>
              <td>
                <Link href={`/projects/${t.project.slug}`} className={`pchip ${t.project.slug}`}>
                  {t.project.name}
                </Link>
              </td>
              <td>
                <AssigneeSelect taskId={t.id} assigneeId={t.assignee?.id ?? null} users={users} />
              </td>
              <td>
                <StatusSelect taskId={t.id} status={t.status} />
              </td>
              <td>
                <span className={`prio ${t.priority}`}>{t.priority}</span>
              </td>
              <td className="mono text-[12px] text-text-2">{fmtDate(t.dueDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Kanban — uses .kanban / .kcol / .tcard / .ttag / .tava / .tdue
// -----------------------------------------------------------------------------
function BoardView({
  rows,
  users,
}: {
  rows: any[];
  users: Array<{ id: string; name: string }>;
}) {
  const grouped: Record<string, any[]> = {
    backlog: [],
    todo: [],
    in_progress: [],
    review: [],
    done: [],
    cancelled: [],
  };
  for (const t of rows) {
    const bucket = grouped[t.status] ?? grouped.todo;
    if (bucket) bucket.push(t);
  }

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
                <Link key={t.id} href={`/tasks/${t.id}`} className="tcard no-underline">
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
                    <span className={`tdue ${t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "done" ? "red" : ""}`}>
                      {t.dueDate ? fmtDate(t.dueDate) : ""}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
