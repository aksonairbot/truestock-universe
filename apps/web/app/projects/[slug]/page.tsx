import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, projects, products, tasks, users, eq, desc, asc } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { StatusSelect, AssigneeSelect } from "../../tasks/inline-controls";
import { createTask } from "../../tasks/actions";

export const dynamic = "force-dynamic";

const PRIORITY_BADGE: Record<string, string> = {
  low: "bg-panel-2 text-text-2",
  med: "bg-panel-2 text-text",
  high: "bg-amber-500/15 text-amber-400",
  urgent: "bg-red-500/15 text-red-400",
};

function fmtDate(d: string | Date | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const me = await getCurrentUser();
  const db = getDb();

  const [project] = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      name: projects.name,
      description: projects.description,
      color: projects.color,
      productSlug: products.slug,
      productName: products.name,
      ownerName: users.name,
    })
    .from(projects)
    .leftJoin(products, eq(projects.productId, products.id))
    .leftJoin(users, eq(projects.ownerId, users.id))
    .where(eq(projects.slug, slug))
    .limit(1);

  if (!project) notFound();

  const taskRows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      createdAt: tasks.createdAt,
      assignee: { id: users.id, name: users.name },
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(eq(tasks.projectId, project.id))
    .orderBy(asc(tasks.status), desc(tasks.priority), desc(tasks.createdAt));

  const allUsers = await db.select({ id: users.id, name: users.name }).from(users);

  const grouped: Record<string, typeof taskRows> = {
    backlog: [],
    todo: [],
    in_progress: [],
    review: [],
    done: [],
    cancelled: [],
  };
  for (const t of taskRows) {
    const bucket = grouped[t.status] ?? grouped.todo; if (bucket) bucket.push(t);
  }
  const STATUS_ORDER = ["in_progress", "review", "todo", "backlog", "done", "cancelled"] as const;
  const STATUS_LABEL: Record<string, string> = {
    backlog: "Backlog",
    todo: "To do",
    in_progress: "In progress",
    review: "Review",
    done: "Done",
    cancelled: "Cancelled",
  };

  return (
    <div className="min-h-screen px-6 md:px-8 py-6 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span
              className="inline-block w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: project.color ?? "#888" }}
            />
            <h1 className="text-2xl font-semibold tracking-tight truncate">{project.name}</h1>
            {project.productSlug ? (
              <span className="text-[10px] uppercase tracking-wider text-text-3 bg-panel-2 px-1.5 py-0.5 rounded">
                {project.productSlug}
              </span>
            ) : null}
          </div>
          <div className="text-text-2 text-sm mt-1 flex items-center gap-2">
            <Link href="/projects" className="hover:text-text">
              Projects
            </Link>
            <span>·</span>
            <span className="mono">{project.slug}</span>
            {project.ownerName ? (
              <>
                <span>·</span>
                <span>owned by {project.ownerName}</span>
              </>
            ) : null}
            <span>·</span>
            <span>{taskRows.length} task{taskRows.length === 1 ? "" : "s"}</span>
          </div>
          {project.description ? (
            <div className="text-text-2 text-sm mt-3 max-w-2xl">{project.description}</div>
          ) : null}
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/tasks" className="text-text-2 hover:text-text px-3 py-2">
            All tasks →
          </Link>
        </div>
      </div>

      {/* quick add task form */}
      <form action={createTask} className="card mb-6 flex flex-wrap items-end gap-3">
        <input type="hidden" name="projectSlug" value={project.slug} />
        <input type="hidden" name="status" value="todo" />
        <input type="hidden" name="priority" value="med" />
        <label className="flex-1 min-w-[200px] flex flex-col gap-1">
          <span className="text-xs text-text-3 uppercase tracking-wider">Quick add task</span>
          <input
            name="title"
            type="text"
            required
            placeholder="Task title — Enter to create"
            className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-sm w-full"
          />
        </label>
        <button
          type="submit"
          className="bg-accent hover:bg-accent-2 text-white font-semibold text-sm rounded-md px-4 py-2 transition"
        >
          Add
        </button>
      </form>

      {/* tasks grouped by status */}
      {taskRows.length === 0 ? (
        <div className="card text-center py-16 text-text-2">
          No tasks in this project yet — use the quick-add above.
        </div>
      ) : (
        <div className="space-y-4">
          {STATUS_ORDER.map((s) => {
            const items = grouped[s] ?? [];
            if (items.length === 0) return null;
            return (
              <div key={s} className="card p-0 overflow-hidden">
                <div className="px-4 py-2 bg-panel-2 border-b border-border text-xs uppercase tracking-wider text-text-3 font-medium">
                  {STATUS_LABEL[s]} · {items.length}
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {items.map((t) => (
                      <tr key={t.id} className="border-b border-border last:border-b-0 hover:bg-panel-2">
                        <td className="px-4 py-2 font-medium">{t.title}</td>
                        <td className="px-4 py-2 w-40">
                          <AssigneeSelect taskId={t.id} assigneeId={t.assignee?.id ?? null} users={allUsers} />
                        </td>
                        <td className="px-4 py-2 w-36">
                          <StatusSelect taskId={t.id} status={t.status} />
                        </td>
                        <td className="px-4 py-2 w-20">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs ${PRIORITY_BADGE[t.priority]}`}
                          >
                            {t.priority}
                          </span>
                        </td>
                        <td className="px-4 py-2 w-20 text-text-2 mono text-xs">{fmtDate(t.dueDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
