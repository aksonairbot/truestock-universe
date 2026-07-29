// apps/web/app/content/page.tsx
//
// The content calendar: what is going out, on which channel, and when.
// A month grid (the view every marketing team actually plans in) plus two
// working lists — items with no slot yet, and the pipeline by stage.
//
// Content items are ordinary tasks with content_channel set, so everything
// here inherits assignees, comments, links, attachments and approvals.

import Link from "next/link";
import { getDb, tasks, projects, users, eq, and, sql, asc } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, getDepartmentScope } from "@/lib/access";
import { CONTENT_STAGES, CHANNEL_COLOR, CHANNEL_LABEL, STAGE_COLOR, STAGE_LABEL } from "@/lib/content";
import { ContentBoard } from "./content-board";

export const dynamic = "force-dynamic";

const TZ = "Asia/Kolkata";

function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function istPartsOf(d: Date): { date: string; time: string } {
  return {
    date: new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d),
    time: new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d),
  };
}
/** Month key helpers on plain YYYY-MM strings — no Date math traps. */
function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y!, (m! - 1) + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString("en-IN", {
    month: "long", year: "numeric", timeZone: "UTC",
  });
}

interface PageProps {
  searchParams: Promise<{ month?: string; view?: string }>;
}

export default async function ContentPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const today = istToday();
  const thisMonth = today.slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : thisMonth;
  // The board is the pipeline view; the calendar is the schedule view.
  // Neither is a subset of the other, so they are peers, not a toggle on one.
  const isBoard = sp.view === "board";

  const me = await getCurrentUser();
  const deptScope = getDepartmentScope(me);
  const db = getDb();

  // Same data wall as /tasks: admin org-wide, manager department, member own.
  const scope = isAdmin(me)
    ? sql`1=1`
    : deptScope
      ? sql`(${tasks.assigneeId} in (select id from users where department_id = ${deptScope}) or ${tasks.createdById} in (select id from users where department_id = ${deptScope}))`
      : sql`(${tasks.assigneeId} = ${me.id} or ${tasks.createdById} = ${me.id})`;

  // ---- board view: the whole live pipeline, not one month of it ----
  // A piece stuck in "script" for three weeks has no publish date yet, so
  // month-scoping the board would hide exactly the items it exists to surface.
  if (isBoard) {
    const boardItems = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        channel: tasks.contentChannel,
        stage: tasks.contentStage,
        publishAt: tasks.publishAt,
        approvedAt: tasks.contentApprovedAt,
        publishState: tasks.publishState,
        assignee: users.name,
      })
      .from(tasks)
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .where(and(
        sql`${tasks.contentChannel} is not null`,
        sql`${tasks.status} <> 'cancelled'::task_status`,
        scope,
      ))
      .orderBy(asc(tasks.publishAt), asc(tasks.createdAt))
      .limit(300);

    const stalled = boardItems.filter(
      (i) => i.stage !== "published" && i.publishState !== "published" && !i.publishAt,
    ).length;

    return (
      <div className="page-content">
        <div className="page-head">
          <div>
            <div className="page-title">Content</div>
            <div className="page-sub">
              {boardItems.length} in the pipeline
              {stalled > 0 ? ` · ${stalled} without a slot` : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="cview">
              <Link href="/content" className="cview-btn">Calendar</Link>
              <span className="cview-btn is-on">Board</span>
            </div>
            <Link href="/tasks/new?content=1" className="btn btn-primary btn-sm">New content</Link>
          </div>
        </div>

        {boardItems.length === 0 ? (
          <div className="card text-center py-16 mt-4">
            <div className="text-text-2 mb-2">Nothing in the pipeline yet.</div>
            <div className="text-text-3 text-[12px] mb-3">
              Open any task and set a channel in its Publish section — it appears here as an idea.
            </div>
            <Link href="/tasks/new?content=1" className="btn btn-primary btn-sm">Capture your first post</Link>
          </div>
        ) : (
          <ContentBoard items={boardItems} />
        )}
      </div>
    );
  }

  const monthStart = new Date(`${month}-01T00:00:00+05:30`);
  const nextMonth = shiftMonth(month, 1);
  const monthEnd = new Date(`${nextMonth}-01T00:00:00+05:30`);

  const [scheduled, unscheduled] = await Promise.all([
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        channel: tasks.contentChannel,
        stage: tasks.contentStage,
        publishAt: tasks.publishAt,
        approvedAt: tasks.contentApprovedAt,
        publishState: tasks.publishState,
        publishedUrl: tasks.publishedUrl,
        assignee: users.name,
        project: projects.name,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .where(and(
        sql`${tasks.contentChannel} is not null`,
        sql`${tasks.publishAt} >= ${monthStart.toISOString()}`,
        sql`${tasks.publishAt} < ${monthEnd.toISOString()}`,
        scope,
      ))
      .orderBy(asc(tasks.publishAt)),

    db
      .select({
        id: tasks.id,
        title: tasks.title,
        channel: tasks.contentChannel,
        stage: tasks.contentStage,
        assignee: users.name,
      })
      .from(tasks)
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .where(and(
        sql`${tasks.contentChannel} is not null`,
        sql`${tasks.publishAt} is null`,
        sql`${tasks.status} not in ('done'::task_status,'cancelled'::task_status)`,
        scope,
      ))
      .orderBy(asc(tasks.createdAt))
      .limit(50),
  ]);

  // ---- bucket the month's items by IST day ----
  const byDay = new Map<string, typeof scheduled>();
  for (const item of scheduled) {
    if (!item.publishAt) continue;
    const key = istPartsOf(item.publishAt instanceof Date ? item.publishAt : new Date(item.publishAt)).date;
    const arr = byDay.get(key) ?? [];
    arr.push(item);
    byDay.set(key, arr);
  }

  // ---- build the calendar grid (Mon-first) ----
  const first = new Date(`${month}-01T12:00:00Z`);
  const firstDow = (first.getUTCDay() + 6) % 7; // 0 = Monday
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: Array<{ date: string | null; day: number | null }> = [];
  for (let i = 0; i < firstDow; i++) cells.push({ date: null, day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: `${month}-${String(d).padStart(2, "0")}`, day: d });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, day: null });

  const stageCounts = new Map<string, number>();
  for (const s of scheduled) stageCounts.set(s.stage ?? "idea", (stageCounts.get(s.stage ?? "idea") ?? 0) + 1);

  // Anything with a slot but no sign-off is the thing that bites you on the
  // morning it is due — surface the count in the header, not buried per-item.
  const awaitingApproval = scheduled.filter((s) => !s.approvedAt).length;
  const publishFailed = scheduled.filter((s) => s.publishState === "failed").length;

  return (
    <div className="page-content">
      <div className="page-head">
        <div>
          <div className="page-title">Content</div>
          <div className="page-sub">
            {scheduled.length} scheduled in {monthLabel(month)}
            {unscheduled.length > 0 ? ` · ${unscheduled.length} without a slot` : null}
            {awaitingApproval > 0 ? ` · ${awaitingApproval} awaiting approval` : null}
            {publishFailed > 0 ? ` · ${publishFailed} failed to publish` : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="cview">
            <span className="cview-btn is-on">Calendar</span>
            <Link href="/content?view=board" className="cview-btn">Board</Link>
          </div>
          <Link href={`/content?month=${shiftMonth(month, -1)}`} className="btn btn-ghost btn-sm">←</Link>
          {month !== thisMonth ? (
            <Link href="/content" className="btn btn-ghost btn-sm">This month</Link>
          ) : null}
          <Link href={`/content?month=${shiftMonth(month, 1)}`} className="btn btn-ghost btn-sm">→</Link>
          <Link href="/tasks/new?content=1" className="btn btn-primary btn-sm">New content</Link>
        </div>
      </div>

      {/* stage legend doubles as a pipeline summary */}
      <div className="content-legend">
        {CONTENT_STAGES.map((s) => (
          <span key={s.value} className="content-legend-item">
            <span className="content-legend-dot" style={{ background: s.color }} />
            {s.label}
            <span className="content-legend-n">{stageCounts.get(s.value) ?? 0}</span>
          </span>
        ))}
      </div>

      <div className="cal">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="cal-dow">{d}</div>
        ))}
        {cells.map((c, i) => (
          <div
            key={i}
            className={`cal-cell ${c.date === today ? "is-today" : ""} ${c.date ? "" : "is-blank"}`}
          >
            {c.day ? (
              <div className="cal-day-row">
                <span className="cal-day">{c.day}</span>
                {/* Click a day, capture the post for that day. The whole
                    point of a calendar is that the date is already chosen. */}
                <Link
                  href={`/tasks/new?content=1&date=${c.date}`}
                  className="cal-add"
                  aria-label={`Add content on ${c.date}`}
                  title="Add content"
                >
                  +
                </Link>
              </div>
            ) : null}
            {(byDay.get(c.date ?? "") ?? []).map((item) => (
              <Link
                key={item.id}
                href={`/tasks/${item.id}`}
                className={`cal-item ${item.approvedAt ? "" : "is-unapproved"} ${
                  item.publishState === "published" ? "is-live" : item.publishState === "failed" ? "is-failed" : ""
                }`}
                style={{ borderLeftColor: CHANNEL_COLOR[item.channel ?? ""] ?? "var(--text-3)" }}
                title={`${CHANNEL_LABEL[item.channel ?? ""] ?? "Content"} · ${STAGE_LABEL[item.stage ?? "idea"]} · ${item.assignee ?? "unassigned"}${item.approvedAt ? "" : " · not approved"}`}
              >
                <span className="cal-item-time">
                  {istPartsOf(item.publishAt instanceof Date ? item.publishAt : new Date(item.publishAt!)).time}
                </span>
                <span className="cal-item-title">{item.title}</span>
                {item.publishState === "published" ? (
                  <span className="cal-item-live" aria-label="Published">&#10003;</span>
                ) : item.publishState === "failed" ? (
                  <span className="cal-item-flag is-err" aria-label="Failed to publish">&times;</span>
                ) : item.approvedAt ? null : (
                  <span className="cal-item-flag" aria-label="Not approved">!</span>
                )}
              </Link>
            ))}
          </div>
        ))}
      </div>

      {unscheduled.length > 0 ? (
        <>
          <div className="section-title mt-6">Needs a slot</div>
          <div className="card">
            <ul className="content-backlog">
              {unscheduled.map((item) => (
                <li key={item.id}>
                  <Link href={`/tasks/${item.id}`} className="content-backlog-row">
                    <span
                      className="content-chip"
                      style={{ color: CHANNEL_COLOR[item.channel ?? ""], borderColor: CHANNEL_COLOR[item.channel ?? ""] }}
                    >
                      {CHANNEL_LABEL[item.channel ?? ""] ?? "Content"}
                    </span>
                    <span className="content-backlog-title">{item.title}</span>
                    <span className="content-chip" style={{ color: STAGE_COLOR[item.stage ?? "idea"], borderColor: STAGE_COLOR[item.stage ?? "idea"] }}>
                      {STAGE_LABEL[item.stage ?? "idea"]}
                    </span>
                    <span className="content-backlog-who">{item.assignee ?? "unassigned"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      {scheduled.length === 0 && unscheduled.length === 0 ? (
        <div className="card text-center py-16 mt-4">
          <div className="text-text-2 mb-2">Nothing in the content calendar yet.</div>
          <div className="text-text-3 text-[12px] mb-3">
            Capture a post, a webinar, an ad or a reel — or set a channel on any existing task&rsquo;s Publish section.
          </div>
          <Link href="/tasks/new?content=1" className="btn btn-primary btn-sm">Capture your first post</Link>
        </div>
      ) : null}
    </div>
  );
}
