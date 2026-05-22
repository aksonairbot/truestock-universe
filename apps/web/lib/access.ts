// apps/web/lib/access.ts
//
// Centralised role-based access helpers.
//   Admin   → sees everything across the org
//   Manager → sees only their own department's members/tasks
//   Member  → sees only their own tasks/activity

import { getDb, tasks, users, eq } from "@tu/db";
import type { User } from "@tu/db";

/** Admin or manager — allowed into management pages. */
export function isPrivileged(user: User): boolean {
  return user.role === "admin" || user.role === "manager";
}

export function isAdmin(user: User): boolean {
  return user.role === "admin";
}

/** Admin sees all; manager is department-scoped. */
export function canSeeAllMembers(user: User): boolean {
  return user.role === "admin";
}

/** Returns the department scope for a manager, or null for admin/member. */
export function getDepartmentScope(user: User): string | null {
  if (user.role === "manager" && user.departmentId) return user.departmentId;
  return null;
}

/**
 * Authorise a task mutation. Loads the task, then enforces:
 *   - Admins can touch any task.
 *   - Managers can only touch tasks whose creator or assignee is in their
 *     own department. (Cross-department managers were silently allowed
 *     until 2026-05-22; the dept scope is now applied to mutations too,
 *     matching what page-level reads already do.)
 *   - Members can only touch tasks where they are the creator or
 *     currently the assignee.
 *
 * Throws "Task not found" or "Not authorised" — caller catches and the
 * server action surface returns these via Next's error boundary. Returns
 * the loaded task row so callers don't re-query.
 *
 * Use this at the top of every mutating server action that takes a
 * caller-supplied taskId. The auth memory note (feedback) records the
 * underlying IDOR pattern this guards.
 */
export async function requireTaskAccess(
  taskId: string,
  user: User,
): Promise<typeof tasks.$inferSelect> {
  const db = getDb();
  const [t] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!t) throw new Error("Task not found");
  if (isAdmin(user)) return t;

  if (user.role === "manager") {
    // Allow if assignee/creator is in the manager's department.
    const dept = getDepartmentScope(user);
    if (!dept) throw new Error("Not authorised");
    const peers = [t.assigneeId, t.createdById].filter(Boolean) as string[];
    if (peers.length === 0) throw new Error("Not authorised");
    const matches = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.departmentId, dept));
    const deptIds = new Set(matches.map((m) => m.id));
    if (peers.some((id) => deptIds.has(id))) return t;
    throw new Error("Not authorised");
  }

  // Members: creator or current assignee only.
  if (t.createdById === user.id || t.assigneeId === user.id) return t;
  throw new Error("Not authorised");
}
