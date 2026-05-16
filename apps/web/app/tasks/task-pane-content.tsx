// apps/web/app/tasks/task-pane-content.tsx
//
// Server component — fetches a single task + its comments and renders the
// body of the slide-over. Mirrors /tasks/[id]/page.tsx but is laid out for a
// 480px panel: stacked sections instead of a 2-column layout.

import Link from "next/link";
import {
  getDb,
  tasks,
  projects,
  users,
  taskComments,
  taskAttachments,
  eq,
  asc,
  sql,
} from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { getActiveUsers } from "@/lib/cached-queries";
import {
  StatusSelect,
  AssigneeSelect,
  PrioritySelect,
} from "./inline-controls";
import { addComment, updateTaskMeta, cancelTask, deleteTask } from "./actions";
import { fmtDueCountdown } from "@/lib/worktime";
import { SubtaskList } from "./subtask-list";
import { TaskAttachments } from "./task-attachments";
import { ReviewActions } from "./review-actions";

const PRIORITY_BADGE: Record<string, string> = {
  low: "bg-panel-2 text-text-2",
  med: "bg-panel-2 text-text",
  high: "bg-amber-500/15 text-amber-400",
  urgent: "bg-red-500/15 text-red-400",
};

function fmtDate(d: string | Date | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}
function fmtTime(d: Date): string {
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function avaClass(name?: string | null): string {
  if (!name) return "h1";
  const sum = [...name].reduce((s, c) => s + c.charCodeAt(0), 0);
  return ["h1", "h2", "h3", "h4"][sum % 4]!;
}
function avaInitial(name?: string | null): string {
  if (!name) return "?";
  return name.trim()[0]?.toUpperCase() ?? "?";
}

export async function TaskPaneContent({ taskId }: { taskId: string }) {
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
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!task) {
    return (
      <div className="card text-center py-8">
        <div className="text-text-2">Task not found.</div>
      </div>
    );
  }

  // Parallel fetch: creator + users + comments + subtasks + attachments (no waterfall)
  const [creatorArr, allUsers, comments, subtaskRows, attachmentRows] = await Promise.all([
    task.createdById
      ? db.select({ name: users.name }).from(users).where(eq(users.id, task.createdById)).limit(1)
      : Promise.resolve([undefined]),
    getActiveUsers(),
    db
      .select({
        id: taskComments.id,
        body: taskComments.body,
        kind: taskComments.kind,
        createdAt: taskComments.createdAt,
        author: { id: users.id, name: users.name, email: users.email },
      })
      .from(taskComments)
      .leftJoin(users, eq(taskComments.authorId, users.id))
      .where(eq(taskComments.taskId, task.id))
      .orderBy(asc(taskComments.createdAt)),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        assigneeName: users.name,
        assigneeId: tasks.assigneeId,
        dueDate: tasks.dueDate,
        dueTime: tasks.dueTime,
      })
      .from(tasks)
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .where(sql`${tasks.parentTaskId} = ${task.id}`)
      .orderBy(asc(tasks.createdAt)),
    db
      .select({
        id: taskAttachments.id,
        filename: taskAttachments.filename,
        mime: taskAttachments.mime,
        sizeBytes: taskAttachments.sizeBytes,
      })
      .from(taskAttachments)
      .where(eq(taskAttachments.taskId, task.id))
      .orderBy(asc(taskAttachments.createdAt)),
  ]);
  const [creator] = creatorArr;

  // ----- duration insight: how many days has this task been open -----
  const todayIST = new Date(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()) + "T12:00:00+05:30");
  const createdMs = task.createdAt instanceof Date ? task.createdAt.getTime() : new Date(task.createdAt).getTime();
  const endMs = task.completedAt
    ? (task.completedAt instanceof Date ? task.completedAt.getTime() : new Date(task.completedAt).getTime())
    : todayIST.getTime();
  const ageDays = Math.max(0, Math.floor((endMs - createdMs) / 86400000));


  return (
    <div className="task-pane-inner">
      {/* breadcrumb */}
      <div className="text-text-3 text-xs mb-3 flex items-center gap-2">
        <Link href={`/projects/${task.project.slug}`} className="hover:text-text">
          <span
            className="inline-block w-2 h-2 rounded-full align-middle mr-1.5"
            style={{ backgroundColor: task.project.color ?? "#888" }}
          />
          {task.project.name}
        </Link>
        <span>·</span>
        <span className="mono text-text-3">{task.id.slice(0, 8)}</span>
      </div>

      <h1 className="text-xl font-semibold tracking-tight mb-3">{task.title}</h1>

      {/* meta strip */}
      <div className="task-pane-meta">
        <div className="task-pane-meta-row">
          <span className="task-pane-meta-label">Assignee</span>
          <span className="task-pane-meta-val">
            {task.assigneeName ? (
              <span className="aassignee">
                <span className={`tava ${avaClass(task.assigneeName)}`}>
                  {avaInitial(task.assigneeName)}
                </span>
                <AssigneeSelect taskId={task.id} assigneeId={task.assigneeId} users={allUsers} />
              </span>
            ) : (
              <AssigneeSelect taskId={task.id} assigneeId={null} users={allUsers} />
            )}
          </span>
        </div>
        <div className="task-pane-meta-row">
          <span className="task-pane-meta-label">Status</span>
          <span className="task-pane-meta-val">
            <StatusSelect taskId={task.id} status={task.status} />
          </span>
        </div>
        <div className="task-pane-meta-row">
          <span className="task-pane-meta-label">Priority</span>
          <span className="task-pane-meta-val">
            <PrioritySelect
              taskId={task.id}
              title={task.title}
              description={task.description}
              dueDate={task.dueDate}
              priority={task.priority}
            />
            <span className={`ml-2 inline-block px-2 py-0.5 rounded text-xs ${PRIORITY_BADGE[task.priority]}`}>
              {task.priority}
            </span>
          </span>
        </div>
        <div className="task-pane-meta-row">
          <span className="task-pane-meta-label">Due</span>
          <span className="task-pane-meta-val" title={fmtDate(task.dueDate)}>{fmtDueCountdown(task.dueDate)}</span>
        </div>
      </div>

      {/* duration insight */}
      <div className={`duration-chip ${!task.completedAt && ageDays > 14 ? "is-overrun" : ""}`}>
        <span className="duration-label">Day {ageDays + 1}</span>
        {task.completedAt ? (
          <span className="duration-state">closed in {ageDays}d</span>
        ) : ageDays > 14 ? (
          <span className="duration-state is-warn">running long</span>
        ) : null}
      </div>

      {/* subtasks (client-side, optimistic) */}
      <SubtaskList
        parentId={task.id}
        initialSubtasks={subtaskRows.map((s) => ({
          id: s.id,
          title: s.title,
          status: s.status,
          assigneeName: s.assigneeName,
          assigneeId: s.assigneeId,
          dueDate: s.dueDate,
          dueTime: s.dueTime,
        }))}
        users={allUsers}
      />

      {/* attachments */}
      <TaskAttachments
        taskId={task.id}
        attachments={attachmentRows.map((a) => ({
          id: a.id,
          filename: a.filename,
          mime: a.mime,
          sizeBytes: Number(a.sizeBytes),
          url: `/api/attachments/${a.id}`,
        }))}
        disabled={task.status === "done" || task.status === "cancelled"}
      />

      {/* description */}
      <h3 className="task-pane-section-h">Description</h3>
      {task.description ? (
        <div className="card mb-4 whitespace-pre-wrap text-sm leading-relaxed text-text">
          {task.description}
        </div>
      ) : (
        <div className="text-text-3 italic text-sm mb-4">No description</div>
      )}

      {/* inline edit — visible for open tasks, hidden for done/cancelled */}
      {task.status !== "done" && task.status !== "cancelled" ? (
        <>
          <h3 className="task-pane-section-h">Edit</h3>
          <form action={updateTaskMeta} className="card mb-4 grid grid-cols-1 gap-3">
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
                rows={4}
                defaultValue={task.description ?? ""}
                className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-sm w-full"
              ></textarea>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-3 uppercase tracking-wider">Due in <span style={{color:'var(--danger)'}}>*</span></span>
              <input
                name="dueDate"
                type="text"
                required
                defaultValue={task.dueDate ?? ""}
                placeholder="e.g. 3d, 8h, 2d 4h (max 10d)"
                className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-sm w-44"
              />
              <span className="text-[10px] text-text-4">Working hours: Mon–Fri, 9–6 PM · max 10 working days</span>
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
        </>
      ) : null}

      {/* Review actions — visible only for managers/admins when task is in review */}
      {task.status === "review" && (me.role === "admin" || me.role === "manager") && (
        <ReviewActions taskId={task.id} />
      )}

      {/* comments */}
      <h3 className="task-pane-section-h">
        Comments <span className="text-text-3 font-normal">· {comments.length}</span>
      </h3>
      {comments.length === 0 ? (
        <div className="text-text-3 italic text-sm mb-3">No comments yet.</div>
      ) : (
        <div className="space-y-2 mb-3">
          {comments.map((c) => (
            <div key={c.id} className="task-pane-comment">
              <div className="task-pane-comment-head">
                <span className={`tava ${avaClass(c.author?.name)}`}>
                  {avaInitial(c.author?.name)}
                </span>
                <span className="font-medium">{c.author?.name ?? "(unknown)"}</span>
                {c.kind === "review_approve" && (
                  <span className="comment-review-badge approved">✓ Approved</span>
                )}
                {c.kind === "review_revise" && (
                  <span className="comment-review-badge revision">↩ Revision</span>
                )}
                <span className="text-text-3 font-normal ml-auto text-xs">
                  {fmtTime(c.createdAt)}
                </span>
              </div>
              <div className="task-pane-comment-body">{c.body}</div>
            </div>
          ))}
        </div>
      )}

      <form action={addComment} className="task-pane-composer">
        <input type="hidden" name="taskId" value={task.id} />
        <textarea
          name="body"
          rows={2}
          required
          placeholder={`Add a comment as ${me.name}…`}
          className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-sm w-full"
        ></textarea>
        <div className="flex justify-end mt-2">
          <button
            type="submit"
            className="bg-accent hover:bg-accent-2 text-white font-semibold text-sm rounded-md px-4 py-2 transition"
          >
            Post comment
          </button>
        </div>
      </form>

      {/* footer meta */}
      <div className="task-pane-footer text-text-3 text-xs">
        <div>Created {fmtTime(task.createdAt)}{creator?.name ? ` by ${creator.name}` : ""}</div>
        {task.startedAt ? <div>Started {fmtTime(task.startedAt)}</div> : null}
        {task.completedAt ? <div>Completed {fmtTime(task.completedAt)}</div> : null}
      </div>

      {/* retire actions */}
      {task.status !== "cancelled" && task.status !== "done" ? (
        <div className="task-pane-retire">
          <form action={cancelTask} className="inline">
            <input type="hidden" name="taskId" value={task.id} />
            <button
              type="submit"
              className="btn btn-ghost btn-sm"
              title="Mark this task as cancelled — keeps it in the history"
            >
              Cancel task
            </button>
          </form>
          {task.assigneeId === null ? (
            <form action={deleteTask} className="inline">
              <input type="hidden" name="taskId" value={task.id} />
              <button
                type="submit"
                className="btn btn-ghost btn-sm"
                style={{ color: "var(--danger)" }}
                title="Permanently delete this task"
              >
                Delete
              </button>
            </form>
          ) : (
            <span
              className="text-[11px] text-text-3"
              title="Assigned tasks can't be deleted — Cancel keeps the activity in the daily summary."
            >
              Assigned · Cancel only
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
