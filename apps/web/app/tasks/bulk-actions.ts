// apps/web/app/tasks/bulk-actions.ts
//
// Act on many tasks at once — the thing you reach for when a backlog needs
// clearing and the alternative is forty individual clicks.
//
// TWO DESIGN POINTS WORTH KEEPING
//
// 1. Authorisation is done in ONE pass, not per task. requireTaskAccess()
//    issues a query per task and, for a manager, a department scan each time —
//    100 tasks would be 200 round-trips. assertBulkAccess() fetches the rows
//    once and resolves the department once, applying exactly the same rules.
//
// 2. Every operation returns the PREVIOUS values so the caller can offer a
//    real Undo. A bulk edit that can't be reversed is a bulk mistake waiting
//    to happen — and "I meant to select four, not forty" is the normal way
//    this goes wrong.

"use server";

import { revalidatePath } from "next/cache";
import { getDb, tasks, users, eq, inArray } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isPrivileged, getDepartmentScope } from "@/lib/access";
import { log } from "@/lib/log";

/** Enough to clear a real backlog; small enough that one statement stays sane. */
const MAX_BULK = 100;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["backlog", "todo", "in_progress", "review", "done", "cancelled"] as const;
const PRIORITIES = ["low", "med", "high", "urgent"] as const;

export type TaskSnapshot = {
  id: string;
  status: string;
  priority: string;
  dueDate: string | null;
  assigneeId: string | null;
};

function readIds(formData: FormData): string[] {
  const ids = formData
    .getAll("taskIds")
    .flatMap((v) => String(v).split(","))
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s));
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) throw new Error("Nothing selected.");
  if (unique.length > MAX_BULK) throw new Error(`Select at most ${MAX_BULK} tasks at a time.`);
  return unique;
}

/**
 * Same visibility rules as /tasks, resolved in one pass. Throws if ANY id is
 * out of scope rather than quietly applying to the subset — a partial bulk
 * edit that reports success is worse than a refusal.
 */
async function assertBulkAccess(ids: string[], me: Awaited<ReturnType<typeof getCurrentUser>>): Promise<TaskSnapshot[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: tasks.id,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      assigneeId: tasks.assigneeId,
      createdById: tasks.createdById,
    })
    .from(tasks)
    .where(inArray(tasks.id, ids));

  if (rows.length !== ids.length) throw new Error("Some of those tasks no longer exist.");

  if (!isAdmin(me)) {
    const dept = getDepartmentScope(me);
    let deptIds = new Set<string>();
    if (dept) {
      // ONE department lookup for the whole batch.
      const members = await db.select({ id: users.id }).from(users).where(eq(users.departmentId, dept));
      deptIds = new Set(members.map((m) => m.id));
    }
    for (const r of rows) {
      const mine = r.assigneeId === me.id || r.createdById === me.id;
      const inDept =
        deptIds.size > 0 &&
        ((r.assigneeId && deptIds.has(r.assigneeId)) || (r.createdById && deptIds.has(r.createdById)));
      if (!mine && !inDept) throw new Error("Some of those tasks aren't yours to change.");
    }
  }

  return rows.map((r) => ({
    id: r.id,
    status: r.status as string,
    priority: r.priority as string,
    dueDate: r.dueDate ?? null,
    assigneeId: r.assigneeId ?? null,
  }));
}

export type BulkResult = { updated: number; prev: TaskSnapshot[] };

/**
 * Apply one field change across the selection.
 *
 * `op` is validated against a fixed list — never used to build a column name.
 */
export async function bulkUpdateTasks(formData: FormData): Promise<BulkResult> {
  const ids = readIds(formData);
  const op = ((formData.get("op") as string) ?? "").trim();
  const value = ((formData.get("value") as string) ?? "").trim();

  const me = await getCurrentUser();
  const prev = await assertBulkAccess(ids, me);

  const db = getDb();
  const now = new Date();
  let patch: Record<string, unknown>;

  switch (op) {
    case "status": {
      if (!(STATUSES as readonly string[]).includes(value)) throw new Error(`Unknown status: ${value}`);
      patch = {
        status: value,
        // Mirror updateTaskStatus's stamping so bulk and single-row edits can't
        // disagree about cycle time. Reopening clears the stale completion.
        ...(value === "in_progress" ? { startedAt: now } : {}),
        ...(value === "done" ? { completedAt: now } : {}),
        ...(value === "todo" || value === "backlog" || value === "in_progress" || value === "review"
          ? { completedAt: null }
          : {}),
      };
      break;
    }
    case "priority": {
      if (!(PRIORITIES as readonly string[]).includes(value)) throw new Error(`Unknown priority: ${value}`);
      patch = { priority: value };
      break;
    }
    case "dueDate": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Pick a real date.");
      patch = { dueDate: value };
      break;
    }
    case "assignee": {
      // Assigning other people is an admin/manager decision everywhere else in
      // the app; bulk is not a loophole.
      if (!isPrivileged(me)) throw new Error("Only admins and managers can reassign tasks.");
      if (value && !UUID_RE.test(value)) throw new Error("That assignee is not valid.");
      patch = { assigneeId: value || null };
      break;
    }
    default:
      throw new Error(`Unknown bulk operation: ${op}`);
  }

  await db
    .update(tasks)
    .set({ ...patch, updatedAt: now })
    .where(inArray(tasks.id, ids));

  log.info("tasks.bulk_update", { op, value, count: ids.length, actorId: me.id });

  revalidatePath("/tasks");
  revalidatePath("/");
  return { updated: ids.length, prev };
}

/**
 * Put a set of tasks back exactly as they were. Used by Undo, so it restores
 * all four mutable fields rather than guessing which one changed.
 */
export async function bulkRestoreTasks(snapshots: TaskSnapshot[]): Promise<{ restored: number }> {
  if (!Array.isArray(snapshots) || snapshots.length === 0) return { restored: 0 };
  if (snapshots.length > MAX_BULK) throw new Error("Too many tasks to restore at once.");

  const ids = snapshots.map((s) => s.id).filter((s) => UUID_RE.test(s));
  if (ids.length !== snapshots.length) throw new Error("Bad restore payload.");

  const me = await getCurrentUser();
  await assertBulkAccess(ids, me);

  const db = getDb();
  const now = new Date();

  // One statement per distinct prior state would be ideal; in practice a bulk
  // edit is a handful of distinct states at most, and correctness matters more
  // than shaving queries on an undo path.
  for (const s of snapshots) {
    // This payload comes from the client, so every field is re-validated —
    // a server action is a public endpoint, not a trusted callback.
    if (!(STATUSES as readonly string[]).includes(s.status)) continue;
    if (!(PRIORITIES as readonly string[]).includes(s.priority)) continue;
    if (s.dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(s.dueDate)) continue;
    if (s.assigneeId !== null && !UUID_RE.test(s.assigneeId)) continue;
    await db
      .update(tasks)
      .set({
        status: s.status as (typeof STATUSES)[number],
        priority: s.priority as (typeof PRIORITIES)[number],
        dueDate: s.dueDate,
        assigneeId: s.assigneeId,
        // A restored non-done task must not keep a completion stamp.
        ...(s.status === "done" ? {} : { completedAt: null }),
        updatedAt: now,
      })
      .where(eq(tasks.id, s.id));
  }

  log.info("tasks.bulk_restore", { count: snapshots.length, actorId: me.id });
  revalidatePath("/tasks");
  revalidatePath("/");
  return { restored: snapshots.length };
}
