// apps/web/app/notifications/page.tsx
//
// Inbox — all notifications for the current user. Filter chips, mark-all-read,
// per-row deep-link to the originating task (clicking marks that row read).

import Link from "next/link";
import {
  getDb,
  notifications,
  tasks,
  users,
  eq,
  and,
  desc,
  sql,
} from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { markAllRead } from "./actions";
import { NotifRow } from "./row";

export const dynamic = "force-dynamic";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "mentions", label: "Mentions" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

interface PageProps {
  searchParams: Promise<{ filter?: string }>;
}

export default async function NotificationsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filter: Filter = (FILTERS.find((f) => f.value === sp.filter)?.value ?? "all") as Filter;

  const me = await getCurrentUser();
  const db = getDb();

  const baseWhere = [eq(notifications.userId, me.id)];
  if (filter === "unread") baseWhere.push(sql`${notifications.readAt} is null`);
  if (filter === "mentions") baseWhere.push(eq(notifications.kind, "mention"));

  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      taskId: notifications.taskId,
      body: notifications.body,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      actor: { id: users.id, name: users.name },
      task: { id: tasks.id, title: tasks.title },
    })
    .from(notifications)
    .leftJoin(users, eq(notifications.actorId, users.id))
    .leftJoin(tasks, eq(notifications.taskId, tasks.id))
    .where(and(...baseWhere))
    .orderBy(desc(notifications.createdAt))
    .limit(200);

  const counts = await db
    .select({
      unread: sql<number>`count(*) filter (where read_at is null)::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(notifications)
    .where(eq(notifications.userId, me.id));
  const unread = counts[0]?.unread ?? 0;
  const total = counts[0]?.total ?? 0;

  return (
    <div className="page-content max-w-[820px]">
      <div className="page-head">
        <div>
          <div className="page-title">Inbox</div>
          <div className="page-sub">
            {total} total · {unread > 0 ? <span style={{ color: "var(--accent-2)" }}>{unread} unread</span> : "all caught up"}
          </div>
        </div>
        {unread > 0 ? (
          <form action={markAllRead}>
            <button type="submit" className="btn btn-ghost btn-sm">Mark all read</button>
          </form>
        ) : null}
      </div>

      <div className="filter-chips">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === "all" ? "/notifications" : `/notifications?filter=${f.value}`}
            className={`filter-chip ${filter === f.value ? "is-active" : ""}`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-text-2 mb-2">
            {filter === "unread"
              ? "Nothing unread."
              : filter === "mentions"
                ? "No one has @-mentioned you yet."
                : "No notifications yet."}
          </div>
          <div className="text-text-3 text-[12px]">
            Mentions, assignments, completions, and comments on your tasks will appear here.
          </div>
        </div>
      ) : (
        <ul className="notif-list">
          {rows.map((r) => (
            <NotifRow key={r.id} row={r} />
          ))}
        </ul>
      )}
    </div>
  );
}
