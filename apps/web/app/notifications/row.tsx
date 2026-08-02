// apps/web/app/notifications/row.tsx — client row that marks itself read on click.

"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { markRead } from "./actions";
import { BADGE_REFRESH_EVENT } from "@/lib/badge-events";

type Row = {
  id: string;
  kind: "mention" | "assigned" | "task_completed" | "comment_on_assigned" | string;
  taskId: string | null;
  body: string;
  readAt: Date | null;
  createdAt: Date;
  actor: { id: string | null; name: string | null } | null;
  task: { id: string | null; title: string | null } | null;
};

const KIND_VERB: Record<string, string> = {
  mention: "mentioned",
  assigned: "assigned",
  task_completed: "completed",
  comment_on_assigned: "commented",
  // Without an entry here the row falls back to printing the raw enum name,
  // so the live watchdog has been rendering "Someone content_at_risk Publish
  // failed: ..." since it shipped.
  content_at_risk: "flagged",
  standing_updated: "updated",
};
const KIND_COLOR: Record<string, string> = {
  mention: "var(--accent-2)",
  assigned: "var(--info)",
  task_completed: "var(--success)",
  comment_on_assigned: "var(--warning)",
  content_at_risk: "var(--warning)",
  standing_updated: "var(--accent-2)",
};

/**
 * Where this notification goes when there's no task behind it. A standing
 * change has no task and is not viewable by anyone but the person, so it
 * points at their own settings page rather than nowhere.
 */
const KIND_HREF: Record<string, string> = {
  standing_updated: "/settings",
};

function avaClass(name?: string | null): string {
  if (!name) return "h1";
  const sum = [...name].reduce((s, c) => s + c.charCodeAt(0), 0);
  return ["h1", "h2", "h3", "h4"][sum % 4]!;
}
function avaInitial(name?: string | null): string {
  if (!name) return "?";
  return name.trim()[0]?.toUpperCase() ?? "?";
}
function relTime(d: Date): string {
  const diff = Math.max(0, Date.now() - d.getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });
}

export function NotifRow({ row }: { row: Row }) {
  const [unread, setUnread] = useState(row.readAt === null);
  const [, start] = useTransition();

  // Re-sync when the server sends fresh data (e.g. after "Mark all read"
  // revalidates the page). useState only honours its initial value on first
  // mount, so without this the rows stayed visually unread forever and the
  // button looked broken even though the write had succeeded.
  useEffect(() => { setUnread(row.readAt === null); }, [row.readAt]);

  function onClick() {
    if (!unread) return;
    setUnread(false);
    const fd = new FormData();
    fd.set("ids", row.id);
    if (row.taskId) fd.set("taskId", row.taskId);
    start(async () => {
      try {
        await markRead(fd);
        window.dispatchEvent(new Event(BADGE_REFRESH_EVENT));
      } catch { setUnread(true); }
    });
  }

  const fallbackHref = KIND_HREF[row.kind];
  const href = row.taskId ? `/tasks?task=${row.taskId}` : fallbackHref;
  const Wrapper: React.ElementType = href ? Link : "div";
  const wrapperProps = href ? { href, scroll: !row.taskId } : {};

  return (
    <li className={`notif-row ${unread ? "is-unread" : ""}`}>
      <Wrapper {...wrapperProps as any} className="notif-link" onClick={onClick}>
        <span className={`tava ${avaClass(row.actor?.name)}`}>{avaInitial(row.actor?.name)}</span>
        <div className="notif-body">
          <div className="notif-line">
            {/* Machine-raised notifications (the content watchdog) carry no
                actor. "Someone flagged..." implies a colleague did it. */}
            <span className="notif-actor">{row.actor?.name ?? "SeekPeak"}</span>{" "}
            <span className="notif-kind" style={{ color: KIND_COLOR[row.kind] ?? "var(--text-3)" }}>
              {KIND_VERB[row.kind] ?? row.kind}
            </span>{" "}
            <span className="notif-text">{row.body.replace(new RegExp(`^${KIND_VERB[row.kind] ?? ""}\\s*`), "").trim()}</span>
          </div>
          <div className="notif-time">{relTime(row.createdAt)}</div>
        </div>
        {unread ? <span className="notif-dot" aria-label="unread" /> : null}
      </Wrapper>
    </li>
  );
}
