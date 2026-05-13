import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getDb,
  tasks,
  projects,
  users,
  taskComments,
  eq,
  asc,
} from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import {
  StatusSelect,
  AssigneeSelect,
  PrioritySelect,
} from "../inline-controls";
import { addComment, updateTaskMeta, cancelTask, deleteTask } from "../actions";
import { fmtDueCountdown } from "@/lib/worktime";

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
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTime(d: Date): string {
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TaskDetailPage({ params }: PageProps) {
  const { id } = await params;
  const me = await getCurrentUser();
  const db = getDb();

  const [task] = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      startedAt: tasks.startedAt,
      completedAt: tasks.completedAt,
      assigneeId: tasks.assigneeId,
      project: { slug: projects.slug, name: projects.name, color: projects.color },
      assigneeName: users.name,
      createdById: tasks.createdById,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(eq(tasks.id, id))
    .limit(1);

  if (!task) notFound();

  const [creator] = task.createdById
    ? await db.select({ name: users.name }).from(users).where(eq(users.id, task.createdById)).limit(1)
    : [undefined];

  const allUsers = await db.select({ id: users.id, name: users.name }).from(users);

  const comments = await db
    .select({
      id: taskComments.id,
      body: taskComments.body,
      createdAt: taskComments.createdAt,
      author: { id: users.id, name: users.name, email: users.email },
    })
    .from(taskComments)
    .leftJoin(users, eq(taskComments.authorId, users.id))
    .where(eq(taskComments.taskId, task.id))
    .orderBy(asc(taskComments.createdAt));

  return (
    <div className="min-h-screen px-6 md:px-8 py-6 max-w-[1100px] mx-auto">
      {/* breadcrumb */}
      <div className="text-text-3 text-xs mb-3 flex items-center gap-2">
        <Link href="/tasks" className="hover:text-text">Tasks</Link>
        <span>›</span>
        <Link href={`/projects/${task.project.slug}`} className="hover:text-text">
          {task.project.name}
        </Link>
        <span>›</span>
        <span className="mono text-text-3">{task.id.slice(0, 8)}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* main column */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight mb-2">{task.title}</h1>

          {task.description ? (
            <div className="card mb-4 whitespace-pre-wrap text-sm leading-relaxed text-text">
              {task.description}
            </div>
          ) : (
            <div className="text-text-3 italic text-sm mb-4">No description</div>
          )}

          {/* edit metadata (collapsed) */}
          <details className="mb-6">
            <summary className="text-sm text-text-2 hover:text-text cursor-pointer">
              Edit title, description, due date
            </summary>
            <form action={updateTaskMeta} className="card mt-2 grid grid-cols-1 gap-3">
              <input type="hidden" name="taskId" value={task.id} />
              <input type="hidden" name="priority" value={task.priority} />
              <label className="flex flex-col gap-1">
                <span className="text-xs text-text-3 uppercase tracking-wider">Title</span>
                <input
                  name="title"
                  type="text"
                  required
                  defaultValue={task.title}
                  className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-sm w-full"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-text-3 uppercase tracking-wider">Description</span>
                <textarea
                  name="description"
                  rows={5}
                  defaultValue={task.description ?? ""}
                  className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-sm w-full"
                ></textarea>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-text-3 uppercase tracking-wider">Due date</span>
                <input
                  name="dueDate"
                  type="text"
                  defaultValue={task.dueDate ?? ""}
                  placeholder="e.g. 3d, 8h, 2d 4h"
                  className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-sm w-44"
                />
                <span className="text-[10px] text-text-4">Working hours: Mon–Fri, 9–6 PM</span>
              </label>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="bg-accent hover:bg-accent-2 text-white font-semibold text-sm rounded-md px-4 py-2 transition"
                >
                  Save
                </button>
              </div>
            </form>
          </details>

          {/* comments */}
          <h2 className="text-base font-semibold mb-3">
            Comments <span className="text-text-3 font-normal">· {comments.length}</span>
          </h2>
          {comments.length === 0 ? (
            <div className="text-text-3 italic text-sm mb-4">No comments yet.</div>
          ) : (
            <div className="space-y-3 mb-4">
              {comments.map((c) => (
                <div key={c.id} className="card">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium">
                      {c.author?.name ?? "(unknown)"}
                      <span className="text-text-3 font-normal ml-2">
                        {fmtTime(c.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-text-2">
                    {c.body}
                  </div>
                </div>
              ))}
            </div>
          )}

          <form action={addComment} className="card">
            <input type="hidden" name="taskId" value={task.id} />
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-3 uppercase tracking-wider">
                Add a comment as {me.name}
              </span>
              <textarea
                name="body"
                rows={3}
                required
                placeholder="Markdown supported (rendered as plain text for now)"
                className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-sm w-full"
              ></textarea>
            </label>
            <div className="flex justify-end mt-2">
              <button
                type="submit"
                className="bg-accent hover:bg-accent-2 text-white font-semibold text-sm rounded-md px-4 py-2 transition"
              >
                Post comment
              </button>
            </div>
          </form>
        </div>

        {/* sidebar */}
        <aside className="space-y-3 text-sm">
          <div className="card">
            <div className="text-xs text-text-3 uppercase tracking-wider mb-1">Project</div>
            <Link
              href={`/projects/${task.project.slug}`}
              className="inline-flex items-center gap-2 hover:text-accent-2"
            >
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: task.project.color ?? "#888" }}
              />
              {task.project.name}
            </Link>
          </div>

          <div className="card">
            <div className="text-xs text-text-3 uppercase tracking-wider mb-1">Status</div>
            <StatusSelect taskId={task.id} status={task.status} />
          </div>

          <div className="card">
            <div className="text-xs text-text-3 uppercase tracking-wider mb-1">Assignee</div>
            <AssigneeSelect taskId={task.id} assigneeId={task.assigneeId} users={allUsers} />
          </div>

          <div className="card">
            <div className="text-xs text-text-3 uppercase tracking-wider mb-1">Priority</div>
            <PrioritySelect
              taskId={task.id}
              title={task.title}
              description={task.description}
              dueDate={task.dueDate}
              priority={task.priority}
            />
            <div className={`mt-2 inline-block px-2 py-0.5 rounded text-xs ${PRIORITY_BADGE[task.priority]}`}>
              {task.priority}
            </div>
          </div>

          <div className="card">
            <div className="text-xs text-text-3 uppercase tracking-wider mb-1">Due</div>
            <div className="font-medium" title={fmtDate(task.dueDate)}>{fmtDueCountdown(task.dueDate)}</div>
          </div>

          <div className="card text-text-3 text-xs">
            <div>Created {fmtTime(task.createdAt)}</div>
            {creator?.name ? <div>by {creator.name}</div> : null}
            {task.startedAt ? (
              <div>Started {fmtTime(task.startedAt)}</div>
            ) : null}
            {task.completedAt ? (
              <div>Completed {fmtTime(task.completedAt)}</div>
            ) : null}
          </div>

          {/* Retire actions — Cancel always; Delete only when unassigned. */}
          {task.status !== "cancelled" && task.status !== "done" ? (
            <div className="card">
              <div className="text-xs text-text-3 uppercase tracking-wider mb-2">Retire</div>
              <div className="flex flex-col gap-2">
                <form action={cancelTask}>
                  <input type="hidden" name="taskId" value={task.id} />
                  <button
                    type="submit"
                    className="btn btn-ghost btn-sm w-full justify-center"
                    title="Mark this task as cancelled — keeps it in the history"
                  >
                    Cancel task
                  </button>
                </form>
                {task.assigneeId === null ? (
                  <form action={deleteTask}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <button
                      type="submit"
                      className="btn btn-ghost btn-sm w-full justify-center"
                      style={{ color: "var(--danger)" }}
                      title="Permanently delete this task"
                    >
                      Delete
                    </button>
                  </form>
                ) : (
                  <div
                    className="text-[11px] text-text-3 leading-relaxed text-center px-2 py-1.5 rounded-md border border-border-2"
                    title="Assigned tasks can't be deleted — Cancel keeps the activity in the daily summary."
                  >
                    Assigned tasks can't be deleted.<br />
                    Use Cancel instead.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
