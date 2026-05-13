import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isPrivileged } from "@/lib/access";
import type { User } from "@tu/db";

/**
 * Top nav. Server component — looks up the current user once per request,
 * shows initials + email. Sticky to the top so it survives long page scrolls.
 *
 * Wraps getCurrentUser() in a try/catch because Next.js prerenders the
 * automatic /_not-found page at build time, when DATABASE_URL may not be
 * set. In that build-time path we render an anonymous nav, then live
 * requests get the real user.
 */
export default async function Nav() {
  let me: User | null = null;
  try {
    me = await getCurrentUser();
  } catch {
    // build-time prerender or DB unavailable — fall through to anon nav
  }

  const initials = me
    ? me.name
        .split(/\s+/)
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  return (
    <nav className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/60">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 h-12 flex items-center gap-1">
        <Link href="/" className="font-semibold tracking-tight mr-3 text-text hover:text-accent-2">
          Skynet
        </Link>
        <NavLink href="/">Today</NavLink>
        <NavLink href="/tasks">Tasks</NavLink>
        <NavLink href="/projects">Projects</NavLink>
        {me && isPrivileged(me) && <NavLink href="/members">Members</NavLink>}
        {me && isPrivileged(me) && <NavLink href="/month">Month</NavLink>}
        <div className="flex-1" />
        {me?.avatarUrl ? (
          <img src={me.avatarUrl} alt={me.name} className="w-7 h-7 rounded-full" />
        ) : (
          <div
            className="w-7 h-7 rounded-full bg-accent text-white text-xs font-semibold flex items-center justify-center"
            title={me?.email ?? "not signed in"}
          >
            {initials}
          </div>
        )}
      </div>
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 text-sm rounded-md text-text-2 hover:text-text hover:bg-panel-2 transition"
    >
      {children}
    </Link>
  );
}
