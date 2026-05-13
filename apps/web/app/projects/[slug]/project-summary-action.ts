// apps/web/app/projects/[slug]/project-summary-action.ts
//
// Generates a one-paragraph AI health summary for a project. Cached per-day.
// Refresh button forces regeneration.

"use server";

import { revalidatePath } from "next/cache";
import { getDb, projects, tasks, users, projectSummaries, eq, and, sql } from "@tu/db";
import { llm } from "@/lib/llm";
import { log } from "@/lib/log";

function istDayString(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

export interface ProjectSummaryResult {
  ok: boolean;
  body?: string;
  generatedAt?: Date;
  model?: string;
  cached?: boolean;
  error?: string;
}

export async function getOrGenerateProjectSummary(
  projectId: string,
  opts?: { force?: boolean },
): Promise<ProjectSummaryResult> {
  const today = istDayString(new Date());
  const db = getDb();

  if (!opts?.force) {
    const [existing] = await db
      .select()
      .from(projectSummaries)
      .where(and(
        eq(projectSummaries.projectId, projectId),
        eq(projectSummaries.date, today),
        eq(projectSummaries.kind, "health"),
      ))
      .limit(1);
    if (existing) {
      return { ok: true, body: existing.body, generatedAt: existing.generatedAt, model: existing.model ?? undefined, cached: true };
    }
  }

  const [project] = await db
    .select({ id: projects.id, name: projects.name, description: projects.description })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return { ok: false, error: "project not found" };

  // Pull all open tasks + recently-closed ones with priorities + ages.
  const rows = await db
    .select({
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      createdAt: tasks.createdAt,
      completedAt: tasks.completedAt,
      assignee: users.name,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(eq(tasks.projectId, projectId))
    .orderBy(tasks.createdAt);

  const open = rows.filter((r) => r.status !== "done" && r.status !== "cancelled");
  const done = rows.filter((r) => r.status === "done");
  const overdue = open.filter((r) => r.dueDate && new Date(`${r.dueDate}T12:00:00+05:30`) < new Date()).length;
  const oldest = [...open].sort((a, b) => {
    const ad = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
    const bd = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
    return ad.getTime() - bd.getTime();
  })[0];

  const summaryLines = rows.slice(0, 30).map((r) => {
    const created = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
    const ageDays = Math.floor((Date.now() - created.getTime()) / 86400000);
    return `- "${r.title}" (${r.status}, ${r.priority}, ${ageDays}d old, assignee ${r.assignee ?? "unassigned"})`;
  }).join("\n");

  const system =
    "You write 1-paragraph status summaries for software-startup project pages. " +
    "Tone: specific, data-aware, concise, no cheerleading, no exclamation points, no markdown, no bullets. " +
    "Reference 1-2 specific task names. Name the assignee on a critical-path task if there's a clear bottleneck. " +
    "Max 3 sentences. Plain prose only.";

  const prompt =
    `Project: "${project.name}"\n` +
    (project.description ? `Description: ${project.description.slice(0, 240)}\n` : "") +
    `Stats: ${rows.length} total tasks (${open.length} open, ${done.length} done, ${overdue} overdue).\n` +
    (oldest ? `Oldest open: "${oldest.title}" (assignee ${oldest.assignee ?? "unassigned"})\n` : "") +
    `\nTask list:\n${summaryLines || "(empty)"}\n\n` +
    `Write the status paragraph.`;

  const started = Date.now();
  try {
    const r = await llm.complete({
      sensitivity: "internal",
      system,
      prompt,
      temperature: 0.4,
      maxTokens: 220,
      timeoutMs: 25_000,
    });
    let body = (r.text ?? "").trim();
    if (!body || body.length < 6) return { ok: false, error: "empty model output" };
    if (body.length > 1200) body = body.slice(0, 1200);
    const durationMs = Date.now() - started;

    await db
      .insert(projectSummaries)
      .values({ projectId, date: today, kind: "health", body, model: r.model, durationMs })
      .onConflictDoUpdate({
        target: [projectSummaries.projectId, projectSummaries.date, projectSummaries.kind],
        set: { body, model: r.model, durationMs, generatedAt: new Date() },
      });

    log.info("project_summary.generated", { projectId, model: r.model, durationMs });
    revalidatePath(`/projects`);
    return { ok: true, body, model: r.model, generatedAt: new Date(), cached: false };
  } catch (e) {
    log.error("project_summary.failed", { error: (e as Error).message });
    return { ok: false, error: (e as Error).message };
  }
}

export async function refreshProjectSummary(formData: FormData): Promise<void> {
  const projectId = (formData.get("projectId") as string) ?? "";
  if (!projectId) return;
  await getOrGenerateProjectSummary(projectId, { force: true });
}
