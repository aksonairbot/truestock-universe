// apps/web/app/projects/[slug]/project-pulse.tsx
//
// Right-rail "pulse" feed on /projects/[slug]. Shows the last 20 events
// on the project — comments, task creates, completions, cancellations —
// ordered desc by time. Each event row: avatar, who, action verb, task
// title (deep-link), relative timestamp.
//
// Server component, reads three sources and unions in JS.

import Link from "next/link";
import {
  getDb,
  tasks,
  taskComments,
  users,
  eq,
  and,
  desc,
  sql,
} from "@tu/db";

type Event = {
  id: string;
  kind: "commented" | "completed" | "created" | "cancelled";
  at: Date;
  actorId: string | null;
  actorName: string;
  taskId: string;
  taskTitle: string;
  body?: string | null;
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
function relativeTime(d: Date): string {
  const now = Date.now();
  const ts = d.getTime();
  const diff = Math.max(0, now - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });
}

export async function ProjectPulse({ projectId }: { projectId: string }) {
  const db = getDb();

  // 1) Comments
  const commentEvents = await db
    .select({
      id: taskComments.id,
      at: taskComments.createdAt,
      actorId: users.id,
      actorName: users.name,
      taskId: taskComments.taskId,
      taskTitle: tasks.title,
      body: taskComments.body,
    })
    .from(taskComments)
    .innerJoin(tasks, eq(taskComments.taskId, tasks.id))
    .leftJoin(users, eq(taskComments.authorId, users.id))
    .where(eq(tasks.projectId, projectId))
    .orderBy(desc(taskComments.createdAt))
    .limit(20);

  // 2) Task creations
  const createEvents = await db
    .select({
      id: tasks.id,
      at: tasks.createdAt,
      actorId: users.id,
      actorName: users.name,
      taskId: tasks.id,
      taskTitle: tasks.title,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.createdById, users.id))
    .where(eq(tasks.projectId, projectId))
    .orderBy(desc(tasks.createdAt))
    .limit(20);

  // 3) Task completions
  const completeEvents = await db
    .select({
      id: tasks.id,
      at: tasks.completedAt,
      actorId: users.id,
      actorName: users.name,
      taskId: tasks.id,
      taskTitle: tasks.title,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(and(eq(tasks.projectId, projectId), eq(tasks.status, "done")))
    .orderBy(desc(tasks.completedAt))
    .limit(20);

  const events: Event[] = [];
  for (const e of commentEvents) {
    if (!e.at) continue;
    events.push({
      id: `c-${e.id}`,
      kind: "commented",
      at: e.at,
      actorId: e.actorId,
      actorName: e.actorName ?? "Someone",
      taskId: e.taskId,
      taskTitle: e.taskTitle,
      body: e.body,
    });
  }
  for (const e of createEvents) {
    if (!e.at) continue;
    events.push({
      id: `n-${e.id}`,
      kind: "created",
      at: e.at,
      actorId: e.actorId,
      actorName: e.actorName ?? "Someone",
      taskId: e.taskId,
      taskTitle: e.taskTitle,
    });
  }
  for (const e of completeEvents) {
    if (!e.at) continue;
    events.push({
      id: `d-${e.id}`,
      kind: "completed",
      at: e.at,
      actorId: e.actorId,
      actorName: e.actorName ?? "Someone",
      taskId: e.taskId,
      taskTitle: e.taskTitle,
    });
  }

  events.sort((a, b) => b.at.getTime() - a.at.getTime());
  const top = events.slice(0, 20);

  return (
    <aside className="project-pulse">
      <div className="project-pulse-head">
        <h3 className="project-pulse-h">Pulse</h3>
        <span className="project-pulse-sub">last {top.length} events</span>
      </div>
      {top.length === 0 ? (
        <div className="text-text-3 italic text-sm">Nothing logged yet on this project.</div>
      ) : (
        <ul className="project-pulse-list">
          {top.map((ev) => (
            <li key={ev.id} className="pulse-event">
              <span className={`tava ${avaClass(ev.actorName)}`}>{avaInitial(ev.actorName)}</span>
              <div className="pulse-body">
                <div className="pulse-line">
                  <span className="pulse-actor">{ev.actorName}</span>
                  {" "}
                  <span className={`pulse-verb pulse-verb-${ev.kind}`}>
                    {ev.kind === "commented" && "commented on"}
                    {ev.kind === "created" && "created"}
                    {ev.kind === "completed" && "completed"}
                    {ev.kind === "cancelled" && "cancelled"}
                  </span>
                  {" "}
                  <Link href={`/tasks?task=${ev.taskId}`} className="pulse-task" scroll={false}>
                    {ev.taskTitle}
                  </Link>
                </div>
                {ev.kind === "commented" && ev.body ? (
                  <div className="pulse-comment">
                    {ev.body.length > 110 ? `${ev.body.slice(0, 110).trim()}…` : ev.body}
                  </div>
                ) : null}
                <div className="pulse-time">{relativeTime(ev.at)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
