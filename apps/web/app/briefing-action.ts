// apps/web/app/briefing-action.ts
//
// AI-generated daily briefings (morning + EoD). The prompt is deliberately
// anti-cheerleading: specific, data-aware, max 3 sentences + 1 honest
// question. No "you got this!" — actual coaching.
//
// Cached per (user, date, kind). Refresh = regenerate + overwrite.

"use server";

import { revalidatePath } from "next/cache";
import {
  getDb,
  dailyBriefings,
  tasks,
  projects,
  taskComments,
  eq,
  and,
  desc,
  sql,
} from "@tu/db";
import { getCurrentUserId, getCurrentUser } from "@/lib/auth";
import { llm } from "@/lib/llm";
import { log } from "@/lib/log";

export type BriefingKind = "morning" | "eod";

function istDayString(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

async function fetchContext(userId: string, kind: BriefingKind) {
  const db = getDb();
  const today = istDayString(new Date());
  const startToday = new Date(`${today}T00:00:00+05:30`);
  const yesterday = new Date(startToday);
  yesterday.setDate(yesterday.getDate() - 1);

  const me = await getCurrentUser();

  // Open queue (assigned, not done/cancelled)
  const open = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      createdAt: tasks.createdAt,
      project: projects.name,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(eq(tasks.assigneeId, userId), sql`${tasks.status} not in ('done'::task_status, 'cancelled'::task_status)`))
    .orderBy(desc(tasks.priority), tasks.dueDate);

  // Closed today (for EoD)
  const closedToday = await db
    .select({ title: tasks.title, project: projects.name })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(
      eq(tasks.assigneeId, userId),
      eq(tasks.status, "done"),
      sql`${tasks.completedAt} >= ${startToday.toISOString()}`,
    ));

  // Comments today (sender or receiver-side activity hint)
  const recentCommentsByMe = await db
    .select({ taskId: taskComments.taskId, body: taskComments.body, at: taskComments.createdAt })
    .from(taskComments)
    .where(and(
      eq(taskComments.authorId, userId),
      sql`${taskComments.createdAt} >= ${startToday.toISOString()}`,
    ))
    .limit(5);

  // Age-of-current-tasks: surface the oldest one + median project completion
  const overdueCount = open.filter((t) => t.dueDate && new Date(`${t.dueDate}T12:00:00+05:30`) < startToday).length;
  const dueToday = open.filter((t) => t.dueDate && istDayString(new Date(`${t.dueDate}T12:00:00+05:30`)) === today).length;

  return {
    name: me.name,
    today,
    open,
    overdueCount,
    dueToday,
    closedToday,
    commentsToday: recentCommentsByMe,
  };
}

export interface BriefingResult {
  ok: boolean;
  body?: string;
  generatedAt?: Date;
  model?: string;
  cached?: boolean;
  error?: string;
}

export async function getOrGenerateBriefing(kind: BriefingKind, opts?: { force?: boolean }): Promise<BriefingResult> {
  const userId = await getCurrentUserId();
  const today = istDayString(new Date());
  const db = getDb();

  if (!opts?.force) {
    const [existing] = await db
      .select()
      .from(dailyBriefings)
      .where(and(
        eq(dailyBriefings.userId, userId),
        eq(dailyBriefings.date, today),
        eq(dailyBriefings.kind, kind),
      ))
      .limit(1);
    if (existing) {
      return { ok: true, body: existing.body, generatedAt: existing.generatedAt, model: existing.model ?? undefined, cached: true };
    }
  }

  const ctx = await fetchContext(userId, kind);

  // ---- prompt ----
  const system = kind === "morning"
    ? "You are a calm, specific, data-aware coach for a software-startup team. Tone: concise, direct, no cheerleading, no exclamation points, no 'you got this'. Address the user by first name once at the start. Max 3 sentences + at most 1 honest question. Reference specific task titles when relevant. If something has been open unusually long, gently call it out and suggest a concrete next step. If nothing is on plate, say so and suggest one specific small thing they might tackle (a comment, a triage, a follow-up). Never invent tasks. Always plain prose, no markdown, no bullets."
    : "You are a calm, specific, data-aware coach. Tone: concise, no cheerleading. Recap what the user actually closed today by name (1 sentence), then ask exactly 1 honest question about anything that looks stuck or still open. Max 2-3 sentences total. Plain prose, no markdown.";

  const openLines = ctx.open.slice(0, 8).map((t) => {
    const due = t.dueDate ? ` due ${t.dueDate}` : "";
    const created = t.createdAt instanceof Date ? t.createdAt : new Date(t.createdAt);
    const ageDays = Math.floor((Date.now() - created.getTime()) / 86400000);
    return `- "${t.title}" (${t.project}, ${t.priority},${due}, ${ageDays}d old, status ${t.status})`;
  }).join("\n");
  const closedLines = ctx.closedToday.map((t) => `- "${t.title}" (${t.project})`).join("\n");
  const commentLines = ctx.commentsToday.slice(0, 5).map((c) => `- ${c.body.slice(0, 120)}`).join("\n");

  const userPrompt = kind === "morning" ? `
First name: ${ctx.name.split(/\s+/)[0]}
Today (Asia/Kolkata): ${ctx.today}
Open queue (${ctx.open.length} total, ${ctx.overdueCount} overdue, ${ctx.dueToday} due today):
${openLines || "  (nothing assigned)"}
` : `
First name: ${ctx.name.split(/\s+/)[0]}
Today (Asia/Kolkata): ${ctx.today}
Closed today (${ctx.closedToday.length}):
${closedLines || "  (nothing closed today)"}
Still open (${ctx.open.length}, ${ctx.overdueCount} overdue):
${openLines || "  (nothing open)"}
Comments by them today: ${commentLines || "(none)"}
`;

  const started = Date.now();
  let body = "";
  let model = "";
  try {
    const r = await llm.complete({
      sensitivity: "internal",
      provider: "deepseek",
      system,
      prompt: userPrompt,
      temperature: 0.4,
      maxTokens: 220,
      timeoutMs: 25_000,
    });
    body = (r.text ?? "").trim();
    model = r.model;
  } catch (e) {
    log.error("briefing.failed", { kind, error: (e as Error).message });
    return { ok: false, error: (e as Error).message };
  }

  // Guard against empty / runaway outputs.
  if (!body || body.length < 6) {
    return { ok: false, error: "model returned empty body" };
  }
  if (body.length > 1200) body = body.slice(0, 1200);

  const durationMs = Date.now() - started;

  // Upsert by (userId, date, kind) — drizzle on conflict.
  await db
    .insert(dailyBriefings)
    .values({ userId, date: today, kind, body, model, durationMs })
    .onConflictDoUpdate({
      target: [dailyBriefings.userId, dailyBriefings.date, dailyBriefings.kind],
      set: { body, model, durationMs, generatedAt: new Date() },
    });

  log.info("briefing.generated", { kind, durationMs, model });
  return { ok: true, body, generatedAt: new Date(), model, cached: false };
}

/** Bound to the "Refresh" button form on the briefing card. */
export async function refreshBriefing(formData: FormData): Promise<void> {
  const kindRaw = (formData.get("kind") as string) ?? "morning";
  const kind: BriefingKind = kindRaw === "eod" ? "eod" : "morning";
  await getOrGenerateBriefing(kind, { force: true });
  revalidatePath("/");
}
