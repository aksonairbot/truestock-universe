"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, tasks, projects, taskComments, eq } from "@tu/db";
import { getCurrentUserId, getCurrentUser } from "@/lib/auth";
import { isPrivileged } from "@/lib/access";
import { log } from "@/lib/log";
import { notifyAssigned, notifyTaskCompleted, notifyCommentOnAssigned, notifyMentions, notifyReviewRequested, notifyReviewOutcome } from "@/lib/notify";
import { offsetToDeadline, deadlineToDateStr } from "@/lib/worktime";
import { checkAndAwardBadges } from "@/lib/badges";

const TASK_STATUSES = ["backlog", "todo", "in_progress", "review", "done", "cancelled"] as const;
const TASK_PRIORITIES = ["low", "med", "high", "urgent"] as const;
const TASK_RECURRENCES = ["none", "daily", "weekly", "monthly"] as const;
const HOURS_PER_DAY = 9; // 9 AM – 6 PM
const MAX_DUE_DAYS = 10;
const MAX_DUE_HOURS = MAX_DUE_DAYS * HOURS_PER_DAY; // 90 working hours

type TaskRecurrence = (typeof TASK_RECURRENCES)[number];

function isTaskRecurrence(v: string): v is TaskRecurrence {
  return (TASK_RECURRENCES as readonly string[]).includes(v);
}

/** Add the recurrence interval to a YYYY-MM-DD date, return YYYY-MM-DD. */
function bumpDueDate(dueDate: string | null, recurrence: TaskRecurrence): string {
  // If the recurring task had no due date, base the next one on today.
  const base = dueDate ? new Date(`${dueDate}T12:00:00+05:30`) : new Date();
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
  return { totalHours: totalHours || HOURS_PER_DAY };
}
type TaskStatus = (typeof TASK_STATUSES)[number];
type TaskPriority = (typeof TASK_PRIORITIES)[number];

function isTaskStatus(v: string): v is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(v);
}
function isTaskPriority(v: string): v is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(v);
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
      dueDate = dueDateInput; // legacy date format
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
    await notifyAssigned({ assigneeId, actorId: userId, taskId: created.id, taskTitle: title });
  }
  revalidatePath("/tasks");
  revalidatePath("/projects");
  return created.id;
}

