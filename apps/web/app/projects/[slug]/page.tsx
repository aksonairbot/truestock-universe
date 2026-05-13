import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, projects, products, tasks, users, eq, asc, desc } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { StatusSelect, AssigneeSelect } from "../../tasks/inline-controls";
import { createTask } from "../../tasks/actions";
import { ProjectBanner } from "../project-banner";
import { ProjectPulse } from "./project-pulse";
import { ProjectSummaryCard } from "./project-summary-card";

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
const STATUS_ORDER = ["in_progress", "review", "todo", "backlog", "done", "cancelled"] as const;

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
  await getCurrentUser();
  const db = getDb();

  const [project] = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      name: projects.name,
      description: projects.description,
      color: projects.color,
      productSlug: products.slug,
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
      assignee: { id: users.id, name: users.name },
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(eq(tasks.projectId, project.id))
    .orderBy(asc(tasks.status), desc(tasks.priority), desc(tasks.createdAt));

  const allUsers = await db.select({ id: users.id, name: users.name }).from(users);

  const grouped: Record<string, typeof taskRows> = {
    backlog: [], todo: [], in_progress: [], review: [], done: [], cancelled: [],
  };
  for (const t of taskRows) {
    const bucket = grouped[t.status] ?? grouped.todo;
    if (bucket) bucket.push(t);
  }

  return (
    <div className="page-content">
      <ProjectBanner
        slug={project.slug}
        title={project.name}
        productLabel={project.productSlug ?? null}
        color={project.color}
        description={project.description}
        height="tall"
      />

      <Suspense fallback={<div className="card text-text-3 text-[12px] py-3 px-4">Loading AI summary…</div>}>
        <ProjectSummaryCard projectId={project.id} />
      </Suspense>

      <div className="page-head" style={{ marginTop: 16 }}>
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <span
              className="inline-block w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: project.color ?? "var(--text-3)" }}
            />
            <div className="page-title truncate">{project.name}</div>
            {project.productSlug ? (
              <span className={`pchip ${project.productSlug}`}>{project.productSlug}</span>
            ) : null}
          </div>
          <div className="page-sub flex items-center gap-2 flex-wrap">
            <Link href="/projects" className="hover:text-text">Projects</Link>
            <span className="text-text-4">·</span>
            <span className="mono">{project.slug}</span>
            {project.ownerName ? (
              <>
                <span className="text-text-4">·</span>
                <span>owned by {project.ownerName}</span>
              </>
            ) : null}
            <span className="text-text-4">·</span>
            <span>{taskRows.length} task{taskRows.length === 1 ? "" : "s"}</span>
          </div>
          {project.description ? (
            <div className="text-text-2 text-[13px] mt-3 max-w-2xl">{project.description}</div>
          ) : null}
        </div>
        <Link href="/tasks" className="btn btn-ghost">All tasks →</Link>
      </div>

      {/* quick add */}
      <form action={createTask} className="card mb-5 flex flex-wrap items-end gap-3">
        <input type="hidden" name="projectSlug" value={project.slug} />
        <input type="hidden" name="status" value="todo" />
        <input type="hidden" name="priority" value="med" />
        <label className="flex-1 min-w-[200px] flex flex-col gap-1.5">
          <span className="text-[11px] text-text-3 uppercase tracking-wider font-medium">Quick add task</span>
          <input
            name="title"
            type="text"
            required
            placeholder="Task title — Enter to create"
            className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-[13px] w-full"
          />
        </label>
        <button type="submit" className="btn btn-primary">Add</button>
      </form>

      <div className="project-with-pulse">
      <div className="project-with-pulse-main">
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
                <div className="px-4 py-2.5 bg-panel-2 border-b border-border text-[11px] uppercase tracking-wider text-text-3 font-semibold flex items-center gap-2">
                  <span
                    className="inline-block rounded-full"
                    style={{ width: 8, height: 8, background: STATUS_DOT[s] }}
                  />
                  {STATUS_LABEL[s]} <span className="text-text-4 font-normal">· {items.length}</span>
                </div>
                <table className="tbl">
                  <tbody>
                    {items.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <Link href={`/tasks/${t.id}`} className="font-medium hover:text-accent-2">
                            {t.title}
                          </Link>
                        </td>
                        <td className="w-44">
                          <AssigneeSelect taskId={t.id} assigneeId={t.assignee?.id ?? null} users={allUsers} />
                        </td>
                        <td className="w-40">
                          <StatusSelect taskId={t.id} status={t.status} />
                        </td>
                        <td className="w-20">
                          <span className={`prio ${t.priority}`}>{t.priority}</span>
                        </td>
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
      </div>
      <Suspense fallback={<div className="card text-text-3 text-[12px] py-3 px-4">Loading pulse…</div>}>
        <ProjectPulse projectId={project.id} />
      </Suspense>
      </div>
    </div>
  );
}
