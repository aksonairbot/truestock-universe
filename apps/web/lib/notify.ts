// apps/web/lib/notify.ts
//
// Server-side helpers for the in-app notifications system. Called from task
// server actions whenever an event happens that someone should know about.
//
// Rules:
//   • Never notify yourself (skip when actorId === userId).
//   • De-dupe at insert time only on (userId, kind, taskId) within the last
//     60 seconds, so a flurry of edits doesn't spam.
//   • Mention parsing: `@firstname` (case-insensitive, word-boundary). Only
//     matches active users. Multiple mentions in one comment → multiple rows.

import { getDb, users, notifications, eq, and, sql } from "@tu/db";

const RECENT_WINDOW_MS = 60_000;

async function insertWithDedupe(opts: {
  userId: string;
  kind: "mention" | "assigned" | "task_completed" | "comment_on_assigned" | "review_requested";
  taskId?: string | null;
  actorId?: string | null;
  body: string;
}) {
  if (opts.actorId && opts.actorId === opts.userId) return; // never notify self

  const db = getDb();
  // Soft dedupe: skip if an identical (userId, kind, taskId) row exists in
  // the last RECENT_WINDOW_MS ms. Mentions are NOT de-duped since each
  // @mention is intentional.
  if (opts.kind !== "mention" && opts.taskId) {
    const recent = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, opts.userId),
          eq(notifications.kind, opts.kind),
          eq(notifications.taskId, opts.taskId),
          sql`${notifications.createdAt} > now() - interval '60 seconds'`,
        ),
      )
      .limit(1);
    if (recent.length > 0) return;
  }

  await db.insert(notifications).values({
    userId: opts.userId,
    kind: opts.kind,
    taskId: opts.taskId ?? null,
    actorId: opts.actorId ?? null,
    body: opts.body.slice(0, 500),
  });
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** Notify a user when they've been assigned a task. */
export async function notifyAssigned(opts: {
  assigneeId: string;
  actorId: string;
  taskId: string;
  taskTitle: string;
}) {
  await insertWithDedupe({
    userId: opts.assigneeId,
    actorId: opts.actorId,
    kind: "assigned",
    taskId: opts.taskId,
    body: `assigned you "${opts.taskTitle}"`,
  });
}

/** Notify the task creator when someone closes a task they created. */
export async function notifyTaskCompleted(opts: {
  creatorId: string;
  actorId: string;
  taskId: string;
  taskTitle: string;
}) {
  await insertWithDedupe({
    userId: opts.creatorId,
    actorId: opts.actorId,
    kind: "task_completed",
    taskId: opts.taskId,
    body: `completed "${opts.taskTitle}"`,
  });
}

/** Notify the assignee when someone else (not them) comments on their task. */
export async function notifyCommentOnAssigned(opts: {
  assigneeId: string;
  actorId: string;
  taskId: string;
  taskTitle: string;
  preview: string;
}) {
  const preview = opts.preview.slice(0, 120);
  await insertWithDedupe({
    userId: opts.assigneeId,
    actorId: opts.actorId,
    kind: "comment_on_assigned",
    taskId: opts.taskId,
    body: `commented on "${opts.taskTitle}": ${preview}${opts.preview.length > 120 ? "…" : ""}`,
  });
}

/**
 * Notify every active user whose first name matches an `@firstname` token in
 * the comment body. Tokens are matched case-insensitively against the first
 * whitespace-separated word of users.name.
 */
export async function notifyMentions(opts: {
  body: string;
  actorId: string;
  taskId: string;
  taskTitle: string;
}) {
  const text = opts.body ?? "";
  if (!text.includes("@")) return;

  // Pull tokens that follow @, allow letters/numbers/_ — typical handle chars.
  const tokens = Array.from(text.matchAll(/@([A-Za-z][A-Za-z0-9_-]{1,32})/g))
    .map((m) => (m[1] ?? "").toLowerCase()).filter(Boolean);
  if (tokens.length === 0) return;
  const unique = Array.from(new Set(tokens));

  const db = getDb();
  const candidates = await db
    .select({ id: users.id, name: users.name, isActive: users.isActive })
    .from(users);

  const toNotify = new Set<string>();
  for (const u of candidates) {
    if (!u.isActive) continue;
    const first = u.name.split(/\s+/)[0]?.toLowerCase() ?? "";
    if (!first) continue;
    if (unique.includes(first)) toNotify.add(u.id);
  }
  toNotify.delete(opts.actorId);

  if (toNotify.size === 0) return;

  // Insert all in one batch.
  const rows = Array.from(toNotify).map((userId) => ({
    userId,
    kind: "mention" as const,
    taskId: opts.taskId,
    actorId: opts.actorId,
    body: `mentioned you on "${opts.taskTitle}"`,
  }));
  await db.insert(notifications).values(rows);
}

/**
 * Notify all admin/manager users when a task is moved to "review" status.
 * Skips the actor who moved it.
 */
export async function notifyReviewRequested(opts: {
  actorId: string;
  taskId: string;
  taskTitle: string;
}) {
  const db = getDb();
  const managers = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        sql`${users.role} in ('admin', 'manager')`,
        eq(users.isActive, true),
      ),
    );

  for (const m of managers) {
    await insertWithDedupe({
      userId: m.id,
      actorId: opts.actorId,
      kind: "review_requested",
      taskId: opts.taskId,
      body: `requested review on "${opts.taskTitle}"`,
    });
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getUnreadCount(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), sql`${notifications.readAt} is null`),
    );
  return row?.n ?? 0;
}
