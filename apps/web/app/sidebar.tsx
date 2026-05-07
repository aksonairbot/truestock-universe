"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarProps {
  user: { name: string; email: string; avatarUrl: string | null } | null;
  projects: Array<{ slug: string; name: string; color: string | null }>;
}

export default function Sidebar({ user, projects }: SidebarProps) {
  const pathname = usePathname();
  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const initials = user
    ? user.name
        .split(/\s+/)
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  return (
    <aside className="hidden lg:flex flex-col w-[244px] shrink-0 h-screen sticky top-0 bg-panel-2 border-r border-border">
      {/* brand */}
      <div className="h-14 px-5 flex items-center border-b border-border">
        <Link href="/" className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-md bg-accent text-white text-sm font-semibold flex items-center justify-center">
            S
          </span>
          <span className="serif text-lg font-semibold text-text">Skynet</span>
        </Link>
      </div>

      {/* primary nav */}
      <nav className="px-3 py-4 flex flex-col gap-0.5">
        <NavItem href="/tasks" active={isActive("/tasks")} icon={<IconTask />}>
          Tasks
        </NavItem>
        <NavItem href="/tasks?view=board" active={pathname.startsWith("/tasks") && false} icon={<IconBoard />}>
          Board
        </NavItem>
        <NavItem href="/projects" active={isActive("/projects")} icon={<IconProject />}>
          Projects
        </NavItem>
        <NavItem href="/mis/revenue" active={isActive("/mis/revenue")} icon={<IconRevenue />}>
          Revenue
        </NavItem>
      </nav>

      {/* projects section */}
      <div className="px-3 mt-2">
        <div className="flex items-center justify-between px-2 mb-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-3">
            Projects
          </span>
          <Link
            href="/projects"
            className="text-text-3 hover:text-text text-base leading-none"
            aria-label="All projects"
            title="All projects"
          >
            +
          </Link>
        </div>
        <div className="flex flex-col gap-0.5">
          {projects.length === 0 ? (
            <div className="text-text-3 text-xs px-2 py-2 italic">No projects yet</div>
          ) : (
            projects.slice(0, 12).map((p) => {
              const href = `/projects/${p.slug}`;
              const active = pathname === href;
              return (
                <Link
                  key={p.slug}
                  href={href}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition ${
                    active
                      ? "bg-white text-text font-medium shadow-soft"
                      : "text-text-2 hover:bg-white/60 hover:text-text"
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: p.color ?? "#8E867A" }}
                  />
                  <span className="truncate">{p.name}</span>
                </Link>
              );
            })
          )}
        </div>
      </div>

      <div className="flex-1" />

      {/* user footer */}
      <div className="border-t border-border px-3 py-3">
        <div className="flex items-center gap-3">
          {user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt={user.name} className="w-8 h-8 rounded-full" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-accent text-white text-xs font-semibold flex items-center justify-center">
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-text truncate">{user?.name ?? "Guest"}</div>
            <div className="text-xs text-text-3 truncate">{user?.email ?? "not signed in"}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavItem({
  href,
  active,
  children,
  icon,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <Link href={href} className={`nav-pill ${active ? "active" : ""}`}>
      <span className="w-4 h-4 flex items-center justify-center text-current opacity-80">
        {icon}
      </span>
      {children}
    </Link>
  );
}

/* --- icons (inline svg, no dependency) --- */
function IconTask() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="3" width="11" height="3" rx="0.6" />
      <rect x="2.5" y="9" width="11" height="3" rx="0.6" />
    </svg>
  );
}
function IconBoard() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="4" height="12" rx="0.6" />
      <rect x="10" y="2" width="4" height="7" rx="0.6" />
    </svg>
  );
}
function IconProject() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4.5C2 3.6 2.7 3 3.5 3h3l1.4 1.7H12.5c0.8 0 1.5 0.6 1.5 1.5v6c0 0.8-0.7 1.5-1.5 1.5h-9c-0.8 0-1.5-0.7-1.5-1.5v-7.7Z" />
    </svg>
  );
}
function IconRevenue() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 13V8M8 13V4M13 13V10" />
    </svg>
  );
}
