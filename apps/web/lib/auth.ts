// apps/web/lib/auth.ts
//
// Two-mode auth:
//   • When AUTH_SECRET is set: read the NextAuth session, look up the user
//     by session.user.id (set in our jwt callback). No session → throws,
//     which surfaces a 500 on protected pages (middleware should have
//     redirected first).
//   • When AUTH_SECRET is NOT set (dev / pre-OAuth): legacy stub returns
//     the seeded admin so we don't break the existing surface.

import { getDb, users, eq } from "@tu/db";
import type { User } from "@tu/db";

const STUB_EMAIL = "aks@truestock.in";

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
  if (process.env.AUTH_SECRET) {
    // Real auth path.
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

  // Stub path — preserve current behaviour.
  const u = await lookup(STUB_EMAIL);
  if (!u) {
    throw new Error(
      `Stub auth: user with email ${STUB_EMAIL} not found. Seed the users table first.`,
    );
  }
  return u;
}

export async function getCurrentUserId(): Promise<string> {
  return (await getCurrentUser()).id;
}
