// apps/web/lib/access.ts
//
// Centralised role-based access helpers.
// "privileged" = admin | manager → can see all team data.
// Everyone else sees only their own tasks/activity.

import type { User } from "@tu/db";

export function isPrivileged(user: User): boolean {
  return user.role === "admin" || user.role === "manager";
}

export function isAdmin(user: User): boolean {
  return user.role === "admin";
}
