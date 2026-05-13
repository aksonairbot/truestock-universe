// apps/web/lib/auth.ts
//
// Auth helper. Always uses real NextAuth sessions.
// No more stub fallback — every page requires a valid Google session.

import { getDb, users, eq } from "@tu/db";
import type { User } from "@tu/db";

async function lookup(email: string): Promise<User | null> {
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return u ?? null;
}

async function lookupById(id: string): Promise<User | null> {
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return u ?? null;
}

export async function getCurrentUser(): Promise<User> {
  const { auth } = await import("@/auth");
  const session = await auth();
  const uid = (session?.user as any)?.id as string | undefined;
  const email = session?.user?.email;
  let u: User | null = null;
  if (uid) u = await lookupById(uid);
  if (!u && email) u = await lookup(email);
  if (!u) {
    throw new Error("Not signed in.");
  }
  return u;
}

/** Same as getCurrentUser but returns null instead of throwing. */
export async function tryGetCurrentUser(): Promise<User | null> {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}

export async function getCurrentUserId(): Promise<string> {
  return (await getCurrentUser()).id;
}
