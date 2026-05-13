// apps/web/app/members/[id]/page.tsx
//
// Per-person profile — manager drill-down.
// Layout:
//   header: avatar / name / email / role
//   stats:  Open · Overdue · Done 7d/30d · Comments 7d/30d · Busy
//   two columns:
//     left  — Open queue (this person's open tasks, grouped by due bucket)
//     right — Recent activity timeline (last 14 days, newest first)

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getDb,
  users,
  tasks,
  taskComments,
  projects,
  eq,
  and,
  desc,
  sql,
} from "@tu/db";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isPrivileged } from "@/lib/access";
import { toggleMemberActive } from "../actions";
import { RoleSelect } from "../role-select";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin", manager: "Manager", member: "Member", viewer: "Viewer", agent: "Agent",
};
const ROLE_TONE: Record<string, string> = {
  admin: "var(--danger)", manager: "var(--warning)", member: "var(--accent-2)", viewer: "var(--text-3)", agent: "var(--info)",
};

const PRIORITY_WEIGHT: Record<string, number> = { urgent: 4, high: 3, med: 2, low: 1 };

function avaClass(name?: string | null): string {
  if (!name) return "h1";
  const sum = [...name].reduce((s, c) => s + c.charCodeAt(0), 0);
  return ["h1", "h2", "h3", "h4"][sum % 4]!;
}
function avaInitials(name?: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}
function fmtDate(d: string | Date | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}
function fmtTime(d: Date): string {
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function istDayString(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
function startOfTodayIST(): Date {
  const day = istDayString(new Date());
  return new Date(`${day}T00:00:00+05:30`);
}
function shiftDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

const DUE_BUCKET_ORDER = ["overdue", "today", "this_week", "later", "no_due"] as const;
const DUE_BUCKET_LABEL: Record<string, string> = {
  overdue: "Overdue", today: "Today", this_week: "This week", later: "Later", no_due: "No due date",
};
const DUE_BUCKET_TONE: Record<string, string> = {
  overdue: "var(--danger)", today: "var(--accent-2)", this_week: "var(--info)", later: "var(--text-2)", no_due: "var(--text-3)",
};
function dueBucket(due: string | Date | null): string {
  if (!due) return "no_due";
  const today = startOfTodayIST();
  const weekEnd = shiftDays(today, 7);
  const dueDate = typeof due === "string" ? new Date(`${due}T12:00:00+05:30`) : due;
  if (dueDate < today) return "overdue";
  if (istDayString(dueDate) === istDayString(today)) return "today";
  if (dueDate <= weekEnd) return "this_week";
  return "later";
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ window?: string }>;
}

export default async function MemberProfilePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { window: windowRaw } = await searchParams;
  const win: 7 | 30 = windowRaw === "30" ? 30 : 7;

  const db = getDb();
  const me = await getCurrentUser();
  const isAdmin = me.role === "admin";

  // Data wall: members/viewers can only view their own profile.
  if (!isPrivileged(me) && me.id !== id) redirect("/");

  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) notFound();

  const today = startOfTodayIST();
  const startWindow = shiftDays(today, -(win - 1));
  const start14d = shiftDays(today, -13);

  // ------------- Open task queue (sectioned) ----------------
  const openTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      project: { slug: projects.slug, name: projects.name },
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(eq(tasks.assigneeId, id), sql`${tasks.status} not in ('done','cancelled')`))
    .orderBy(tasks.dueDate);

  // Group by due bucket
  const grouped: Record<string, typeof openTasks> = {};
  for (const k of DUE_BUCKET_ORDER) grouped[k] = [];
  for (const t of openTasks) (grouped[dueBucket(t.dueDate)] ?? grouped.no_due!).push(t);

  // Busy
  let busy = 0;
  for (const t of openTasks) {
    const w = PRIORITY_WEIGHT[t.priority] ?? 1;
    const overdue = dueBucket(t.dueDate) === "overdue";
    busy += w * (overdue ? 2 : 1);
  }

  // ------------- Stats (window-scoped) ----------------
  const [doneRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(
        eq(tasks.assigneeId, id),
        eq(tasks.status, "done"),
        sql`${tasks.completedAt} >= ${startWindow.toISOString()}`,
      ),
    );
  const doneCount = doneRow?.n ?? 0;

  const [commentRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(taskComments)
    .where(
      and(
        eq(taskComments.authorId, id),
        sql`${taskComments.createdAt} >= ${startWindow.toISOString()}`,
      ),
    );
  const commentCount = commentRow?.n ?? 0;

  const overdueCount = grouped.overdue!.length;

  // ------------- Recent activity timeline (14 days, capped) ----------------
  const recentCompleted = await db
    .select({
      kind: sql<string>`'completed'`.as("kind"),
      taskId: tasks.id,
      title: tasks.title,
      at: tasks.completedAt,
      project: { slug: projects.slug, name: projects.name },
      body: sql<string | null>`null`.as("body"),
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(
      and(
        eq(tasks.assigneeId, id),
        eq(tasks.status, "done"),
        sql`${tasks.completedAt} >= ${start14d.toISOString()}`,
      ),
    )
    .orderBy(desc(tasks.completedAt));

  const recentCreated = await db
    .select({
      kind: sql<string>`'created'`.as("kind"),
      taskId: tasks.id,
      title: tasks.title,
      at: tasks.createdAt,
      project: { slug: projects.slug, name: projects.name },
      body: sql<string | null>`null`.as("body"),
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(
      and(
        eq(tasks.createdById, id),
        sql`${tasks.createdAt} >= ${start14d.toISOString()}`,
      ),
    )
    .orderBy(desc(tasks.createdAt));

  const recentComments = await db
    .select({
      kind: sql<string>`'commented'`.as("kind"),
      taskId: taskComments.taskId,
      title: tasks.title,
      at: taskComments.createdAt,
      project: { slug: projects.slug, name: projects.name },
      body: taskComments.body,
    })
    .from(taskComments)
    .innerJoin(tasks, eq(taskComments.taskId, tasks.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(
      and(
        eq(taskComments.authorId, id),
        sql`${taskComments.createdAt} >= ${start14d.toISOString()}`,
      ),
    )
    .orderBy(desc(taskComments.createdAt));

  type Event = {
    kind: string;
    taskId: string;
    title: string;
    at: Date | null;
    project: { slug: string; name: string };
    body: string | null;
  };
  const events: Event[] = ([...recentCompleted, ...recentCreated, ...recentComments] as Event[])
    .filter((e) => e.at != null)
    .sort((a, b) => (b.at!.getTime() - a.at!.getTime()));

  // Group events by IST day
  const eventsByDay = new Map<string, Event[]>();
  for (const ev of events) {
    const day = istDayString(ev.at!);
    if (!eventsByDay.has(day)) eventsByDay.set(day, []);
    eventsByDay.get(day)!.push(ev);
  }
  const orderedDays = Array.from(eventsByDay.keys()); // already desc because events are desc

  const busyChip = (() => {
    if (busy <= 0) return { cls: "busy-idle", label: "idle" };
    if (busy <= 4) return { cls: "busy-calm", label: `${busy} · calm` };
    if (busy <= 9) return { cls: "busy-steady", label: `${busy} · steady` };
    if (busy <= 17) return { cls: "busy-busy", label: `${busy} · busy` };
    return { cls: "busy-swamped", label: `${busy} · swamped` };
  })();

  return (
    <div className="page-content">
      {/* breadcrumb */}
      <div className="text-text-3 text-xs mb-2 flex items-center gap-2">
        <Link href="/members" className="hover:text-text">← Members</Link>
      </div>

      {/* header */}
      <div className="profile-head">
        <span className={`profile-avatar tava ${avaClass(user.name)}`}>{avaInitials(user.name)}</span>
        <div className="flex-1 min-w-0">
          <div className="profile-name">{user.name}</div>
          <div className="profile-meta">
            <span className="mono">{user.email}</span>
            <span> · </span>
            {isAdmin ? (
              <RoleSelect memberId={user.id} currentRole={user.role} />
            ) : (
              <span style={{ color: ROLE_TONE[user.role] }}>{ROLE_LABEL[user.role] ?? user.role}</span>
            )}
            <span> · {user.timezone}</span>
            {!user.isActive && <span style={{ color: "var(--danger)" }}> · Deactivated</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isAdmin && me.id !== user.id && (
            <form action={toggleMemberActive}>
              <input type="hidden" name="memberId" value={user.id} />
              <button
                type="submit"
                className="btn btn-ghost btn-sm"
                style={{ color: user.isActive ? "var(--danger)" : "var(--success)" }}
              >
                {user.isActive ? "Deactivate" : "Reactivate"}
              </button>
            </form>
          )}
          <Link
            href={`/members/${id}?window=7`}
            className={`btn btn-ghost btn-sm ${win === 7 ? "is-active" : ""}`}
          >
            7d
          </Link>
          <Link
            href={`/members/${id}?window=30`}
            className={`btn btn-ghost btn-sm ${win === 30 ? "is-active" : ""}`}
          >
            30d
          </Link>
        </div>
      </div>

      {/* stats */}
      <div className="profile-stats">
        <div className="profile-stat">
          <div className="profile-stat-label">Open</div>
          <div className="profile-stat-val">{openTasks.length}</div>
        </div>
        <div className="profile-stat">
          <div className="profile-stat-label">Overdue</div>
          <div className="profile-stat-val" style={{ color: overdueCount > 0 ? "var(--danger)" : undefined }}>
            {overdueCount}
          </div>
        </div>
        <div className="profile-stat">
          <div className="profile-stat-label">Done · {win}d</div>
          <div className="profile-stat-val" style={{ color: doneCount > 0 ? "var(--success)" : undefined }}>
            {doneCount}
          </div>
        </div>
        <div className="profile-stat">
          <div className="profile-stat-label">Comments · {win}d</div>
          <div className="profile-stat-val">{commentCount}</div>
        </div>
        <div className="profile-stat">
          <div className="profile-stat-label">Busy</div>
          <div className="profile-stat-val">
            <span className={`busy-chip ${busyChip.cls}`} style={{ fontSize: 14 }}>
              {busyChip.label}
            </span>
          </div>
        </div>
      </div>

      <div className="profile-cols">
        {/* ------------- Open queue ------------- */}
        <div className="card" style={{ padding: 14 }}>
          <h3 className="profile-section-h">Open queue · {openTasks.length}</h3>
          {openTasks.length === 0 ? (
            <div className="text-text-3 italic text-sm">Nothing currently assigned — capacity to spare.</div>
          ) : (
            DUE_BUCKET_ORDER.map((bucket) => {
              const items = grouped[bucket]!;
              if (items.length === 0) return null;
              return (
                <div key={bucket} style={{ marginBottom: 14 }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: DUE_BUCKET_TONE[bucket] }} />
                    <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: DUE_BUCKET_TONE[bucket] }}>
                      {DUE_BUCKET_LABEL[bucket]}
                    </span>
                    <span className="text-[11px] text-text-3 mono">{items.length}</span>
                  </div>
                  {items.map((t) => (
                    <div key={t.id} className="profile-task-row">
                      <Link href={`/tasks?task=${t.id}`} className="ptitle" title={t.title} scroll={false}>
                        {t.title}
                      </Link>
                      <Link href={`/projects/${t.project.slug}`} className={`pchip ${t.project.slug}`}>
                        {t.project.name}
                      </Link>
                      <span className="text-[11px] mono" style={{ color: bucket === "overdue" ? "var(--danger)" : "var(--text-3)" }}>
                        {t.dueDate ? fmtDate(t.dueDate) : "—"}
                      </span>
                      <span className="text-[10.5px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                        {t.priority}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>

        {/* ------------- Activity timeline ------------- */}
        <div className="card" style={{ padding: 14 }}>
          <h3 className="profile-section-h">Recent activity · last 14 days</h3>
          {orderedDays.length === 0 ? (
            <div className="text-text-3 italic text-sm">Nothing logged in the last fortnight.</div>
          ) : (
            <div className="profile-timeline">
              {orderedDays.map((day) => {
                const evs = eventsByDay.get(day)!;
                const dayLabel = new Date(`${day}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
                return (
                  <div key={day} className="profile-tl-day">
                    <div className="profile-tl-date">{dayLabel} · {evs.length} event{evs.length === 1 ? "" : "s"}</div>
                    {evs.map((ev, idx) => (
                      <div key={`${ev.taskId}-${ev.kind}-${idx}`} className="profile-tl-event">
                        <span className={`profile-tl-kind ${ev.kind}`}>{ev.kind}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <Link
                            href={`/tasks?task=${ev.taskId}`}
                            className="text-text hover:text-accent-2"
                            style={{ textDecoration: "none" }}
                            scroll={false}
                          >
                            {ev.title}
                          </Link>
                          {ev.kind === "commented" && ev.body ? (
                            <div className="text-text-3 text-[12px] mt-0.5 line-clamp-2" style={{ maxWidth: 360 }}>
                              {ev.body.length > 140 ? `${ev.body.slice(0, 140).trim()}…` : ev.body}
                            </div>
                          ) : null}
                          <span className="text-text-4 text-[11px] mono ml-2">{ev.at ? fmtTime(ev.at) : ""}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
