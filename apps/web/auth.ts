// apps/web/auth.ts
//
// NextAuth v5 (Auth.js) setup. Google provider only — and we restrict the
// allowlist to emails that already exist in our users table. New people are
// pre-provisioned via /members (the existing add-member flow); they cannot
// self-register through Google. This matches "preconfigured accounts only".
//
// When AUTH_SECRET is unset (local dev / before OAuth setup) we ALSO keep
// the legacy stub working — see lib/auth.ts.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getDb, users, eq } from "@tu/db";

export const authEnabled = !!process.env.AUTH_SECRET;

const nextAuth = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? "dev-secret-do-not-use-in-prod",
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          prompt: "select_account",
          access_type: "offline",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      // Only allow Google sign-ins where the email is already in our users
      // table. No self-registration; admins pre-provision via /members.
      if (account?.provider !== "google") return false;
      const email = (profile?.email ?? "").toLowerCase();
      if (!email) return false;

      const db = getDb();
      const [existing] = await db
        .select({ id: users.id, isActive: users.isActive })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (!existing) return false;
      if (!existing.isActive) return false;

      // Touch last_login_at on success.
      try {
        await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, existing.id));
      } catch {
        // non-fatal
      }
      return true;
    },
    async jwt({ token, user }) {
      // On first sign-in, look up the user row and stash the id on the token.
      if (user?.email) {
        const db = getDb();
        const [row] = await db
          .select({ id: users.id, name: users.name, role: users.role })
          .from(users)
          .where(eq(users.email, user.email.toLowerCase()))
          .limit(1);
        if (row) {
          token.uid = row.id;
          token.name = row.name;
          token.role = row.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) (session.user as any).id = token.uid;
      if (token.role) (session.user as any).role = token.role;
      return session;
    },
  },
  pages: {
    signIn: "/welcome",
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _na = nextAuth as any;
export const handlers: any = _na.handlers;
export const auth: any = _na.auth;
export const signIn: any = _na.signIn;
export const signOut: any = _na.signOut;
