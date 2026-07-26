"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, tasks, projects, taskComments, eq, and, sql } from "@tu/db";
import { getCurrentUserId, getCurrentUser } from "@/lib/auth";
import { isPrivileged, isAdmin, getDepartmentScope, requireTaskAccess } from "@/lib/access";
import { log } from "@/lib/log";
import { notifyAssigned, notifyTaskCompleted, notifyCommentOnAssigned, notifyMentions, notifyReviewRequested, notifyReviewOutcome } from "@/lib/notify";
import { offsetToDeadline, deadlineToDateStr } from "@/lib/worktime";

const TASK_STATUSES = ["backlog", "todo", "in_progress", "review", "done", "cancelled"] as const;
const TASK_PRIORITIES = ["low", "med", "high", "urgent"] as const;
const TASK_RECURRENCES = ["none", "daily", "weekly", "monthly"] as const;
const HOURS_PER_DAY = 9; // 9 AM – 6 PM
const MAX_DUE_DAYS = 10;
const MAX_DUE_HOURS = MAX_DUE_DAYS * HOURS_PER_DAY; // 90 working hours

type TaskRecurrence = (typeof TASK_RECURRENCES)[number];

/**
 * Run a notification out of the request's critical path. Notifications can
 * involve external HTTP (WhatsApp) — awaiting them made every status change /
 * assign / comment hang until the provider responded. DB writes inside notify
 * still happen; failures are logged, never surfaced to the user.
 */
function notifyInBackground(p: Promise<unknown>, event: string, ctx: Record<string, unknown>): void {
  p.catch((e) => log.error(event, { ...ctx, error: (e as Error).message, stack: (e as Error).stack }));
}

function isTaskRecurrence(v: string): v is TaskRecurrence {
  return (TASK_RECURRENCES as readonly string[]).includes(v);
}

/** Today's date in IST as YYYY-MM-DD. */
function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

/** Add the recurrence interval to a YYYY-MM-DD date, return YYYY-MM-DD. */
function bumpDueDate(dueDate: string | null, recurrence: TaskRecurrence): string {
  // Roll-forward: if the instance being closed is already overdue (or has no
  // due date), base the next cycle on TODAY instead of the stale due date.
  // Otherwise a daily task completed 24 days late would spawn a child that is
  // born 23 days overdue and the chain never recovers.
  const today = todayIST();
  const effectiveDue = dueDate && dueDate >= today ? dueDate : today;
  const base = new Date(`${effectiveDue}T12:00:00+05:30`);
  switch (recurrence) {
    case "daily":   base.setDate(base.getDate() + 1); break;
    case "weekly":  base.setDate(base.getDate() + 7); break;
    case "monthly": base.setMonth(base.getMonth() + 1); break;
    default: /* none — caller should never get here */ break;
  }
  // Pin to IST date string regardless of host timezone.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(base);
}

const MAX_DUE_CALENDAR_DAYS = 14; // ≈ 10 working days, matches the old cap

