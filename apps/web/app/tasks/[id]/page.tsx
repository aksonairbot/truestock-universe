import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getDb,
  tasks,
  projects,
  users,
  taskComments,
  taskAttachments,
  taskLinks,
  eq,
  asc,
  sql,
  isNull,
} from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { getActiveUsers } from "@/lib/cached-queries";
import { isPrivileged, requireTaskAccess } from "@/lib/access";
import {
  StatusSelect,
  AssigneeSelect,
  PrioritySelect,
  RecurrenceSelect,
} from "../inline-controls";
import { addComment, updateTaskMeta, cancelTask, deleteTask } from "../actions";
import { fmtDueCountdown } from "@/lib/worktime";
import { Markdown } from "@/components/markdown";
import { SubtaskList } from "../subtask-list";
import { TaskAttachments } from "../task-attachments";
import { TaskLinks } from "../task-links";
import { ContentFields } from "../content-fields";
import { ContentApproval } from "../content-approval";
import { CampaignFields } from "../campaign-fields";
import { paiseToRupeeInput } from "@/lib/campaigns";
import { campaigns as campaignsTbl } from "@tu/db";
import { PublishPanel } from "../publish-panel";
import { isPublishConfigured } from "@/lib/upload-post";
import { ReviewActions } from "../review-actions";

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

