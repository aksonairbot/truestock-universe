// apps/web/lib/knowledge-digest.ts
//
// Generates nightly knowledge digests — structured snapshots of project state,
// team patterns, and recent task activity. Stored in ai_knowledge_digests and
// injected into AI prompts (triage, clarity, reviews) so the model has
// institutional memory about what's happening across the org.

import {
  getDb,
  projects,
  tasks,
  users,
  taskComments,
  aiKnowledgeDigests,
  eq,
  isNull,
  sql,
  desc,
  gte,
  and,
} from "@tu/db";
import { llm } from "@/lib/llm";
import { log } from "@/lib/log";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectSnapshot {
  slug: string;
  name: string;
  description: string | null;
  openTasks: number;
  doneLast7d: number;
  createdLast7d: number;
  recentTitles: string[];
  topAssignees: string[];
}

interface TeamPattern {
  avgTasksPerDay7d: number;
  busiestProject: string | null;
  mostActiveUser: string | null;
  statusDistribution: Record<string, number>;
}

interface DigestData {
  projects: ProjectSnapshot[];
  teamPatterns: TeamPattern;
  recentCompletions: string[];
  activeThemes: string[];
}

// ---------------------------------------------------------------------------
// Public: generate + store digest
// ---------------------------------------------------------------------------

