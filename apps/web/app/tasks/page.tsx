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

function fmtDate(d: string | Date | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default async function TasksPage() {
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
        <div className="flex gap-2 text-sm">
          <Link
            href="/tasks/new"
            className="bg-accent hover:bg-accent-2 text-white font-semibold rounded-md px-4 py-2 transition"
          >
            + New task
          </Link>
          <Link href="/mis/revenue" className="text-text-2 hover:text-text px-3 py-2">
            Revenue →
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
      ) : (
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
                  <td className="px-4 py-3 font-medium">{t.title}</td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs"
                      style={{
                        backgroundColor: t.project.color ? `${t.project.color}22` : undefined,
                        color: t.project.color ?? undefined,
                      }}
                    >
                      {t.project.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-2">
                    <AssigneeSelect taskId={t.id} assigneeId={t.assignee?.id ?? null} users={allUsers} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusSelect taskId={t.id} status={t.status} />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs ${PRIORITY_BADGE[t.priority]}`}
                    >
                      {t.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-2 mono text-xs">{fmtDate(t.dueDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
