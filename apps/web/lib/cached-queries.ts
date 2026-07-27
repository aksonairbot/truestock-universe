// apps/web/lib/cached-queries.ts
//
// Two layers of caching for slow-changing org-level reads:
//
//   1. React cache()      — dedupes within one server render (page + nested
//                           components share one query).
//   2. unstable_cache     — CROSS-REQUEST cache with tag invalidation. The
//                           user list and project list change a few times a
//                           week, yet every force-dynamic page re-queried
//                           them on every request. Mutating actions call
//                           revalidateOrgUsers()/revalidateOrgProjects().
//
// TTL is a backstop only — tag invalidation is the real freshness mechanism.

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { getDb, users, projects, eq } from "@tu/db";

export const ORG_USERS_TAG = "org-users";
export const ORG_PROJECTS_TAG = "org-projects";

const fetchActiveUsers = unstable_cache(
  async () => {
    const db = getDb();
    return db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.isActive, true));
  },
  ["active-users"],
  { tags: [ORG_USERS_TAG], revalidate: 300 },
);

const fetchProjectsList = unstable_cache(
  async () => {
    const db = getDb();
    return db
      .select({ slug: projects.slug, name: projects.name })
      .from(projects)
      .orderBy(projects.name);
  },
  ["projects-list"],
  { tags: [ORG_PROJECTS_TAG], revalidate: 300 },
);

/** All active users (id + name). Request-deduped AND cross-request cached. */
export const getActiveUsers = cache(async () => fetchActiveUsers());

/** All projects (slug + name), for pickers. Cached like getActiveUsers. */
export const getProjectsList = cache(async () => fetchProjectsList());

/** Call from any action that creates/updates/deactivates a user. */
export function revalidateOrgUsers(): void {
  revalidateTag(ORG_USERS_TAG);
}

/** Call from any action that creates/renames/archives a project. */
export function revalidateOrgProjects(): void {
  revalidateTag(ORG_PROJECTS_TAG);
}
