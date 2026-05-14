"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";

interface SidebarProps {
  user: { name: string; email: string; avatarUrl: string | null } | null;
  unreadCount?: number;
  chatUnreadCount?: number;
  orgName?: string;
  orgMembersLine?: string;
  isPrivileged?: boolean;
}

export default function Sidebar({
  user,
  unreadCount = 0,
  chatUnreadCount = 0,
  orgName = "SeekPeek",
  orgMembersLine = "Truestock · daily work tracker",
  isPrivileged = false,
}: SidebarProps) {
  const rawPath = usePathname() ?? "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  // Welcome page is a full-bleed landing for unauthenticated visitors — no app shell.
  if (rawPath === "/welcome" || rawPath.startsWith("/welcome/")) return null;
  // Normalize: strip trailing slash (except root), drop any query/hash
  const pathname = rawPath !== "/" && rawPath.endsWith("/") ? rawPath.slice(0, -1) : rawPath;
  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href + "/")) || pathname === href;

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <>
      {/* mobile top bar */}
      <div className="mobile-topbar lg:hidden">
        <button
          type="button"
          className="mobile-hamburger"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link href="/" className="mobile-topbar-brand">
          <div className="brand-mark" style={{ width: 20, height: 20 }} />
          <span>{orgName}</span>
        </Link>
        <div style={{ width: 36 }} /> {/* spacer for centering */}
      </div>

      {/* mobile backdrop */}
      {mobileOpen && (
        <div
          className="mobile-backdrop lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`sidebar-aside ${mobileOpen ? "is-open" : ""}`}
        style={{
          background: "linear-gradient(180deg, #0B0D12, #0A0B10)",
        }}
      >
      {/* brand — clicks to home (today summary) */}
      <Link href="/" className="flex items-center gap-2.5 px-2.5 pb-4 pt-1 group">
        <div className="brand-mark" />
        <div className="flex flex-col leading-tight">
          <span className="text-[13px] font-semibold tracking-[0.02em] text-text group-hover:text-accent-2 transition">
            {orgName}
          </span>
          <span className="text-[10px] text-text-3 uppercase tracking-[0.18em] font-medium">
            Truestock
          </span>
        </div>
      </Link>

      {/* nav — task management focus only */}
      <nav className="flex flex-col gap-0.5">
        <NavLink href="/" active={pathname === "/" || pathname === ""} icon={<IcToday />}>
          Today
        </NavLink>
        <NavLink href="/me/week" active={isActive("/me")} icon={<IcSpark />}>
          My week
        </NavLink>
        <NavLink href="/me/month" active={isActive("/me/month")} icon={<IcCalendar />}>
          Month
        </NavLink>
        <NavLink href="/tasks" active={isActive("/tasks")} icon={<IcTasks />}>
          Tasks <Kbd>G T</Kbd>
        </NavLink>
        <NavLink href="/projects" active={isActive("/projects")} icon={<IcProjects />}>
          Projects
        </NavLink>
        {isPrivileged && (
          <NavLink href="/members" active={isActive("/members")} icon={<IcMembers />}>
            Members <Kbd>G U</Kbd>
          </NavLink>
        )}
        <NavLink href="/chat" active={isActive("/chat")} icon={<IcChat />}>
          <span className="flex-1">Chat</span>
          {chatUnreadCount > 0 ? (
            <span className="inbox-badge" title={`${chatUnreadCount} unread`}>
              {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
            </span>
          ) : null}
        </NavLink>
        <NavLink href="/notifications" active={isActive("/notifications")} icon={<IcBell />}>
          <span className="flex-1">Inbox</span>
          {unreadCount > 0 ? (
            <span className="inbox-badge" title={`${unreadCount} unread`}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </NavLink>
      </nav>

      <div className="flex-1" />

      {/* org card */}
      <div className="mt-2.5 p-2.5 border border-border rounded-[10px] bg-panel flex items-center gap-2.5">
        <div
          className="w-7 h-7 rounded-[7px] flex items-center justify-center font-semibold text-[12px] shrink-0"
          style={{
            background: "linear-gradient(135deg,#7B5CFF,#22D3EE)",
            color: "#0B0D12",
          }}
        >
          {orgName.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex flex-col leading-[1.25] min-w-0">
          <span className="text-[12px] font-semibold truncate text-text">{orgName}</span>
          <span className="text-[11px] text-text-3 truncate">{orgMembersLine}</span>
        </div>
      </div>

      {/* logged-in user (smaller, right at the bottom under org-card) */}
      {user ? <UserMenu user={user} /> : (
        <div className="mt-2 px-2.5">
          <form action="/api/auth/signin/google" method="POST">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 text-[11px] text-text-2 hover:text-text bg-panel-2 hover:bg-bg-2 border border-border rounded-md p-2 transition-colors cursor-pointer"
            >
              Sign in with Google
            </button>
          </form>
        </div>
      )}
    </aside>
    </>
  );
}

function NavLink({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`nav-link ${active ? "active" : ""}`}>
      {icon}
      <span className="flex-1 flex items-center gap-2">{children}</span>
    </Link>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="kbd ml-auto">{children}</span>;
}

function UserMenu({ user }: { user: { name: string; email: string; avatarUrl: string | null } }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div ref={ref} className="mt-2 px-2.5 relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 text-[11px] text-text-3 hover:text-text transition-colors rounded-md p-1.5"
      >
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center font-semibold text-[10px] shrink-0"
          style={{
            background: "linear-gradient(135deg,#7B5CFF,#F472B6)",
            color: "#fff",
          }}
          title={user.email}
        >
          {initials}
        </div>
        <span className="truncate flex-1 text-left">{user.email}</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-2.5 right-2.5 mb-1 bg-panel border border-border rounded-[8px] shadow-lg overflow-hidden">
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="block w-full px-3 py-2 text-[11px] text-text-2 hover:bg-bg-2 hover:text-text transition-colors"
          >
            Settings
          </Link>
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="block w-full px-3 py-2 text-[11px] text-text-2 hover:bg-bg-2 hover:text-red-400 transition-colors border-t border-border text-left cursor-pointer"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ---------- icons ---------- */
function IcToday() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <circle cx="12" cy="15" r="1.4" fill="currentColor" />
    </svg>
  );
}
function IcTasks() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9h10M7 13h6" />
    </svg>
  );
}
function IcProjects() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  );
}
function IcCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18M8 15h.01M13 15h.01M18 15h.01M8 19h.01M13 19h.01M18 19h.01" />
    </svg>
  );
}
function IcMembers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 21c1-3 3.5-5 6-5s5 2 6 5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M22 19c-.4-2-1.7-3.5-3.7-4" />
    </svg>
  );
}

function IcChat() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
    </svg>
  );
}

function IcBell() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  );
}

function IcSpark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
      <path d="M5 3v4M3 5h4M12 4v6M9 7h6M19 14v6M16 17h6M14 11l-5 8" />
    </svg>
  );
}
