"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarProps {
  user: { name: string; email: string; avatarUrl: string | null } | null;
  orgName?: string;
  orgMembersLine?: string;
}

export default function Sidebar({
  user,
  orgName = "Truestock",
  orgMembersLine = "internal · MIS + agents + tasks",
}: SidebarProps) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <aside
      className="hidden lg:flex flex-col w-[236px] shrink-0 h-screen sticky top-0 overflow-y-auto px-3 py-4 gap-1 border-r border-border"
      style={{
        background: "linear-gradient(180deg, #0B0D12, #0A0B10)",
      }}
    >
      {/* brand */}
      <div className="flex items-center gap-2.5 px-2.5 pb-4 pt-1">
        <div className="brand-mark" />
        <div className="flex flex-col leading-tight">
          <span className="text-[13px] font-semibold tracking-[0.02em] text-text">
            {orgName}
          </span>
          <span className="text-[10px] text-text-3 uppercase tracking-[0.18em] font-medium">
            Universe
          </span>
        </div>
      </div>

      {/* nav */}
      <nav className="flex flex-col gap-0.5">
        <div className="nav-section">Workspace</div>
        <NavLink href="/pulse" active={isActive("/pulse")} icon={<IcPulse />} disabled>
          Pulse <Kbd>G P</Kbd>
        </NavLink>
        <NavLink href="/chat" active={isActive("/chat")} icon={<IcChat />} disabled>
          Chat <Kbd>G C</Kbd>
        </NavLink>
        <NavLink href="/marketing" active={isActive("/marketing")} icon={<IcMarketing />} disabled>
          Marketing <Kbd>G M</Kbd>
        </NavLink>
        <NavLink href="/tasks" active={isActive("/tasks")} icon={<IcTasks />}>
          Tasks <Kbd>G T</Kbd>
        </NavLink>
        <NavLink href="/projects" active={isActive("/projects")} icon={<IcProjects />}>
          Projects
        </NavLink>
        <NavLink href="/mis/revenue" active={isActive("/mis")} icon={<IcMIS />}>
          MIS <Kbd>G I</Kbd>
        </NavLink>
        <NavLink href="/products" active={isActive("/products")} icon={<IcProducts />} disabled>
          Products <Kbd>G R</Kbd>
        </NavLink>

        <div className="nav-section">Intelligence</div>
        <NavLink href="/vault" active={isActive("/vault")} icon={<IcVault />} disabled>
          Memory Vault
        </NavLink>
        <NavLink href="/agents" active={isActive("/agents")} icon={<IcAgents />} disabled>
          Agents
        </NavLink>

        <div className="nav-section">Admin</div>
        <NavLink href="/team" active={isActive("/team")} icon={<IcTeam />} disabled>
          Team <Kbd>G E</Kbd>
        </NavLink>
        <NavLink href="/members" active={isActive("/members")} icon={<IcMembers />} disabled>
          Members <Kbd>G U</Kbd>
        </NavLink>
        <NavLink href="/mobile" active={isActive("/mobile")} icon={<IcMobile />} disabled>
          Mobile companion
        </NavLink>
        <NavLink href="/settings" active={isActive("/settings")} icon={<IcSettings />} disabled>
          Workspace settings
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
      {user ? (
        <div className="mt-2 px-2.5 flex items-center gap-2 text-[11px] text-text-3">
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center font-semibold text-[10px] shrink-0"
            style={{
              background: "linear-gradient(135deg,#7B5CFF,#F472B6)",
              color: "#fff",
            }}
            title={user.email}
          >
            {user.name
              .split(/\s+/)
              .map((p) => p[0])
              .filter(Boolean)
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
          <span className="truncate">{user.email}</span>
        </div>
      ) : null}
    </aside>
  );
}

function NavLink({
  href,
  active,
  icon,
  children,
  disabled = false,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const className = `nav-link ${active ? "active" : ""} ${disabled ? "opacity-40 pointer-events-none" : ""}`;
  if (disabled) {
    return (
      <span className={className} title="Coming soon">
        {icon}
        <span className="flex-1 flex items-center gap-2">{children}</span>
      </span>
    );
  }
  return (
    <Link href={href} className={className}>
      {icon}
      <span className="flex-1 flex items-center gap-2">{children}</span>
    </Link>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="kbd ml-auto">{children}</span>;
}

/* ---------- icons (match prototype paths) ---------- */
function IcPulse() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 12h4l2-6 4 12 2-6h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IcChat() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 15a2 2 0 01-2 2H8l-5 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}
function IcMarketing() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 11l18-8-8 18-2-8-8-2z" strokeLinejoin="round" />
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
function IcMIS() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}
function IcProducts() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 16V8a2 2 0 00-1-1.7l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.7l7 4a2 2 0 002 0l7-4a2 2 0 001-1.7z" />
      <path d="M3.3 7L12 12l8.7-5M12 22V12" />
    </svg>
  );
}
function IcVault() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 4h16v16H4z" />
      <path d="M8 4v16M4 8h4M4 12h4M4 16h4" />
    </svg>
  );
}
function IcAgents() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}
function IcTeam() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
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
function IcMobile() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="6" y="2" width="12" height="20" rx="3" />
      <path d="M11 18h2" />
    </svg>
  );
}
function IcSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}
