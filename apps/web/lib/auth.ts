/**
 * Stub auth — returns the seeded admin user (Amit) for every request.
 *
 * This exists so we can ship Tasks UI before wiring full Google SSO. Once
 * Auth.js (next-auth v5) is in place, getCurrentUser() will read the session
 * cookie and look up the matching users row by google_subject.
 *
 * Hard-codes aks@truestock.in by email so the seeded user is the only path
 * to render — if the seed is missing, this throws, which is the right
 * failure mode (forces us to seed before booting).
 */
import { getDb, users, eq } from "@tu/db";
import type { User } from "@tu/db";

const STUB_EMAIL = "aks@truestock.in";

let _cached: User | null = null;

export async function getCurrentUser(): Promise<User> {
  if (_cached) return _cached;
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.email, STUB_EMAIL)).limit(1);
  if (!u) {
    throw new Error(
      `Stub auth: user with email ${STUB_EMAIL} not found. Seed the users table first.`,
    );
  }
  _cached = u;
  return u;
}

/** Convenience for server components / actions that just need the id. */
export async function getCurrentUserId(): Promise<string> {
  return (await getCurrentUser()).id;
}