/** Today (+ n days) as YYYY-MM-DD in IST — for date-input min/max. */
function isoIST(plusDays = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + plusDays);
  return d.toISOString().slice(0, 10);
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TaskDetailPage({ params }: PageProps) {
  const { id } = await params;
  const me = await getCurrentUser();
  const canAssignOthers = isPrivileged(me);
  const db = getDb();

  const [task] = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      recurrence: tasks.recurrence,
      contentChannel: tasks.contentChannel,
      contentStage: tasks.contentStage,
      publishAt: tasks.publishAt,
      contentApprovedById: tasks.contentApprovedById,
      contentApprovedAt: tasks.contentApprovedAt,
      complianceChecked: tasks.complianceChecked,
      publishState: tasks.publishState,
      publishedUrl: tasks.publishedUrl,
      publishedAt: tasks.publishedAt,
      publishError: tasks.publishError,
      campaignId: tasks.campaignId,
      budgetPaise: tasks.budgetPaise,
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

  // Everything below only needs the task id/createdById — run the access
  // check CONCURRENTLY with the data reads instead of serializing them
  // (previously: auth → task → access (re-fetch + dept scan) → data batch).
  const [accessOk, creatorArr, allUsers, campaignList, comments, subtaskRows, attachmentRows, linkRows] = await Promise.all([
    // Read-path data wall: mirrors the mutation-path check; renders 404
    // (not 403) so URLs don't leak task existence.
    requireTaskAccess(task.id, me).then(() => true).catch(() => false),

    task.createdById
      ? db.select({ name: users.name }).from(users).where(eq(users.id, task.createdById)).limit(1)
      : Promise.resolve([undefined] as Array<{ name: string } | undefined>),

    // Cross-request cached — was a full users-table select per view.
    getActiveUsers(),

    // Live campaigns to file this task under. Small table, cheap read.
    db
      .select({ id: campaignsTbl.id, name: campaignsTbl.name, status: campaignsTbl.status })
      .from(campaignsTbl)
      .where(isNull(campaignsTbl.archivedAt))
      .orderBy(asc(campaignsTbl.name)),

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

    // subtasks
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

    // attachments
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

    // external links (Figma / assets / published URLs)
    db
      .select({
        id: taskLinks.id,
        kind: taskLinks.kind,
        url: taskLinks.url,
        label: taskLinks.label,
      })
      .from(taskLinks)
      .where(eq(taskLinks.taskId, task.id))
      .orderBy(asc(taskLinks.createdAt)),
  ]);
  const [creator] = creatorArr;

  if (!accessOk) {
    // Rare fallback path: you may still view a parent task when one of its
    // subtasks is assigned to you (mirrors the list page's scope rule).
    const [mySubtask] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(sql`${tasks.parentTaskId} = ${task.id} and ${tasks.assigneeId} = ${me.id}`)
      .limit(1);
    if (!mySubtask) notFound();
  }

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
            <div className="card mb-4">
              <Markdown text={task.description} />
            </div>
          ) : (
            <div className="text-text-3 italic text-sm mb-4">No description</div>
          )}

          {/* edit metadata — visible for open tasks, hidden for done/cancelled */}
          {task.status !== "done" && task.status !== "cancelled" ? (
            <form action={updateTaskMeta} className="card mb-6 grid grid-cols-1 gap-3">
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
                <span className="text-xs text-text-3 uppercase tracking-wider">Due date <span style={{color:'var(--danger)'}}>*</span></span>
                <input
                  name="dueDate"
                  type="date"
                  required
                  defaultValue={task.dueDate ?? ""}
                  min={isoIST(0)}
                  max={isoIST(14)}
                  className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-sm w-44"
                />
                <span className="text-[10px] text-text-4">Up to 2 weeks out · shorthand like "3d" still works via quick capture</span>
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
          ) : null}

          {/* subtasks */}
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
            canAssignOthers={canAssignOthers}
          />

          <h3 className="text-xs text-text-3 uppercase tracking-wider mb-2 mt-2">Campaign</h3>
          <CampaignFields
            taskId={task.id}
            campaignId={task.campaignId}
            budget={paiseToRupeeInput(task.budgetPaise)}
            campaigns={campaignList}
            disabled={task.status === "cancelled"}
          />

          {/* attachments */}
          <h3 className="text-xs text-text-3 uppercase tracking-wider mb-2 mt-2">Publish</h3>
          <ContentFields
            taskId={task.id}
            channel={task.contentChannel}
            stage={task.contentStage}
            publishAt={task.publishAt}
            disabled={task.status === "cancelled"}
          />
          <ContentApproval
            taskId={task.id}
            channel={task.contentChannel}
            approvedById={task.contentApprovedById}
            approvedAt={task.contentApprovedAt}
            complianceChecked={task.complianceChecked}
            approverName={allUsers.find((u) => u.id === task.contentApprovedById)?.name}
            canApprove={canAssignOthers}
            disabled={task.status === "cancelled"}
          />
          <PublishPanel
            taskId={task.id}
            channel={task.contentChannel}
            approved={Boolean(task.contentApprovedAt)}
            publishState={task.publishState}
            publishedUrl={task.publishedUrl}
            publishedAt={task.publishedAt}
            publishError={task.publishError}
            canPublish={canAssignOthers}
            configured={isPublishConfigured()}
            disabled={task.status === "cancelled"}
          />

          <h3 className="text-xs text-text-3 uppercase tracking-wider mb-2 mt-2">Links</h3>
          <TaskLinks
            taskId={task.id}
            links={linkRows}
            disabled={task.status === "cancelled"}
          />

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

          {/* Review actions — visible only for managers/admins when task is in review */}
          {task.status === "review" && (me.role === "admin" || me.role === "manager") && (
            <ReviewActions taskId={task.id} />
          )}

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
                      {c.kind === "review_approve" && (
                        <span className="comment-review-badge approved">✓ Approved</span>
                      )}
                      {c.kind === "review_revise" && (
                        <span className="comment-review-badge revision">↩ Revision</span>
                      )}
                      <span className="text-text-3 font-normal ml-2">
                        {fmtTime(c.createdAt)}
                      </span>
                    </div>
                  </div>
                  <Markdown text={c.body} className="md-body text-sm leading-relaxed text-text-2" />
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
                placeholder="Markdown supported — **bold**, lists, links"
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
            <AssigneeSelect taskId={task.id} assigneeId={task.assigneeId} users={allUsers} canAssignOthers={canAssignOthers} />
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
            <div className="font-medium" title={fmtDate(task.dueDate)}>
              {task.status === "done" || task.status === "cancelled"
                ? fmtDate(task.dueDate)
                : fmtDueCountdown(task.dueDate)}
            </div>
          </div>

          <div className="card">
            <div className="text-xs text-text-3 uppercase tracking-wider mb-1">Repeats</div>
            <RecurrenceSelect taskId={task.id} recurrence={task.recurrence} />
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