export async function generateKnowledgeDigest(): Promise<{
  ok: boolean;
  date: string;
  durationMs?: number;
  error?: string;
}> {
  const started = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const db = getDb();

  try {
    // 1. Gather raw data
    const digestData = await gatherDigestData();

    // 2. Ask the LLM to synthesize a prose summary
    let summary: string | null = null;
    let provider: string | undefined;
    let model: string | undefined;
    try {
      const r = await synthesizeSummary(digestData);
      summary = r.summary;
      provider = r.provider;
      model = r.model;
    } catch (e) {
      log.warn("knowledge_digest.summary_failed", { error: (e as Error).message });
      // Digest data is still valuable without a prose summary
    }

    // 3. Upsert into DB
    const durationMs = Date.now() - started;
    await db
      .insert(aiKnowledgeDigests)
      .values({
        date: today,
        scope: "global",
        digest: digestData as unknown as Record<string, unknown>,
        summary,
        durationMs,
        provider: provider ?? null,
        model: model ?? null,
      })
      .onConflictDoUpdate({
        target: [aiKnowledgeDigests.date, aiKnowledgeDigests.scope],
        set: {
          digest: digestData as unknown as Record<string, unknown>,
          summary,
          durationMs,
          provider: provider ?? null,
          model: model ?? null,
          generatedAt: sql`now()`,
        },
      });

    log.info("knowledge_digest.ok", { date: today, durationMs, provider });
    return { ok: true, date: today, durationMs };
  } catch (e) {
    log.error("knowledge_digest.failed", { error: (e as Error).message });
    return { ok: false, date: today, error: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Public: get latest digest for AI prompts
// ---------------------------------------------------------------------------

export async function getLatestDigest(): Promise<{
  digest: DigestData | null;
  summary: string | null;
  date: string | null;
}> {
  const db = getDb();
  const [row] = await db
    .select({
      digest: aiKnowledgeDigests.digest,
      summary: aiKnowledgeDigests.summary,
      date: aiKnowledgeDigests.date,
    })
    .from(aiKnowledgeDigests)
    .where(eq(aiKnowledgeDigests.scope, "global"))
    .orderBy(desc(aiKnowledgeDigests.date))
    .limit(1);

  if (!row) return { digest: null, summary: null, date: null };
  return {
    digest: row.digest as unknown as DigestData,
    summary: row.summary,
    date: row.date,
  };
}

/**
 * Returns a compact context block ready to inject into an AI system prompt.
 * If no digest exists, returns an empty string (no-op).
 */
export async function getDigestContext(): Promise<string> {
  const { digest, summary, date } = await getLatestDigest();
  if (!digest) return "";

  const lines: string[] = [
    `\n--- TEAM KNOWLEDGE (as of ${date}) ---`,
  ];

  if (summary) {
    lines.push(summary);
  }

  // Compact project list
  if (digest.projects.length > 0) {
    lines.push("\nActive projects:");
    for (const p of digest.projects) {
      const assignees = p.topAssignees.length > 0 ? ` (${p.topAssignees.join(", ")})` : "";
      lines.push(`- ${p.slug}: ${p.openTasks} open, ${p.doneLast7d} done this week${assignees}`);
    }
  }

  // Recent completions give context about what kind of work the team does
  if (digest.recentCompletions.length > 0) {
    lines.push("\nRecently completed tasks:");
    for (const t of digest.recentCompletions.slice(0, 8)) {
      lines.push(`- ${t}`);
    }
  }

  // Active themes
  if (digest.activeThemes.length > 0) {
    lines.push(`\nCurrent focus areas: ${digest.activeThemes.join(", ")}`);
  }

  lines.push("--- END TEAM KNOWLEDGE ---\n");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Data gathering
// ---------------------------------------------------------------------------

async function gatherDigestData(): Promise<DigestData> {
  const db = getDb();
  const sevenDaysAgo = sql`now() - interval '7 days'`;
  const thirtyDaysAgo = sql`now() - interval '30 days'`;

  // Project snapshots with task counts
  const projectRows = await db.execute(sql`
    SELECT
      p.slug,
      p.name,
      p.description,
      count(*) FILTER (WHERE t.status NOT IN ('done', 'cancelled'))::int AS open_tasks,
      count(*) FILTER (WHERE t.status = 'done' AND t.updated_at >= ${sevenDaysAgo})::int AS done_last_7d,
      count(*) FILTER (WHERE t.created_at >= ${sevenDaysAgo})::int AS created_last_7d
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id
    WHERE p.archived_at IS NULL
    GROUP BY p.id
    ORDER BY open_tasks DESC
  `) as unknown as Array<{
    slug: string;
    name: string;
    description: string | null;
    open_tasks: number;
    done_last_7d: number;
    created_last_7d: number;
  }>;

  // Recent task titles per project (last 7 days)
  const recentTasks = await db.execute(sql`
    SELECT p.slug, t.title
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.created_at >= ${sevenDaysAgo}
    ORDER BY t.created_at DESC
    LIMIT 100
  `) as unknown as Array<{ slug: string; title: string }>;

  const titlesByProject = new Map<string, string[]>();
  for (const r of recentTasks) {
    const arr = titlesByProject.get(r.slug) ?? [];
    arr.push(r.title);
    titlesByProject.set(r.slug, arr);
  }

  // Top assignees per project (last 30 days)
  const assigneesByProject = await db.execute(sql`
    SELECT p.slug, u.name AS assignee, count(*)::int AS n
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    JOIN users u ON t.assignee_id = u.id
    WHERE t.created_at >= ${thirtyDaysAgo} AND t.assignee_id IS NOT NULL
    GROUP BY p.slug, u.name
    ORDER BY p.slug, n DESC
  `) as unknown as Array<{ slug: string; assignee: string; n: number }>;

  const topAssigneesByProject = new Map<string, string[]>();
  for (const r of assigneesByProject) {
    const arr = topAssigneesByProject.get(r.slug) ?? [];
    if (arr.length < 3) arr.push(r.assignee);
    topAssigneesByProject.set(r.slug, arr);
  }

  const projectSnapshots: ProjectSnapshot[] = projectRows.map((p) => ({
    slug: p.slug,
    name: p.name,
    description: p.description,
    openTasks: p.open_tasks,
    doneLast7d: p.done_last_7d,
    createdLast7d: p.created_last_7d,
    recentTitles: (titlesByProject.get(p.slug) ?? []).slice(0, 5),
    topAssignees: topAssigneesByProject.get(p.slug) ?? [],
  }));

  // Team-wide patterns
  const taskVelocity = await db.execute(sql`
    SELECT count(*)::int AS total
    FROM tasks
    WHERE created_at >= ${sevenDaysAgo}
  `) as unknown as Array<{ total: number }>;

  const statusDist = await db.execute(sql`
    SELECT status, count(*)::int AS n
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE p.archived_at IS NULL
    GROUP BY status
  `) as unknown as Array<{ status: string; n: number }>;

  const busiestProject = projectRows.length > 0 ? projectRows[0]!.slug : null;

  const mostActive = await db.execute(sql`
    SELECT u.name, count(*)::int AS n
    FROM tasks t
    JOIN users u ON t.assignee_id = u.id
    WHERE t.created_at >= ${sevenDaysAgo} AND t.assignee_id IS NOT NULL
    GROUP BY u.name
    ORDER BY n DESC
    LIMIT 1
  `) as unknown as Array<{ name: string; n: number }>;

  const teamPatterns: TeamPattern = {
    avgTasksPerDay7d: Math.round((taskVelocity[0]?.total ?? 0) / 7 * 10) / 10,
    busiestProject,
    mostActiveUser: mostActive[0]?.name ?? null,
    statusDistribution: Object.fromEntries(statusDist.map((r) => [r.status, r.n])),
  };

  // Recent completions (with descriptions) for context on work style
  const completions = await db.execute(sql`
    SELECT t.title, p.slug AS project
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.status = 'done' AND t.updated_at >= ${sevenDaysAgo}
    ORDER BY t.updated_at DESC
    LIMIT 15
  `) as unknown as Array<{ title: string; project: string }>;

  const recentCompletions = completions.map((c) => `[${c.project}] ${c.title}`);

  return {
    projects: projectSnapshots,
    teamPatterns,
    recentCompletions,
    activeThemes: [], // filled by LLM in synthesize step
  };
}

// ---------------------------------------------------------------------------
// LLM summary synthesis
// ---------------------------------------------------------------------------

async function synthesizeSummary(data: DigestData): Promise<{
  summary: string;
  provider?: string;
  model?: string;
}> {
  const available = llm.available();
  if (available.length === 0) {
    return { summary: formatFallbackSummary(data) };
  }

  const system =
    "You are an organizational analyst for a small startup. " +
    "Given structured data about projects and recent tasks, write a concise knowledge brief " +
    "that would help someone triaging new tasks understand the current state of the org. " +
    "Return ONLY valid JSON, no markdown fences.";

  const prompt = `Here's this week's organizational data:

PROJECTS:
${data.projects.map((p) => `- ${p.slug} (${p.name}): ${p.openTasks} open, ${p.doneLast7d} done this week. Recent: ${p.recentTitles.slice(0, 3).join("; ") || "none"}`).join("\n")}

TEAM:
- Avg tasks/day: ${data.teamPatterns.avgTasksPerDay7d}
- Busiest project: ${data.teamPatterns.busiestProject ?? "none"}
- Most active: ${data.teamPatterns.mostActiveUser ?? "none"}
- Status breakdown: ${JSON.stringify(data.teamPatterns.statusDistribution)}

RECENTLY COMPLETED:
${data.recentCompletions.slice(0, 10).join("\n")}

Return JSON:
{
  "summary": "2-4 sentence prose brief about current org state, priorities, and velocity",
  "activeThemes": ["up to 5 recurring topic clusters you see in the task titles"]
}`;

  const schema = {
    type: "object",
    properties: {
      summary: { type: "string" },
      activeThemes: { type: "array", items: { type: "string" } },
    },
    required: ["summary", "activeThemes"],
  };

  const r = await llm.complete({
    sensitivity: "internal",
    system,
    prompt,
    jsonSchema: schema,
    temperature: 0.3,
    maxTokens: 500,
    timeoutMs: 30_000,
  });

  if (r.parsed) {
    const parsed = r.parsed as { summary: string; activeThemes?: string[] };
    // Backfill themes into the digest data
    if (parsed.activeThemes) {
      data.activeThemes = parsed.activeThemes.slice(0, 5);
    }
    return { summary: parsed.summary, provider: r.provider, model: r.model };
  }

  return { summary: formatFallbackSummary(data), provider: r.provider, model: r.model };
}

function formatFallbackSummary(data: DigestData): string {
  const totalOpen = data.projects.reduce((s, p) => s + p.openTasks, 0);
  const totalDone = data.projects.reduce((s, p) => s + p.doneLast7d, 0);
  const busiest = data.teamPatterns.busiestProject;
  return `${data.projects.length} active projects with ${totalOpen} open tasks. ` +
    `${totalDone} tasks completed in the last 7 days. ` +
    (busiest ? `Busiest project: ${busiest}.` : "");
}
