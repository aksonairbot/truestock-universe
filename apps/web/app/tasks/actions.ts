"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, tasks, projects, eq } from "@tu/db";
import { getCurrentUserId } from "@/lib/auth";
import { log } from "@/lib/log";

const TASK_STATUSES = ["backlog", "todo", "in_progress", "review", "done", "cancelled"] as const;
const TASK_PRIORITIES = ["low", "med", "high", "urgent"] as const;
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
export async function createTask(formData: FormData): Promise<void> {
  const title = ((formData.get("title") as string) ?? "").trim();
  const description = ((formData.get("description") as string) ?? "").trim() || null;
  const projectSlug = ((formData.get("projectSlug") as string) ?? "").trim();
  const statusRaw = ((formData.get("status") as string) ?? "todo").trim();
  const priorityRaw = ((formData.get("priority") as string) ?? "med").trim();
  const dueDateRaw = ((formData.get("dueDate") as string) ?? "").trim() || null;

  if (!title) throw new Error("title is required");
  if (!projectSlug) throw new Error("project is required");
  const status = isTaskStatus(statusRaw) ? statusRaw : "todo";
  const priority = isTaskPriority(priorityRaw) ? priorityRaw : "med";

  const db = getDb();
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.slug, projectSlug))
    .limit(1);
  if (!project) throw new Error(`project  not found`);

  const userId = await getCurrentUserId();

  const [created] = await db
    .insert(tasks)
    .values({
      projectId: project.id,
      title,
      description,
      status,
      priority,
      dueDate: dueDateRaw,
      createdById: userId,
    })
    .returning({ id: tasks.id });

  if (!created) throw new Error("insert returned no row");
  log.info("task.created", { taskId: created.id, projectSlug, status, priority });
  revalidatePath("/tasks");
  redirect("/tasks");
}

// ---------------------------------------------------------------------------
// updateTaskStatus — bound to inline status select on the list view
// ---------------------------------------------------------------------------
export async function updateTaskStatus(formData: FormData): Promise<void> {
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
  revalidatePath("/tasks");
}

// ---------------------------------------------------------------------------
// assignTask — bound to inline assignee select
// ---------------------------------------------------------------------------
export async function assignTask(formData: FormData): Promise<void> {
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  const assigneeId = ((formData.get("assigneeId") as string) ?? "").trim() || null;
  if (!taskId) throw new Error("taskId is required");

  const db = getDb();
  await db.update(tasks).set({ assigneeId, updatedAt: new Date() }).where(eq(tasks.id, taskId));
  log.info("task.assigned", { taskId, assigneeId });
  revalidatePath("/tasks");
}
