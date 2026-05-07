import Link from "next/link";
import { getDb, tasks, projects, users, eq, desc } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { StatusSelect, AssigneeSelect } from "./inline-controls";

export const dynamic = "force-dynamic";

const PRIORITY_BADGE: Record<string, string> = {
  low: "bg-panel-2 text-text-2",
  med: "bg-panel-2 text-text",
  high: "bg-amber-500/15 text-amber-400",
  urgent: "bg-red-500/15 text-red-400",
};

const STATUS_LABEL: Record<string, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
  cancelled: "Cancelled",
};
const BOARD_COLUMNS = ["backlog", "todo", "in_progress", "review", "done"] as const;

function fmtDate(d: string | Date | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
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
      assignee: { id: users.id, name: users.name, email: users.email },
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .orderBy(desc(tasks.createdAt));

  const allUsers = await db.select({ id: users.id, name: users.name }).from(users);

  return (
    <div className="min-h-screen px-6 md:px-8 py-6 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Tasks</div>
          <div className="text-text-2 text-sm mt-1">
            Signed in as <span className="mono">{me.email}</span> · {rows.length} task
            {rows.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="flex gap-2 text-sm items-center">
          <div className="inline-flex rounded-md border border-border-2 overflow-hidden">
            <Link
              href="/tasks"
              className={`px-3 py-1.5 transition ${!isBoard ? "bg-panel-2 text-text" : "text-text-2 hover:text-text"}`}
            >
              List
            </Link>
            <Link
              href="/tasks?view=board"
              className={`px-3 py-1.5 transition ${isBoard ? "bg-panel-2 text-text" : "text-text-2 hover:text-text"}`}
            >
              Board
            </Link>
          </div>
          <Link
            href="/tasks/new"
            className="bg-accent hover:bg-accent-2 text-white font-semibold rounded-md px-4 py-2 transition"
          >
            + New task
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-text-2 mb-2">No tasks yet.</div>
          <Link href="/tasks/new" className="text-accent-2 hover:underline text-sm">
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
// List view
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
      <table className="w-full text-sm">
        <thead className="text-xs text-text-3 uppercase tracking-wider">
          <tr className="border-b border-border">
            <th className="text-left px-4 py-3 font-medium">Title</th>
            <th className="text-left px-4 py-3 font-medium">Project</th>
            <th className="text-left px-4 py-3 font-medium">Assignee</th>
            <th className="text-left px-4 py-3 font-medium">Status</th>
            <th className="text-left px-4 py-3 font-medium">Priority</th>
            <th className="text-left px-4 py-3 font-medium">Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-b border-border last:border-b-0 hover:bg-panel-2">
              <td className="px-4 py-3 font-medium">
                <Link href={`/tasks/${t.id}`} className="hover:text-accent-2">
                  {t.title}
                </Link>
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/projects/${t.project.slug}`}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs hover:underline"
                  style={{
                    backgroundColor: t.project.color ? `${t.project.color}22` : undefined,
                    color: t.project.color ?? undefined,
                  }}
                >
                  {t.project.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-text-2">
                <AssigneeSelect taskId={t.id} assigneeId={t.assignee?.id ?? null} users={users} />
              </td>
              <td className="px-4 py-3">
                <StatusSelect taskId={t.id} status={t.status} />
              </td>
              <td className="px-4 py-3">
                <span className={`inline-block px-2 py-0.5 rounded text-xs ${PRIORITY_BADGE[t.priority]}`}>
                  {t.priority}
                </span>
              </td>
              <td className="px-4 py-3 text-text-2 mono text-xs">{fmtDate(t.dueDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Board (kanban) view
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
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {BOARD_COLUMNS.map((s) => {
        const items = grouped[s] ?? [];
        return (
          <div key={s} className="bg-panel/50 border border-border rounded-md flex flex-col min-h-[200px]">
            <div className="px-3 py-2 border-b border-border text-xs uppercase tracking-wider text-text-3 font-medium flex items-center justify-between">
              <span>{STATUS_LABEL[s]}</span>
              <span className="text-text-3 font-normal">{items.length}</span>
            </div>
            <div className="p-2 flex flex-col gap-2 flex-1">
              {items.length === 0 ? (
                <div className="text-text-3 italic text-xs px-2 py-4 text-center">empty</div>
              ) : (
                items.map((t) => (
                  <div key={t.id} className="bg-panel border border-border rounded-md p-3 hover:border-accent-2/40 transition">
                    <Link href={`/tasks/${t.id}`} className="font-medium text-sm hover:text-accent-2 block mb-2">
                      {t.title}
                    </Link>
                    <Link
                      href={`/projects/${t.project.slug}`}
                      className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] mb-2"
                      style={{
                        backgroundColor: t.project.color ? `${t.project.color}22` : undefined,
                        color: t.project.color ?? undefined,
                      }}
                    >
                      {t.project.name}
                    </Link>
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${PRIORITY_BADGE[t.priority]}`}
                      >
                        {t.priority}
                      </span>
                      <span className="text-[10px] text-text-3 mono">
                        {t.dueDate ? fmtDate(t.dueDate) : ""}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[10px]">
                      <StatusSelect taskId={t.id} status={t.status} />
                    </div>
                    {t.assignee?.name ? (
                      <div className="mt-2 text-[10px] text-text-3">
                        → {t.assignee.name}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
