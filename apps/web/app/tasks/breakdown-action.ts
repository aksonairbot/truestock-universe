// apps/web/app/tasks/breakdown-action.ts
//
// AI suggests 3-6 concrete subtasks for a parent task. Returns the list
// without inserting — user reviews and accepts. Each accepted suggestion
// is inserted via the existing addSubtask flow.

"use server";

import { getDb, tasks, projects, eq } from "@tu/db";
import { llm } from "@/lib/llm";
import { log } from "@/lib/log";

export interface BreakdownResult {
  ok: boolean;
  subtasks?: string[];
  reasoning?: string;
  model?: string;
  durationMs?: number;
  error?: string;
}

export async function breakDownTask(taskId: string): Promise<BreakdownResult> {
  if (!taskId) return { ok: false, error: "no taskId" };

  const db = getDb();
  const [t] = await db
    .select({
      title: tasks.title,
      description: tasks.description,
      priority: tasks.priority,
      project: projects.name,
      projectDescription: projects.description,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!t) return { ok: false, error: "task not found" };

  const system =
    "You break tasks into 3 to 6 concrete subtasks that are small enough to close in a day each. " +
    "Each subtask is a short imperative phrase (5–10 words, sentence case, no period). " +
    "No sub-sub-tasks. No vague verbs like 'work on' or 'handle'. Use specifics. " +
    "Return strict JSON only — no prose, no markdown fences.";

  const schema = {
    type: "object",
    properties: {
      subtasks: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 6 },
      reasoning: { type: "string" },
    },
    required: ["subtasks", "reasoning"],
  };

  const prompt =
    `Parent task: "${t.title}"\n` +
    (t.description ? `Description: ${t.description.slice(0, 800)}\n` : "") +
    `Project: ${t.project}${t.projectDescription ? ` — ${t.projectDescription.slice(0, 200)}` : ""}\n` +
    `Priority: ${t.priority}\n\n` +
    `Break it into 3–6 concrete next-step subtasks. Sentence case. No sub-sub-tasks.`;

  try {
    const r = await llm.complete({
      sensitivity: "internal",
      system,
      prompt,
      jsonSchema: schema,
      temperature: 0.3,
      maxTokens: 350,
      timeoutMs: 25_000,
    });
    if (!r.parsed) {
      log.warn("breakdown.parse_failed", { text: r.text.slice(0, 200) });
      return { ok: false, error: r.parseError ?? "model did not return JSON" };
    }
    const parsed = r.parsed as { subtasks?: unknown; reasoning?: unknown };
    const list = Array.isArray(parsed.subtasks)
      ? parsed.subtasks
          .filter((s) => typeof s === "string")
          .map((s) => (s as string).trim().replace(/[.;:!]+$/, ""))
          .filter((s) => s.length > 0 && s.length <= 250)
          .slice(0, 6)
      : [];
    if (list.length === 0) return { ok: false, error: "no usable subtasks returned" };

    return {
      ok: true,
      subtasks: list,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning.slice(0, 400) : undefined,
      model: r.model,
      durationMs: r.usage?.durationMs,
    };
  } catch (e) {
    log.error("breakdown.failed", { error: (e as Error).message });
    return { ok: false, error: (e as Error).message };
  }
}