// ---------------------------------------------------------------------------
// updateTaskStatus — bound to inline status select on the list view
// ---------------------------------------------------------------------------
export async function updateTaskStatus(formData: FormData): Promise<void> {
  const me = await getCurrentUserId();
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  const statusRaw = ((formData.get("status") as string) ?? "").trim();
  if (!taskId) throw new Error("taskId is required");
  if (!isTaskStatus(statusRaw)) throw new Error(`invalid status: ${statusRaw}`);

  const db = getDb();
  const now = new Date();
  await db
    .update(tasks)
    .set({
      status: statusRaw,
      // stamp transition timestamps so we can compute cycle time later
      ...(statusRaw === "in_progress" ? { startedAt: now } : {}),
      ...(statusRaw === "done" ? { completedAt: now } : {}),
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
      await notifyTaskCompleted({ creatorId: t.creatorId, actorId: me, taskId, taskTitle: t.title });
    }
    // Award badges (fire-and-forget — don't block the UI)
    checkAndAwardBadges(me, "task_completed", { taskId, projectId: t?.projectId }).catch((e) => {
      log.error("badge.check_failed", { userId: me, taskId, error: (e as Error).message, stack: (e as Error).stack });
    });

    // Spawn the next cycle for recurring tasks. Each instance is its own
    // row pointing at the just-completed one via recurrence_parent_id, so
    // the audit trail (comments, completion times, assignee history) on
    // every cycle stays intact.
    if (t && t.recurrence && t.recurrence !== "none" && isTaskRecurrence(t.recurrence)) {
      try {
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
            createdById: me,
          })
          .returning({ id: tasks.id });
        log.info("task.recurrence_spawned", {
          parentTaskId: taskId, spawnedTaskId: spawned?.id,
          recurrence: t.recurrence, nextDue,
        });
        // Let the assignee know there's a fresh copy on their queue, but
        // only if it's not the same person who just closed it.
        if (spawned && t.assigneeId && t.assigneeId !== me) {
          await notifyAssigned({
            assigneeId: t.assigneeId, actorId: me,
            taskId: spawned.id, taskTitle: t.title,
          });
        }
      } catch (e) {
        log.error("task.recurrence_spawn_failed", {
          taskId, recurrence: t.recurrence,
          error: (e as Error).message,
        });
      }
    }
  }
  if (statusRaw === "review") {
    const [t] = await db
      .select({ title: tasks.title })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (t) {
      await notifyReviewRequested({ actorId: me, taskId, taskTitle: t.title });
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

  // Permission: only admins and managers can reassign a task to someone else.
  if (!isPrivileged(me) && assigneeId && assigneeId !== me.id) {
    throw new Error("Only admins and managers can assign tasks to other people.");
  }

  const db = getDb();
  await db.update(tasks).set({ assigneeId, updatedAt: new Date() }).where(eq(tasks.id, taskId));
  log.info("task.assigned", { taskId, assigneeId });
  if (assigneeId && assigneeId !== me.id) {
    const [t] = await db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (t) await notifyAssigned({ assigneeId, actorId: me.id, taskId, taskTitle: t.title });
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

  const db = getDb();
  const userId = await getCurrentUserId();
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
      await notifyMentions({ body, actorId: userId, taskId, taskTitle: taskRow.title });
      if (taskRow.assigneeId && taskRow.assigneeId !== userId) {
        await notifyCommentOnAssigned({
          assigneeId: taskRow.assigneeId,
          actorId: userId,
          taskId,
          taskTitle: taskRow.title,
          preview: body,
        });
      }
    }
  } catch (e) {
    log.error("comment.notify_failed", { taskId, error: (e as Error).message, stack: (e as Error).stack });
  }
  // Award badges for commenting (fire-and-forget)
  checkAndAwardBadges(userId, "comment_posted", { taskId }).catch((e) => {
    log.error("badge.check_failed", { userId, taskId, error: (e as Error).message, stack: (e as Error).stack });
  });

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

  const db = getDb();

  // Verify task exists and is in review status
  const [task] = await db
    .select({ status: tasks.status, assigneeId: tasks.assigneeId, title: tasks.title })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!task) throw new Error("Task not found.");
  if (task.status !== "review") throw new Error("Task is not in review status.");

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

  // Notify assignee
  if (task.assigneeId && task.assigneeId !== me.id) {
    await notifyReviewOutcome({
      assigneeId: task.assigneeId,
      actorId: me.id,
      taskId,
      taskTitle: task.title,
      verdict,
    });
  }

  // Award badges on approval (fire-and-forget)
  if (verdict === "approve") {
    checkAndAwardBadges(task.assigneeId ?? me.id, "task_completed", { taskId }).catch((e) => {
      log.error("badge.check_failed", { taskId, error: (e as Error).message });
    });
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

  const db = getDb();

  // Verify task exists and user has permission (creator, assignee, or admin/manager)
  const [task] = await db
    .select({ assigneeId: tasks.assigneeId, createdById: tasks.createdById })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!task) throw new Error("task not found");
  if (me.role === "member" && task.assigneeId !== me.id && task.createdById !== me.id) {
    throw new Error("You can only cancel tasks you created or are assigned to.");
  }

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

  const db = getDb();
  // Re-check assignee server-side; never trust the client to enforce this.
  const [row] = await db
    .select({ assigneeId: tasks.assigneeId, createdById: tasks.createdById, title: tasks.title })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row) throw new Error("task not found");
  if (row.assigneeId) {
    throw new Error(
      "this task has an assignee and cannot be deleted — use Cancel instead so the activity stays in the history",
    );
  }
  // Only creator or admin/manager can delete
  if (me.role === "member" && row.createdById !== me.id) {
    throw new Error("You can only delete tasks you created.");
  }

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

  const db = getDb();

  // Guard: closed tasks cannot be edited
  const [existing] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!existing) throw new Error("task not found");
  if (existing.status === "done" || existing.status === "cancelled") {
    throw new Error("Closed tasks cannot be edited. Reopen the task first.");
  }

  // Build the update set. Due date: if provided, parse & update; if the form
  // field was present but empty, the user cleared it — block that. If the
  // field wasn't in the form at all (e.g. PrioritySelect), preserve the
  // existing DB value.
  const set: Record<string, unknown> = { title, description, priority, updatedAt: new Date() };

  if (dueDateInput) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dueDateInput)) {
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

  const db = getDb();
  const [parent] = await db
    .select({ projectId: tasks.projectId, assigneeId: tasks.assigneeId, dueDate: tasks.dueDate })
    .from(tasks)
    .where(eq(tasks.id, parentId))
    .limit(1);
  if (!parent) throw new Error("parent task not found");

  // Use explicit assignee if provided, otherwise inherit from parent
  const assigneeId = assigneeIdRaw ?? parent.assigneeId;

  // Permission: non-admin/manager can only create subtasks assigned to themselves.
  // (Catches the case where the parent task is owned by someone else — a member
  // trying to add a subtask there would otherwise quietly assign it to the
  // parent's owner via the inherit fallback.)
  const meForSubtask = await getCurrentUser();
  if (!isPrivileged(meForSubtask) && assigneeId && assigneeId !== meForSubtask.id) {
    throw new Error("Only admins and managers can assign tasks to other people.");
  }

  // Due date: use form input, else inherit from parent, else default 3 days
  let dueDate: string | null = null;
  if (dueDateInput && !/^\d{4}-\d{2}-\d{2}$/.test(dueDateInput)) {
    const parsed = parseDueInput(dueDateInput);
    if (parsed.totalHours > MAX_DUE_HOURS) {
      throw new Error(`Subtask due date cannot exceed ${MAX_DUE_DAYS} working days.`);
    }
    dueDate = deadlineToDateStr(offsetToDeadline(dueDateInput));
  } else {
    dueDate = dueDateInput ?? parent.dueDate;
  }
  if (!dueDate) {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    dueDate = d.toISOString().slice(0, 10);
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
    await notifyAssigned({ assigneeId, actorId: userId, taskId: created.id, taskTitle: title });
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
  await getCurrentUser(); // auth gate
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  const priorityRaw = ((formData.get("priority") as string) ?? "").trim();
  if (!taskId) throw new Error("taskId is required");
  if (!isTaskPriority(priorityRaw)) throw new Error(`invalid priority: ${priorityRaw}`);

  const db = getDb();
  const [existing] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!existing) throw new Error("task not found");
  if (existing.status === "done" || existing.status === "cancelled") {
    throw new Error("Closed tasks cannot be edited. Reopen the task first.");
  }

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
  await getCurrentUser(); // auth gate
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  const recurrenceRaw = ((formData.get("recurrence") as string) ?? "").trim();
  if (!taskId) throw new Error("taskId is required");
  if (!isTaskRecurrence(recurrenceRaw)) throw new Error(`invalid recurrence: ${recurrenceRaw}`);

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
// updateTaskTitle — quick inline rename. Used by the editable subtask title.
// ---------------------------------------------------------------------------
export async function updateTaskTitle(formData: FormData): Promise<void> {
  await getCurrentUser(); // auth gate
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  const title = ((formData.get("title") as string) ?? "").trim();
  if (!taskId) throw new Error("taskId is required");
  if (!title) throw new Error("title cannot be empty");
  const db = getDb();
  await db.update(tasks).set({ title, updatedAt: new Date() }).where(eq(tasks.id, taskId));
  log.info("task.title_updated", { taskId });
  revalidatePath("/tasks");
}
