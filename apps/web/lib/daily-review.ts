// apps/web/lib/daily-review.ts
//
// Daily AI review — runs at 9 AM IST via cron.
// Gathers yesterday's activity per person, generates an AI snippet in a
// random tone (motivating, sarcastic, roasting, hype, chill, poetic, drill-sergeant, bollywood),
// then stores them in the daily_reviews table for display on the Today page.

import { getDb, users, tasks, taskComments, departments, dailyReviews, eq, and, sql } from "@tu/db";
import { llm } from "./llm";
import { log } from "./log";

const TONES = [
  "motivating and inspiring — like a coach before a big game",
  "sarcastically funny — dry wit, backhanded compliments",
  "roasting — savage but playful burns, nothing personal",
  "hype beast — over-the-top excited about everything",
  "chill vibes — laid-back, zen, like a surfer philosopher",
  "poetic — rhymes and metaphors, like a spoken word artist",
  "drill sergeant — military style, barking orders and praise",
  "bollywood dramatic — filmy dialogues and dramatic flair",
] as const;

function pickTone(): string {
  return TONES[Math.floor(Math.random() * TONES.length)]!;
}

function yesterdayRange(): { start: string; end: string; label: string; dateStr: string } {
  const now = new Date();
  const istDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const today = new Date(`${istDay}T00:00:00+05:30`);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);
  return {
    start: `${yStr}T00:00:00+05:30`,
    end: `${istDay}T00:00:00+05:30`,
    dateStr: yStr,
    label: yesterday.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "long",
      day: "2-digit",
      month: "short",
    }),
  };
}

interface PersonStats {
  id: string;
  name: string;
  department: string | null;
  tasksCompleted: number;
  tasksCreated: number;
  commentsPosted: number;
  completedTitles: string[];
  openCount: number;
  overdueCount: number;
}

