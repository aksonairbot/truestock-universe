import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export * from "./schema.js";
export { sql, eq, and, or, gte, lte, lt, gt, desc, asc, isNull, inArray, ilike, like } from "drizzle-orm";

/**
 * Singleton Postgres client and Drizzle instance.
 *
 * Use `getDb()` from server components / route handlers / scripts.
 * Do NOT import `db` at module top-level in edge runtimes.
 */
let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill in the Postgres connection string.",
    );
  }

  // `prepare: false` for DO Managed Postgres (PgBouncer transaction mode compatibility)
  _client = postgres(url, {
    max: 10,
    idle_timeout: 20,
    prepare: false,
  });
  _db = drizzle(_client, { schema, logger: process.env.DB_LOG === "1" });
  return _db;
}

/** Close the pool — call from graceful shutdown hooks or test teardown. */
export async function closeDb() {
  if (_client) {
    await _client.end({ timeout: 5 });
    _client = null;
    _db = null;
  }
}

export type Database = ReturnType<typeof getDb>;
export { schema };
