// apps/web/lib/cached-queries.ts
//
// Request-scoped cached queries using React cache().
// These are deduplicated within a single server render — if a page and its
// nested server components both call getActiveUsers(), only one query runs.

import { cache } from "react";
import { getDb, users, eq } from "@tu/db";

/** All active users (id + name). Cached per-request. */
export const getActiveUsers = cache(async () => {
  const db = getDb();
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.isActive, true));
});