async function gatherStats(): Promise<PersonStats[]> {
  const db = getDb();
  const { start, end } = yesterdayRange();

  const activeUsers = await db
    .select({
      id: users.id,
      name: users.name,
      departmentId: users.departmentId,
    })
    .from(users)
    .where(eq(users.isActive, true));

  const deptRows = await db.select({ id: departments.id, name: departments.name }).from(departments);
  const deptMap = new Map(deptRows.map((d) => [d.id, d.name]));

  const stats: PersonStats[] = [];

  for (const u of activeUsers) {
    const completedRows = await db
      .select({ title: tasks.title })
      .from(tasks)
      .where(
        and(
          eq(tasks.assigneeId, u.id),
          eq(tasks.status, "done"),
          sql`${tasks.completedAt} >= ${start}`,
          sql`${tasks.completedAt} < ${end}`,
        ),
      );

    const [createdRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(
          eq(tasks.createdById, u.id),
          sql`${tasks.createdAt} >= ${start}`,
          sql`${tasks.createdAt} < ${end}`,
        ),
      );

    const [commentRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(taskComments)
      .where(
        and(
          eq(taskComments.authorId, u.id),
          sql`${taskComments.createdAt} >= ${start}`,
          sql`${taskComments.createdAt} < ${end}`,
        ),
      );

    const [openRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(
          eq(tasks.assigneeId, u.id),
          sql`${tasks.status} not in ('done'::task_status,'cancelled'::task_status)`,
        ),
      );

    const [overdueRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(
          eq(tasks.assigneeId, u.id),
          sql`${tasks.status} not in ('done'::task_status,'cancelled'::task_status)`,
          sql`${tasks.dueDate} < (now() at time zone 'Asia/Kolkata')::date`,
        ),
      );

    stats.push({
      id: u.id,
      name: u.name,
      department: u.departmentId ? deptMap.get(u.departmentId) ?? null : null,
      tasksCompleted: completedRows.length,
      tasksCreated: createdRow?.n ?? 0,
      commentsPosted: commentRow?.n ?? 0,
      completedTitles: completedRows.map((r) => r.title).slice(0, 5),
      openCount: openRow?.n ?? 0,
      overdueCount: overdueRow?.n ?? 0,
    });
  }

  return stats;
}

async function generatePersonalSnippet(person: PersonStats, tone: string, dateLabel: string): Promise<string> {
  const prompt = `Write a short review (3-5 lines max, use markdown **bold** and _italic_) reviewing ${person.name}'s work yesterday (${dateLabel}).

Stats:
- Tasks completed: ${person.tasksCompleted}${person.completedTitles.length > 0 ? ` (${person.completedTitles.join(", ")})` : ""}
- Tasks created: ${person.tasksCreated}
- Comments posted: ${person.commentsPosted}
- Currently open tasks: ${person.openCount}
- Overdue tasks: ${person.overdueCount}
${person.department ? `- Department: ${person.department}` : ""}

Tone: ${tone}

Rules:
- Keep it under 5 lines, punchy and fun
- Reference specific numbers
- If they did nothing (0 completed, 0 created, 0 comments), call that out in the chosen tone
- If they have overdue tasks, mention it
- End with one actionable nudge for today
- No hashtags, no emojis overload (max 2 emojis)
- Start with "Hey ${person.name.split(" ")[0]}!" on the first line`;

  const r = await llm.complete({
    sensitivity: "internal",
    provider: "deepseek",
    system: "You write short, punchy review messages for a team productivity tool called SeekPeek. Keep messages concise and impactful.",
    prompt,
    temperature: 0.8,
    maxTokens: 200,
    timeoutMs: 15_000,
  });

  return r.text?.trim() ?? `Hey ${person.name}! Your daily review is brewing... check SeekPeek for details.`;
}

async function generateTeamSummary(stats: PersonStats[], tone: string, dateLabel: string): Promise<string> {
  const totalCompleted = stats.reduce((s, p) => s + p.tasksCompleted, 0);
  const totalCreated = stats.reduce((s, p) => s + p.tasksCreated, 0);
  const totalComments = stats.reduce((s, p) => s + p.commentsPosted, 0);
  const totalOverdue = stats.reduce((s, p) => s + p.overdueCount, 0);

  const topClosers = [...stats]
    .sort((a, b) => b.tasksCompleted - a.tasksCompleted)
    .filter((p) => p.tasksCompleted > 0)
    .slice(0, 3);

  const slackers = stats.filter(
    (p) => p.tasksCompleted === 0 && p.tasksCreated === 0 && p.commentsPosted === 0,
  );

  const prompt = `Write a team summary (5-8 lines max, use markdown **bold** and _italic_) for yesterday (${dateLabel}).

Team stats:
- Total tasks completed: ${totalCompleted}
- Total tasks created: ${totalCreated}
- Total comments: ${totalComments}
- Total overdue across team: ${totalOverdue}
- Team size: ${stats.length}
- Top closers: ${topClosers.map((p) => `${p.name} (${p.tasksCompleted})`).join(", ") || "nobody"}
- Zero activity: ${slackers.map((p) => p.name).join(", ") || "everyone contributed"}

Tone: ${tone}

Rules:
- Start with "**SeekPeek Daily — ${dateLabel}**" as header
- Highlight top performers by first name
- Call out zero-activity people by first name (playfully)
- Mention overdue count if > 0
- Keep it punchy, no more than 8 lines
- Max 3 emojis total
- End with a one-liner about today`;

  const r = await llm.complete({
    sensitivity: "internal",
    provider: "deepseek",
    system: "You write team summary messages for SeekPeek, a productivity tool. Concise, punchy, team-focused.",
    prompt,
    temperature: 0.8,
    maxTokens: 300,
    timeoutMs: 15_000,
  });

  return r.text?.trim() ?? `**SeekPeek Daily — ${dateLabel}**\n${totalCompleted} tasks closed, ${totalOverdue} overdue. Check the dashboard for details.`;
}

/**
 * Run the daily review. Call from a cron endpoint.
 * Generates AI snippets and stores them in daily_reviews table.
 */
export async function runDailyReview(): Promise<{
  tone: string;
  date: string;
  individual: { name: string; generated: boolean; error?: string }[];
  team: { generated: boolean; error?: string };
}> {
  const tone = pickTone();
  const { label, dateStr } = yesterdayRange();
  log.info("daily_review.start", { tone, date: label });

  const db = getDb();
  const stats = await gatherStats();
  const results: { name: string; generated: boolean; error?: string }[] = [];

  // Generate & store individual reviews
  for (const person of stats) {
    try {
      const msg = await generatePersonalSnippet(person, tone, label);
      await db
        .insert(dailyReviews)
        .values({
          userId: person.id,
          date: dateStr,
          tone,
          body: msg,
          stats: person as unknown as Record<string, unknown>,
        })
        .onConflictDoUpdate({
          target: [dailyReviews.userId, dailyReviews.date],
          set: { tone, body: msg, stats: person as unknown as Record<string, unknown>, generatedAt: new Date() },
        });
      results.push({ name: person.name, generated: true });
    } catch (err) {
      results.push({
        name: person.name,
        generated: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Generate & store team summary (userId = null)
  let teamResult: { generated: boolean; error?: string };
  try {
    const teamMsg = await generateTeamSummary(stats, tone, label);
    await db
      .insert(dailyReviews)
      .values({
        userId: null,
        date: dateStr,
        tone,
        body: teamMsg,
        stats: {
          totalCompleted: stats.reduce((s, p) => s + p.tasksCompleted, 0),
          totalCreated: stats.reduce((s, p) => s + p.tasksCreated, 0),
          totalComments: stats.reduce((s, p) => s + p.commentsPosted, 0),
          totalOverdue: stats.reduce((s, p) => s + p.overdueCount, 0),
          teamSize: stats.length,
        },
      })
      .onConflictDoUpdate({
        target: [dailyReviews.userId, dailyReviews.date],
        set: {
          tone,
          body: sql`excluded.body`,
          stats: sql`excluded.stats`,
          generatedAt: new Date(),
        },
      });
    teamResult = { generated: true };
  } catch (err) {
    teamResult = { generated: false, error: err instanceof Error ? err.message : String(err) };
  }

  log.info("daily_review.done", {
    tone,
    generated: results.filter((r) => r.generated).length,
    failed: results.filter((r) => !r.generated).length,
    teamGenerated: teamResult.generated,
  });

  return { tone, date: dateStr, individual: results, team: teamResult };
}

/**
 * Get the latest review for a specific user (yesterday's).
 */
export async function getMyReview(userId: string): Promise<{ body: string; tone: string; stats: unknown; date: string } | null> {
  const db = getDb();
  const { dateStr } = yesterdayRange();

  const [row] = await db
    .select({ body: dailyReviews.body, tone: dailyReviews.tone, stats: dailyReviews.stats, date: dailyReviews.date })
    .from(dailyReviews)
    .where(and(eq(dailyReviews.userId, userId), eq(dailyReviews.date, dateStr)))
    .limit(1);

  return row ?? null;
}

/**
 * Get the latest team summary (yesterday's).
 */
export async function getTeamReview(): Promise<{ body: string; tone: string; stats: unknown; date: string } | null> {
  const db = getDb();
  const { dateStr } = yesterdayRange();

  const [row] = await db
    .select({ body: dailyReviews.body, tone: dailyReviews.tone, stats: dailyReviews.stats, date: dailyReviews.date })
    .from(dailyReviews)
    .where(and(sql`${dailyReviews.userId} is null`, eq(dailyReviews.date, dateStr)))
    .limit(1);

  return row ?? null;
}