/** todayIST + n days, as YYYY-MM-DD. */
function plusDaysIST(days: number): string {
  const d = new Date(`${todayIST()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Validate a YYYY-MM-DD due date from the date pickers. This branch used to
 * bypass ALL validation (no cap, past dates allowed). `allowSame` lets an
 * edit keep a task's existing (possibly overdue) due date so saving a title
 * change on an overdue task doesn't get rejected.
 */
function validateDueDateStr(dueDate: string, allowSame?: string | null): void {
  if (allowSame && dueDate === allowSame) return;
  const today = todayIST();
  if (dueDate < today) throw new Error("Due date cannot be in the past.");
  if (dueDate > plusDaysIST(MAX_DUE_CALENDAR_DAYS)) {
    throw new Error("Due date cannot be more than 2 weeks out.");
  }
}

/** Parse a due-date input string and return total working hours. */
function parseDueInput(input: string): { totalHours: number } {
  let totalHours = 0;
  const dayMatch = input.match(/(\d+)\s*d(?:ays?)?/i);
  const hourMatch = input.match(/(\d+)\s*h(?:ours?|rs?)?/i);
  if (dayMatch) totalHours += Number(dayMatch[1]) * HOURS_PER_DAY;
  if (hourMatch) totalHours += Number(hourMatch[1]);
  if (!dayMatch && !hourMatch) {
    const n = Number(input);
    if (!isNaN(n) && n > 0) totalHours = n * HOURS_PER_DAY;
  }
  if (totalHours <= 0) {
    // Previously unparseable input (e.g. "tomorrow") silently became 1 working
    // day — a due date the user never chose. Reject instead.
    throw new Error(`Could not understand due date "${input}". Use formats like "3d", "8h", "2d 4h", or a date (YYYY-MM-DD).`);
  }
  return { totalHours };
}
type TaskStatus = (typeof TASK_STATUSES)[number];
type TaskPriority = (typeof TASK_PRIORITIES)[number];

function isTaskStatus(v: string): v is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(v);
}
function isTaskPriority(v: string): v is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(v);
}

/**
 * Spawn the next cycle for a recurring task that was just closed. Each
 * instance is its own row pointing at the completed one via
 * recurrence_parent_id, so the audit trail on every cycle stays intact.
 *
 * Idempotency: toggling done → todo → done (or a review-approve after a
 * direct done) would otherwise spawn a fresh child every transition — skip
 * if a child already exists for this parent. Never throws.
 */
async function spawnRecurrenceCycle(db: ReturnType<typeof getDb>, taskId: string, actorId: string): Promise<void> {
  try {
    const [t] = await db
      .select({
        title: tasks.title,
        description: tasks.description,
        projectId: tasks.projectId,
        priority: tasks.priority,
        assigneeId: tasks.assigneeId,
        dueDate: tasks.dueDate,
        recurrence: tasks.recurrence,
      })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (!t || !t.recurrence || t.recurrence === "none" || !isTaskRecurrence(t.recurrence)) return;

    const [existingChild] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.recurrenceParentId, taskId))
      .limit(1);
    if (existingChild) {
      log.info("task.recurrence_skip_dup", { parentTaskId: taskId, childTaskId: existingChild.id });
      return;
    }

    const nextDue = bumpDueDate(t.dueDate, t.recurrence);
    const [spawned] = await db
      .insert(tasks)
      .values({
        projectId: t.projectId,
        title: t.title,
        description: t.description,
        status: "todo",
        priority: t.priority,
        dueDate: nextDue,
        assigneeId: t.assigneeId,
        recurrence: t.recurrence,
        recurrenceParentId: taskId,
        createdById: actorId,
      })
      .returning({ id: tasks.id });
    log.info("task.recurrence_spawned", {
      parentTaskId: taskId, spawnedTaskId: spawned?.id,
      recurrence: t.recurrence, nextDue,
    });
    // Let the assignee know there's a fresh copy on their queue, but only if
    // it's not the same person who just closed it.
    if (spawned && t.assigneeId && t.assigneeId !== actorId) {
      notifyInBackground(
        notifyAssigned({ assigneeId: t.assigneeId, actorId, taskId: spawned.id, taskTitle: t.title }),
        "notify.assigned_failed", { taskId: spawned.id },
      );
    }
  } catch (e) {
    log.error("task.recurrence_spawn_failed", { taskId, error: (e as Error).message });
  }
}

// ---------------------------------------------------------------------------
// createTask — bound to /tasks/new form
// ---------------------------------------------------------------------------
export async function createTask(formData: FormData): Promise<string> {
  const title = ((formData.get("title") as string) ?? "").trim();
  const description = ((formData.get("description") as string) ?? "").trim() || null;
  const projectSlug = ((formData.get("projectSlug") as string) ?? "").trim();
  const statusRaw = ((formData.get("status") as string) ?? "todo").trim();
  const priorityRaw = ((formData.get("priority") as string) ?? "med").trim();
  const dueDateInput = ((formData.get("dueDate") as string) ?? "").trim() || null;
  const assigneeIdRaw = ((formData.get("assigneeId") as string) ?? "").trim() || null;
  const recurrenceRaw = ((formData.get("recurrence") as string) ?? "none").trim();

  if (!title) throw new Error("title is required");
  if (!projectSlug) throw new Error("project is required");
  if (!dueDateInput) throw new Error("due date is required");
  const status = isTaskStatus(statusRaw) ? statusRaw : "todo";
  const priority = isTaskPriority(priorityRaw) ? priorityRaw : "med";
  const recurrence: TaskRecurrence = isTaskRecurrence(recurrenceRaw) ? recurrenceRaw : "none";

  // Convert due input: accept "3d", "8h", "2d 4h" or legacy YYYY-MM-DD
  let dueDate: string | null = null;
  if (dueDateInput) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dueDateInput)) {
      validateDueDateStr(dueDateInput);
      dueDate = dueDateInput;
    } else {
      const parsed = parseDueInput(dueDateInput);
      if (parsed.totalHours > MAX_DUE_HOURS) {
        throw new Error(`Due date cannot exceed ${MAX_DUE_DAYS} working days. You entered ~${Math.ceil(parsed.totalHours / HOURS_PER_DAY)}d.`);
      }
      dueDate = deadlineToDateStr(offsetToDeadline(dueDateInput));
    }
  }

  const db = getDb();
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.slug, projectSlug))
    .limit(1);
  if (!project) throw new Error(`project not found`);

  const me = await getCurrentUser();
  const userId = me.id;

  // Permission: only admins and managers can assign tasks to other people.
  // Everyone else (member / viewer / agent) is locked to self-assignment.
  const assigneeId = assigneeIdRaw ?? userId;
  if (!isPrivileged(me) && assigneeId !== userId) {
    throw new Error("Only admins and managers can assign tasks to other people.");
  }

  const [created] = await db
    .insert(tasks)
    .values({
      projectId: project.id,
      title,
      description,
      status,
      priority,
      dueDate,
      assigneeId,
      recurrence,
      createdById: userId,
    })
    .returning({ id: tasks.id });

  if (!created) throw new Error("insert returned no row");
  log.info("task.created", { taskId: created.id, projectSlug, status, priority, assigneeId, recurrence });
  if (assigneeId && assigneeId !== userId) {
    notifyInBackground(
      notifyAssigned({ assigneeId, actorId: userId, taskId: created.id, taskTitle: title }),
      "notify.assigned_failed", { taskId: created.id },
    );
  }
  revalidatePath("/tasks");
  revalidatePath("/projects");
  return created.id;
}

// ---------------------------------------------------------------------------
// updateTaskStatus — bound to inline status select on the list view
// ---------------------------------------------------------------------------
export async function updateTaskStatus(formData: FormData): Promise<void> {
  const meUser = await getCurrentUser();
  const me = meUser.id;
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  const statusRaw = ((formData.get("status") as string) ?? "").trim();
  if (!taskId) throw new Error("taskId is required");
  if (!isTaskStatus(statusRaw)) throw new Error(`invalid status: ${statusRaw}`);
  await requireTaskAccess(taskId, meUser);

  const db = getDb();
  const now = new Date();
  await db
    .update(tasks)
    .set({
      status: statusRaw,
      // stamp transition timestamps so we can compute cycle time later
      ...(statusRaw === "in_progress" ? { startedAt: now } : {}),
      ...(statusRaw === "done" ? { completedAt: now } : {}),
      // reopening a task must clear the stale completion stamp, otherwise
      // week/cycle-time metrics keep counting it as done
      ...(statusRaw === "todo" || statusRaw === "backlog" || statusRaw === "in_progress" || statusRaw === "review"
        ? { completedAt: null }
        : {}),
      updatedAt: now,
    })
    .where(eq(tasks.id, taskId));

  log.info("task.status_changed", { taskId, status: statusRaw });
  if (statusRaw === "done") {
    const [t] = await db
      .select({
        creatorId: tasks.createdById,
        title: tasks.title,
        description: tasks.description,
        projectId: tasks.projectId,
        priority: tasks.priority,
        assigneeId: tasks.assigneeId,
        dueDate: tasks.dueDate,
        recurrence: tasks.recurrence,
      })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (t && t.creatorId !== me) {
      notifyInBackground(
        notifyTaskCompleted({ creatorId: t.creatorId, actorId: me, taskId, taskTitle: t.title }),
        "notify.completed_failed", { taskId },
      );
    }
// Spawn the next cycle for recurring tasks. Each instance is its own
    // row pointing at the just-completed one via recurrence_parent_id, so
    // the audit trail (comments, completion times, assignee history) on
    // every cycle stays intact.
    //
    // Idempotency guard: a user toggling done → todo → done (very common —
    // "I checked the wrong one, undo, re-check") would otherwise spawn a
    // fresh child every transition. Skip if we already spawned one for
    // this parent.
    await spawnRecurrenceCycle(db, taskId, me);
  }
  if (statusRaw === "review") {
    const [t] = await db
      .select({ title: tasks.title })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (t) {
      notifyInBackground(
        notifyReviewRequested({ actorId: me, taskId, taskTitle: t.title }),
        "notify.review_requested_failed", { taskId },
      );
    }
  }
  revalidatePath("/tasks");
}

// ---------------------------------------------------------------------------
// assignTask — bound to inline assignee select
// ---------------------------------------------------------------------------
export async function assignTask(formData: FormData): Promise<void> {
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  const assigneeId = ((formData.get("assigneeId") as string) ?? "").trim() || null;
  if (!taskId) throw new Error("taskId is required");

  const me = await getCurrentUser();
  await requireTaskAccess(taskId, me);

  // Permission: only admins and managers can reassign a task to someone else.
  if (!isPrivileged(me) && assigneeId && assigneeId !== me.id) {
    throw new Error("Only admins and managers can assign tasks to other people.");
  }

  const db = getDb();
  await db.update(tasks).set({ assigneeId, updatedAt: new Date() }).where(eq(tasks.id, taskId));
  log.info("task.assigned", { taskId, assigneeId });
  if (assigneeId && assigneeId !== me.id) {
    const [t] = await db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (t) {
      notifyInBackground(
        notifyAssigned({ assigneeId, actorId: me.id, taskId, taskTitle: t.title }),
        "notify.assigned_failed", { taskId },
      );
    }
  }
  revalidatePath("/tasks");
}

// ---------------------------------------------------------------------------
// addComment — bound to the comment-form on /tasks/[id]
// ---------------------------------------------------------------------------

export async function addComment(formData: FormData): Promise<void> {
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  const body = ((formData.get("body") as string) ?? "").trim();
  if (!taskId) throw new Error("taskId is required");
  if (!body) throw new Error("comment body is required");

  const me = await getCurrentUser();
  await requireTaskAccess(taskId, me);
  const userId = me.id;
  const db = getDb();
  await db.insert(taskComments).values({ taskId, authorId: userId, body });
  log.info("task.comment_added", { taskId });

  // notifications: pull task meta once, fire @mentions + assignee notice
  // Wrapped in try-catch so notification failures never crash the comment action
  try {
    const [taskRow] = await db
      .select({ title: tasks.title, assigneeId: tasks.assigneeId })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (taskRow) {
      notifyInBackground(
        notifyMentions({ body, actorId: userId, taskId, taskTitle: taskRow.title }),
        "notify.mentions_failed", { taskId },
      );
      if (taskRow.assigneeId && taskRow.assigneeId !== userId) {
        notifyInBackground(
          notifyCommentOnAssigned({
            assigneeId: taskRow.assigneeId,
            actorId: userId,
            taskId,
            taskTitle: taskRow.title,
            preview: body,
          }),
          "notify.comment_failed", { taskId },
        );
      }
    }
  } catch (e) {
    log.error("comment.notify_failed", { taskId, error: (e as Error).message, stack: (e as Error).stack });
  }
  revalidatePath(`/tasks/${taskId}`);
}

// ---------------------------------------------------------------------------
// reviewTask — manager approves or requests revision on a task in "review"
// ---------------------------------------------------------------------------
export async function reviewTask(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (me.role !== "admin" && me.role !== "manager") {
    throw new Error("Only managers and admins can review tasks.");
  }

  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  const verdict = ((formData.get("verdict") as string) ?? "").trim(); // "approve" | "revise"
  const feedback = ((formData.get("feedback") as string) ?? "").trim();

  if (!taskId) throw new Error("taskId is required");
  if (verdict !== "approve" && verdict !== "revise") throw new Error("verdict must be approve or revise");
  if (!feedback) throw new Error("Feedback is required.");

  // requireTaskAccess applies the dept-scope rule for managers — admins pass through.
  const task = await requireTaskAccess(taskId, me);
  if (task.status !== "review") throw new Error("Task is not in review status.");

  const db = getDb();

  const now = new Date();
  const newStatus = verdict === "approve" ? "done" : "in_progress";
  const commentKind = verdict === "approve" ? "review_approve" : "review_revise";

  // Update task status
  await db
    .update(tasks)
    .set({
      status: newStatus,
      ...(verdict === "approve" ? { completedAt: now } : {}),
      updatedAt: now,
    })
    .where(eq(tasks.id, taskId));

  // Post feedback as a special review comment
  await db.insert(taskComments).values({
    taskId,
    authorId: me.id,
    body: feedback,
    kind: commentKind,
  });

  // Approving a recurring task closes it — spawn the next cycle exactly like
  // a direct "done" would. (Previously review-approve silently killed the
  // recurrence chain.)
  if (verdict === "approve") {
    await spawnRecurrenceCycle(db, taskId, me.id);
  }

  // Notify assignee
  if (task.assigneeId && task.assigneeId !== me.id) {
    notifyInBackground(
      notifyReviewOutcome({
        assigneeId: task.assigneeId,
        actorId: me.id,
        taskId,
        taskTitle: task.title,
        verdict,
      }),
      "notify.review_outcome_failed", { taskId },
    );
  }

  log.info("task.reviewed", { taskId, verdict, reviewerId: me.id });
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

// ---------------------------------------------------------------------------
// cancelTask — soft retire. Sets status=cancelled. Always allowed.
// ---------------------------------------------------------------------------
export async function cancelTask(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  if (!taskId) throw new Error("taskId is required");

  // requireTaskAccess enforces: admin OK, manager dept-scoped, member creator-or-assignee.
  await requireTaskAccess(taskId, me);

  const db = getDb();

  await db
    .update(tasks)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
  log.info("task.cancelled", { taskId, actorId: me.id });
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  redirect("/tasks");
}

// ---------------------------------------------------------------------------
// deleteTask — hard delete. BLOCKED if the task has an assignee — those have
// to be cancelled instead so the audit trail survives.
// ---------------------------------------------------------------------------
export async function deleteTask(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  if (!taskId) throw new Error("taskId is required");

  // requireTaskAccess enforces the dept/creator/assignee rules. Additional
  // delete-specific guards below: cannot delete tasks with an assignee.
  const row = await requireTaskAccess(taskId, me);
  if (row.assigneeId) {
    throw new Error(
      "this task has an assignee and cannot be deleted — use Cancel instead so the activity stays in the history",
    );
  }
  // Members can only delete tasks they created (requireTaskAccess already
  // allows assignee-or-creator; tighten to creator-only for delete).
  if (me.role === "member" && row.createdById !== me.id) {
    throw new Error("You can only delete tasks you created.");
  }

  const db = getDb();
  await db.delete(tasks).where(eq(tasks.id, taskId));
  log.info("task.deleted", { taskId, title: row.title, actorId: me.id });
  revalidatePath("/tasks");
  redirect("/tasks");
}

// ---------------------------------------------------------------------------
// updateTaskMeta — bound to the metadata edit form on /tasks/[id]
// Updates title, description, priority, dueDate in one shot.
// ---------------------------------------------------------------------------
export async function updateTaskMeta(formData: FormData): Promise<void> {
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  if (!taskId) throw new Error("taskId is required");
  const title = ((formData.get("title") as string) ?? "").trim();
  const description = ((formData.get("description") as string) ?? "").trim() || null;
  const priorityRaw = ((formData.get("priority") as string) ?? "").trim();
  const dueDateInput = ((formData.get("dueDate") as string) ?? "").trim() || null;

  if (!title) throw new Error("title cannot be empty");
  const priority = isTaskPriority(priorityRaw) ? priorityRaw : "med";

  const meMeta = await getCurrentUser();
  const existing = await requireTaskAccess(taskId, meMeta);
  if (existing.status === "done" || existing.status === "cancelled") {
    throw new Error("Closed tasks cannot be edited. Reopen the task first.");
  }

  const db = getDb();

  // Build the update set. Due date: if provided, parse & update; if the form
  // field was present but empty, the user cleared it — block that. If the
  // field wasn't in the form at all (e.g. PrioritySelect), preserve the
  // existing DB value.
  const set: Record<string, unknown> = { title, description, priority, updatedAt: new Date() };

  if (dueDateInput) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dueDateInput)) {
      validateDueDateStr(dueDateInput, existing.dueDate);
      set.dueDate = dueDateInput;
    } else {
      // Validate max 10 working days
      const parsed = parseDueInput(dueDateInput);
      if (parsed.totalHours > MAX_DUE_HOURS) {
        throw new Error(`Due date cannot exceed 10 working days. You entered ~${Math.ceil(parsed.totalHours / 9)}d.`);
      }
      set.dueDate = deadlineToDateStr(offsetToDeadline(dueDateInput));
    }
  } else if (formData.has("dueDate")) {
    // Field present but blank — user deliberately cleared it. Block.
    throw new Error("due date is required");
  }

  await db
    .update(tasks)
    .set(set as any)
    .where(eq(tasks.id, taskId));
  log.info("task.meta_updated", { taskId });
  revalidatePath(`/tasks/${taskId}`);
}

// ---------------------------------------------------------------------------
// addSubtask — create a child task under a parent. Inherits project + assignee
// from the parent unless overridden. Bound to the slide-over "add subtask" form.
// ---------------------------------------------------------------------------
export async function addSubtask(formData: FormData): Promise<void> {
  const parentId = ((formData.get("parentId") as string) ?? "").trim();
  const title = ((formData.get("title") as string) ?? "").trim();
  const assigneeIdRaw = ((formData.get("assigneeId") as string) ?? "").trim() || null;
  const dueDateInput = ((formData.get("dueDate") as string) ?? "").trim() || null;
  const dueTimeInput = ((formData.get("dueTime") as string) ?? "").trim() || null;
  if (!parentId) throw new Error("parentId is required");
  if (!title) throw new Error("title is required");

  // Enforce access on the PARENT task first — you can only attach subtasks
  // to tasks you would already be allowed to mutate.
  const meForSubtask = await getCurrentUser();
  const parent = await requireTaskAccess(parentId, meForSubtask);

  // Use explicit assignee if provided, otherwise inherit from parent
  const assigneeId = assigneeIdRaw ?? parent.assigneeId;

  // Permission: non-admin/manager can only create subtasks assigned to themselves.
  // (Catches the case where the parent task is owned by someone else — a member
  // trying to add a subtask there would otherwise quietly assign it to the
  // parent's owner via the inherit fallback.)
  if (!isPrivileged(meForSubtask) && assigneeId && assigneeId !== meForSubtask.id) {
    throw new Error("Only admins and managers can assign tasks to other people.");
  }

  const db = getDb();

  // Due date: use form input, else inherit from parent, else default 3 days
  let dueDate: string | null = null;
  if (dueDateInput && !/^\d{4}-\d{2}-\d{2}$/.test(dueDateInput)) {
    const parsed = parseDueInput(dueDateInput);
    if (parsed.totalHours > MAX_DUE_HOURS) {
      throw new Error(`Subtask due date cannot exceed ${MAX_DUE_DAYS} working days.`);
    }
    dueDate = deadlineToDateStr(offsetToDeadline(dueDateInput));
  } else {
    if (dueDateInput) validateDueDateStr(dueDateInput, parent.dueDate);
    dueDate = dueDateInput ?? parent.dueDate;
  }
  if (!dueDate) {
    // Default: 3 days from today, pinned to IST (toISOString() used UTC —
    // before 05:30 IST that produced yesterday's date).
    const d = new Date(`${todayIST()}T12:00:00+05:30`);
    d.setDate(d.getDate() + 3);
    dueDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(d);
  }

  const userId = meForSubtask.id;
  const [created] = await db
    .insert(tasks)
    .values({
      projectId: parent.projectId,
      title,
      assigneeId,
      createdById: userId,
      status: "todo",
      priority: "med",
      dueDate,
      dueTime: dueTimeInput,
      parentTaskId: parentId,
    })
    .returning({ id: tasks.id, assigneeId: tasks.assigneeId });
  if (!created) throw new Error("insert returned no row");
  log.info("subtask.created", { parentId, taskId: created.id, assigneeId, dueDate, dueTime: dueTimeInput });

  if (assigneeId && assigneeId !== userId) {
    notifyInBackground(
      notifyAssigned({ assigneeId, actorId: userId, taskId: created.id, taskTitle: title }),
      "notify.assigned_failed", { taskId: created.id },
    );
  }
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${parentId}`);
}

