"use server";

import { llm } from "@/lib/llm";
import { log } from "@/lib/log";

export interface ClarityResult {
  ok: boolean;
  clear: boolean;
  questions?: string[];
  summary?: string;
  error?: string;
  provider?: string;
  model?: string;
  durationMs?: number;
}

/**
 * Ask the LLM whether a task title + description is clear enough to act on.
 * If not, it returns 1-3 follow-up questions the creator should answer.
 */
export async function checkTaskClarity(input: {
  title: string;
  description?: string;
}): Promise<ClarityResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, clear: false, error: "title is empty" };

  const description = (input.description ?? "").trim().slice(0, 2000);

  const available = llm.available();
  if (available.length === 0) {
    // No LLM configured — just let the task through
    return { ok: true, clear: true };
  }

  const system =
    "You are a task clarity reviewer for a small team. " +
    "Your job is to check if a task is clear enough for someone to start working on it. " +
    "A clear task has: a specific outcome, enough context to act without guessing, and scope that's not too wide. " +
    "Return ONLY valid JSON, no markdown fences.";

  const prompt = `Review this task for clarity:

TITLE: ${title}
DESCRIPTION: ${description || "(none provided)"}

If the task is clear enough to work on, return:
{"clear": true, "summary": "one-line summary of what's being asked"}

If the task is vague or missing critical info, return:
{"clear": false, "questions": ["question 1", "question 2"]}

Rules:
- Be practical, not pedantic — "Fix login bug" is clear enough if it's obviously about a known issue
- Short titles with no description almost always need clarification
- Ask 1-3 questions max, focused on what's actually needed to start work
- Questions should be specific, not generic ("What's the expected behavior?" not "Can you elaborate?")
- If the title alone is very specific and actionable (e.g. "Add phone validation to signup form"), it's clear even without a description`;

  const schema = {
    type: "object",
    properties: {
      clear: { type: "boolean" },
      summary: { type: "string" },
      questions: { type: "array", items: { type: "string" } },
    },
    required: ["clear"],
  };

  try {
    const r = await llm.complete({
      sensitivity: "internal",
      provider: "deepseek",
      system,
      prompt,
      jsonSchema: schema,
      temperature: 0.2,
      maxTokens: 300,
      timeoutMs: 15_000,
    });

    if (!r.parsed) {
      log.warn("clarity.parse_failed", { text: r.text?.slice(0, 200) });
      // On parse failure, let the task through
      return { ok: true, clear: true, provider: r.provider, model: r.model };
    }

    const raw = r.parsed as { clear: boolean; summary?: string; questions?: string[] };
    log.info("clarity.ok", {
      provider: r.provider,
      model: r.model,
      clear: raw.clear,
      questionCount: raw.questions?.length ?? 0,
    });

    return {
      ok: true,
      clear: !!raw.clear,
      questions: raw.clear ? undefined : (raw.questions ?? []).slice(0, 3),
      summary: raw.summary,
      provider: r.provider,
      model: r.model,
      durationMs: r.usage?.durationMs,
    };
  } catch (e) {
    log.error("clarity.failed", { error: (e as Error).message });
    // On error, let the task through rather than blocking
    return { ok: true, clear: true, error: (e as Error).message };
  }
}
