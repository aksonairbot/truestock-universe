// apps/web/app/tasks/triage-action.ts
//
// AI triage for new task drafts. Sends title + description to the configured
// LLM (defaults to Ollama qwen3:8b on the Monk droplet) and returns suggested
// project / assignee / priority / due-offset / reasoning so the form can
// prefill. Internal data only — task titles routed to the self-hosted Ollama
// box via the VPC private IP. Never sends anything to a public API.

"use server";

import { getDb, projects, users, eq, isNull, sql } from "@tu/db";
import { llm } from "@/lib/llm";
import { log } from "@/lib/log";
import { getDigestContext } from "@/lib/knowledge-digest";

export interface TriageSuggestion {
  projectSlug: string | null;
  assigneeEmail: string | null;
  priority: "low" | "med" | "high" | "urgent" | null;
  dueOffsetDays: number | null;
  reasoning: string;
}

export interface TriageResult {
  ok: boolean;
  suggestion?: TriageSuggestion;
  error?: string;
  provider?: string;
  model?: string;
  durationMs?: number;
}

const PRIORITIES = new Set(["low", "med", "high", "urgent"]);

export async function suggestTaskMeta(input: {
  title: string;
  description?: string;
}): Promise<TriageResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "title is empty" };

  // Hard cap inputs so we don't ship novellas to the model.
  const description = (input.description ?? "").trim().slice(0, 2000);

  const available = llm.available();
  if (available.length === 0) {
    return {
      ok: false,
      error:
        "No LLM provider configured. Set OLLAMA_BASE_URL (or ANTHROPIC_API_KEY / DEEPSEEK_API_KEY) in .env.",
    };
  }

  const db = getDb();

  const projectRows = await db
    .select({ slug: projects.slug, name: projects.name, description: projects.description })
    .from(projects)
    .where(isNull(projects.archivedAt));

  const userRows = await db
    .select({ email: users.email, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.isActive, true));

  // Stats — recent task volume per project / per assignee, used as context to
  // bias the model toward people/projects that actually do this kind of work.
  // Kept small; this is hint-quality, not training-quality.
  const recentByProject = await db.execute(sql<{ slug: string; n: number }>`
    select p.slug, count(*)::int as n
    from tasks t join projects p on t.project_id = p.id
    where t.created_at >= now() - interval '30 days'
    group by p.slug order by n desc limit 10
  `);
  const recentByAssignee = await db.execute(sql<{ email: string; n: number }>`
    select u.email, count(*)::int as n
    from tasks t join users u on t.assignee_id = u.id
    where t.assignee_id is not null and t.created_at >= now() - interval '30 days'
    group by u.email order by n desc limit 15
  `);

  const projectCatalogue = projectRows
    .map((p) => `- slug:"${p.slug}" name:"${p.name}"${p.description ? ` — ${p.description.slice(0, 140)}` : ""}`)
    .join("\n");
  const peopleCatalogue = userRows
    .map((u) => `- email:"${u.email}" name:"${u.name}" role:${u.role}`)
    .join("\n");
  const recentProjects = (recentByProject as unknown as Array<{ slug: string; n: number }>)
    .map((r) => `${r.slug}:${r.n}`).join(", ");
  const recentAssignees = (recentByAssignee as unknown as Array<{ email: string; n: number }>)
    .map((r) => `${r.email}:${r.n}`).join(", ");

  // Pull institutional knowledge for richer context
  const digestContext = await getDigestContext();

  const system =
    "You are a task-triage assistant for a small fintech startup called Truestock. " +
    "Given a draft task title + optional description, you pick the best project, assignee, " +
    "priority, and due-date offset based on the company's project catalogue and the team's recent work patterns. " +
    "You return ONLY valid JSON matching the schema, no prose, no markdown fences." +
    (digestContext ? `\n\n${digestContext}` : "");

  const prompt = `New task draft:
TITLE: ${title}
DESCRIPTION: ${description || "(none)"}

Project catalogue:
${projectCatalogue}

Team:
${peopleCatalogue}

Recent task counts per project (last 30 days): ${recentProjects}
Recent task counts per assignee (last 30 days): ${recentAssignees}

Rules:
- projectSlug MUST match one of the slugs in the catalogue exactly. If unsure, pick the closest match.
- assigneeEmail MUST match one of the team emails exactly. If unsure, pick whoever owns the most recent work in that project. Use null only if truly ambiguous.
- priority: "urgent" only for blocking incidents, payments, security, legal; "high" for time-sensitive work; "med" for normal sprint work; "low" for chores, polish, nice-to-haves.
- dueOffsetDays: 0 = today, 1 = tomorrow, 7 = a week. null = no specific due date. Be realistic — most tasks are 3-10 days out.
- reasoning: one short sentence explaining the picks. No fluff.`;

  const schema = {
    type: "object",
    properties: {
      projectSlug: { type: ["string", "null"] },
      assigneeEmail: { type: ["string", "null"] },
      priority: { type: ["string", "null"], enum: ["low", "med", "high", "urgent", null] },
      dueOffsetDays: { type: ["integer", "null"] },
      reasoning: { type: "string" },
    },
    required: ["projectSlug", "assigneeEmail", "priority", "dueOffsetDays", "reasoning"],
  };

  try {
    const r = await llm.complete({
      sensitivity: "internal",
      system,
      prompt,
      jsonSchema: schema,
      temperature: 0.1,
      maxTokens: 400,
      timeoutMs: 25_000,
    });

    if (!r.parsed) {
      log.warn("triage.parse_failed", { provider: r.provider, model: r.model, text: r.text.slice(0, 200) });
      return { ok: false, error: r.parseError ?? "model did not return JSON", provider: r.provider, model: r.model };
    }
    const raw = r.parsed as Partial<TriageSuggestion>;
    const validSlugs = new Set(projectRows.map((p) => p.slug));
    const validEmails = new Set(userRows.map((u) => u.email));
    const suggestion: TriageSuggestion = {
      projectSlug: raw.projectSlug && validSlugs.has(raw.projectSlug) ? raw.projectSlug : null,
      assigneeEmail: raw.assigneeEmail && validEmails.has(raw.assigneeEmail) ? raw.assigneeEmail : null,
      priority: raw.priority && PRIORITIES.has(raw.priority) ? (raw.priority as TriageSuggestion["priority"]) : null,
      dueOffsetDays:
        typeof raw.dueOffsetDays === "number" && raw.dueOffsetDays >= -30 && raw.dueOffsetDays <= 365
          ? Math.round(raw.dueOffsetDays)
          : null,
      reasoning: typeof raw.reasoning === "string" ? raw.reasoning.slice(0, 400) : "",
    };

    log.info("triage.ok", {
      provider: r.provider, model: r.model,
      durationMs: r.usage?.durationMs,
      slug: suggestion.projectSlug, email: suggestion.assigneeEmail, priority: suggestion.priority,
    });

    return {
      ok: true,
      suggestion,
      provider: r.provider,
      model: r.model,
      durationMs: r.usage?.durationMs,
    };
  } catch (e) {
    log.error("triage.failed", { error: (e as Error).message });
    return { ok: false, error: (e as Error).message };
  }
}
