// apps/web/lib/briefing.ts
//
// Core briefing generation, extracted from app/briefing-action.ts so the
// 9 AM cron can PRE-WARM briefings for every active user. (It can't live in
// the "use server" action file — any export there becomes a public endpoint,
// and this function takes an arbitrary userId.)
//
// Cached per (user, date, kind) in daily_briefings. The interactive action
// wraps this with auth; the cron calls it with skipIfExists so already-warm
// users cost one SELECT.

import {
  getDb,
  dailyBriefings,
  tasks,
  projects,
  taskComments,
  users,
  eq,
  and,
  desc,
  sql,
} from "@tu/db";
import { llm } from "@/lib/llm";
import { log } from "@/lib/log";

export type BriefingKind = "morning" | "eod";

export interface BriefingResult {
  ok: boolean;
  body?: string;
  generatedAt?: Date;
  model?: string;
  cached?: boolean;
  error?: string;
}

function istDayString(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

async function fetchContext(userId: string, userName: string) {
  const db = getDb();
  const today = istDayString(new Date());
  const startToday = new Date(`${today}T00:00:00+05:30`);

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
    name: userName,
    today,
    open,
    overdueCount,
    dueToday,
    closedToday,
    commentsToday: recentCommentsByMe,
  };
}

export async function generateBriefing(
  userId: string,
  userName: string,
  kind: BriefingKind,
  opts?: { skipIfExists?: boolean },
): Promise<BriefingResult> {
  const db = getDb();
  const today = istDayString(new Date());

  if (opts?.skipIfExists) {
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

  const ctx = await fetchContext(userId, userName);

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

/**
 * Pre-warm morning briefings for every active user. Called from the 9 AM
 * cron so the first Today-page view of the day never blocks on the LLM.
 * Sequential on purpose — one in-flight LLM call at a time.
 */
export async function prewarmMorningBriefings(): Promise<{ generated: number; skipped: number; failed: number }> {
  const db = getDb();
  const active = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.isActive, true));

  let generated = 0, skipped = 0, failed = 0;
  for (const u of active) {
    try {
      const r = await generateBriefing(u.id, u.name, "morning", { skipIfExists: true });
      if (!r.ok) failed++;
      else if (r.cached) skipped++;
      else generated++;
    } catch (e) {
      failed++;
      log.warn("briefing.prewarm_failed", { userId: u.id, error: (e as Error).message });
    }
  }
  log.info("briefing.prewarm_done", { generated, skipped, failed, total: active.length });
  return { generated, skipped, failed };
}
