// apps/web/lib/access.ts
//
// Centralised role-based access helpers.
//   Admin   → sees everything across the org
//   Manager → sees only their own department's members/tasks
//   Member  → sees only their own tasks/activity

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