// ---------------------------------------------------------------------------
// updateTaskPriority — inline priority change ONLY. Does not touch title,
// description, or dueDate so a concurrent description edit can't be clobbered
// when someone bumps priority from the sidebar.
// ---------------------------------------------------------------------------
export async function updateTaskPriority(formData: FormData): Promise<void> {
  const mePri = await getCurrentUser();
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  const priorityRaw = ((formData.get("priority") as string) ?? "").trim();
  if (!taskId) throw new Error("taskId is required");
  if (!isTaskPriority(priorityRaw)) throw new Error(`invalid priority: ${priorityRaw}`);

  const existing = await requireTaskAccess(taskId, mePri);
  if (existing.status === "done" || existing.status === "cancelled") {
    throw new Error("Closed tasks cannot be edited. Reopen the task first.");
  }

  const db = getDb();

  await db
    .update(tasks)
    .set({ priority: priorityRaw, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  log.info("task.priority_updated", { taskId, priority: priorityRaw });
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

// ---------------------------------------------------------------------------
// updateTaskRecurrence — switch a task between one-off and recurring without
// touching anything else. Used by the inline sidebar select.
// ---------------------------------------------------------------------------
export async function updateTaskRecurrence(formData: FormData): Promise<void> {
  const meRec = await getCurrentUser();
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  const recurrenceRaw = ((formData.get("recurrence") as string) ?? "").trim();
  if (!taskId) throw new Error("taskId is required");
  if (!isTaskRecurrence(recurrenceRaw)) throw new Error(`invalid recurrence: ${recurrenceRaw}`);

  await requireTaskAccess(taskId, meRec);

  const db = getDb();
  await db
    .update(tasks)
    .set({ recurrence: recurrenceRaw, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
  log.info("task.recurrence_updated", { taskId, recurrence: recurrenceRaw });
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

// ---------------------------------------------------------------------------
// bulkSweepOverdue — one-click sweep of ALL overdue tasks the caller can see.
// Ops:
//   reschedule → due_date = today (IST)
//   backlog    → status = backlog, due_date cleared (it's parked, not late)
//   cancel     → status = cancelled
// Scope mirrors the /tasks data wall: admin = org-wide, manager = department
// (assignee or creator), member = own (assignee or creator). Never touches
// done/cancelled tasks.
// ---------------------------------------------------------------------------
export async function bulkSweepOverdue(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  const op = ((formData.get("op") as string) ?? "").trim();
  if (op !== "reschedule" && op !== "backlog" && op !== "cancel") {
    throw new Error(`invalid sweep op: ${op}`);
  }

  const db = getDb();
  const today = todayIST();
  const overdueCond = sql`${tasks.status} not in ('done'::task_status,'cancelled'::task_status) and ${tasks.dueDate} < ${today}`;

  const deptScope = getDepartmentScope(me);
  const scopeCond = isAdmin(me)
    ? sql`1=1`
    : deptScope
      ? sql`(${tasks.assigneeId} in (select id from users where department_id = ${deptScope}) or ${tasks.createdById} in (select id from users where department_id = ${deptScope}))`
      : sql`(${tasks.assigneeId} = ${me.id} or ${tasks.createdById} = ${me.id})`;

  const now = new Date();
  const set =
    op === "reschedule"
      ? { dueDate: today, updatedAt: now }
      : op === "backlog"
        ? { status: "backlog" as const, dueDate: null, updatedAt: now }
        : { status: "cancelled" as const, updatedAt: now };

  const swept = await db
    .update(tasks)
    .set(set)
    .where(and(overdueCond, scopeCond))
    .returning({ id: tasks.id });

  log.info("task.bulk_sweep", { op, count: swept.length, actorId: me.id, role: me.role });
  revalidatePath("/tasks");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// updateTaskTitle — quick inline rename. Used by the editable subtask title.
// ---------------------------------------------------------------------------
export async function updateTaskTitle(formData: FormData): Promise<void> {
  const meTit = await getCurrentUser();
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  const title = ((formData.get("title") as string) ?? "").trim();
  if (!taskId) throw new Error("taskId is required");
  if (!title) throw new Error("title cannot be empty");
  await requireTaskAccess(taskId, meTit);
  const db = getDb();
  await db.update(tasks).set({ title, updatedAt: new Date() }).where(eq(tasks.id, taskId));
  log.info("task.title_updated", { taskId });
  revalidatePath("/tasks");
}
