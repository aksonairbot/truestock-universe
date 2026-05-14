// apps/web/app/quick-capture-action.ts
//
// One-step capture from the My Day quick textarea:
//   1. Pass the text to suggestTaskMeta → triage suggestion.
//   2. Resolve fallbacks: if model couldn't pick a project, use Skynet
//      internal; if no assignee, default to the current user.
//   3. Create the task. Revalidate / so it shows up in priorities.

"use server";

import { revalidatePath } from "next/cache";
import { getDb, tasks, projects, users, eq, sql } from "@tu/db";
import { getCurrentUserId } from "@/lib/auth";
import { suggestTaskMeta } from "./tasks/triage-action";
import { log } from "@/lib/log";

const PRIORITIES = ["low", "med", "high", "urgent"] as const;
type Priority = (typeof PRIORITIES)[number];

export interface QuickCaptureResult {
  ok: boolean;
  taskId?: string;
  title?: string;
  projectSlug?: string;
  projectName?: string;
  assigneeName?: string;
  priority?: Priority;
  dueDate?: string | null;
  reasoning?: string;
  error?: string;
}

const FALLBACK_PROJECT_SLUG = "skynet-platform";

function offsetToDate(n: number | null): string | null {
  if (n === null) return null;
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function quickCapture(text: string): Promise<QuickCaptureResult> {
  const title = (text ?? "").trim();
  if (!title) return { ok: false, error: "empty" };
  if (title.length > 250) return { ok: false, error: "title too long (max 250 chars)" };

  const db = getDb();
  const meId = await getCurrentUserId();

  // ---- triage ----
  const triage = await suggestTaskMeta({ title, description: "" });
  const sug = triage.ok ? triage.suggestion! : null;

  // ---- resolve project ----
  let projectSlug = sug?.projectSlug ?? null;
  if (!projectSlug) projectSlug = FALLBACK_PROJECT_SLUG;
  let project: { id: string; slug: string; name: string } | undefined;
  const [p1] = await db
    .select({ id: projects.id, slug: projects.slug, name: projects.name })
    .from(projects)
    .where(eq(projects.slug, projectSlug))
    .limit(1);
  project = p1;
  if (!project) {
    const [anyProject] = await db
      .select({ id: projects.id, slug: projects.slug, name: projects.name })
      .from(projects)
      .where(sql`archived_at is null`)
      .limit(1);
    if (!anyProject) return { ok: false, error: "no project to capture into" };
    project = anyProject;
  }

  // ---- resolve assignee ----
  let assigneeId: string = meId;
  if (sug?.assigneeEmail) {
    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, sug.assigneeEmail))
      .limit(1);
    if (u) assigneeId = u.id;
  }
  const [assigneeRow] = await db.select({ name: users.name }).from(users).where(eq(users.id, assigneeId)).limit(1);

  // ---- priority + due ----
  const priority: Priority = sug?.priority && (PRIORITIES as readonly string[]).includes(sug.priority)
    ? (sug.priority as Priority)
    : "med";
  const dueDate = sug?.dueOffsetDays !== null && sug?.dueOffsetDays !== undefined
    ? offsetToDate(sug.dueOffsetDays)
    : offsetToDate(3); // default 3 business days when AI triage has no opinion

  // ---- insert ----
  const [created] = await db
    .insert(tasks)
    .values({
      projectId: project.id,
      title,
      description: null,
      assigneeId,
      createdById: meId,
      status: "todo",
      priority,
      dueDate,
    })
    .returning({ id: tasks.id });

  if (!created) return { ok: false, error: "insert returned no row" };

  log.info("quick_capture.created", { taskId: created.id, projectSlug: project.slug, priority });
  revalidatePath("/");
  revalidatePath("/tasks");

  return {
    ok: true,
    taskId: created.id,
    title,
    projectSlug: project.slug,
    projectName: project.name,
    assigneeName: assigneeRow?.name ?? "you",
    priority,
    dueDate,
    reasoning: sug?.reasoning ?? "captured with defaults — no triage available",
  };
}
