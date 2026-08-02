// apps/web/lib/rating-signals.ts
//
// WHAT YOUR MANAGER CAN SEE. Facts about a person's own work, for the person
// themselves.
//
// THE ONE RULE THIS FILE EXISTS TO HOLD: NOTHING HERE IS A SCORE, AND NOTHING
// HERE PROMISES A RATING.
//
// The original request was "do 5 tasks and B becomes A". That can't be built
// honestly, because the standing is a manager's judgement — a system that
// promises a tier change is writing a cheque only a human can cash, and when
// the human doesn't, the person has a documented grievance. Amit's answer was
// "show influence, not promises", and "manager decides" what counts.
//
// So this deliberately does NOT:
//   • weight the signals, or combine them into a number
//   • state a threshold ("3 more and you reach Strong")
//   • rank anyone against anyone else
//   • claim any of it determines the rating
//
// What it DOES: surface the handful of things about someone's own work that a
// manager can already see, each one linked to the actual tasks so it is
// something they can go and do something about this afternoon. If a person
// reads this page and thinks "I should clear those three overdue items", it
// has worked. If they read it and think "I need four more points", it has
// failed and someone has added a formula.
//
// Task COUNT is deliberately absent. It is the easiest number in SeekPeak to
// inflate — five trivial tasks created and closed in a minute — and it
// penalises whoever takes on the hard work.

import { getDb, sql } from "@tu/db";

export interface Signal {
  key: string;
  /** The number, already formatted. "4", or "11 of 13". */
  value: string;
  /** What the number is. Short. */
  label: string;
  /** One sentence, written to the person. */
  detail: string;
  /** attention = there is something to do; steady = nothing wrong. */
  tone: "attention" | "steady";
  href?: string;
  cta?: string;
}

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const r = (result as { rows?: unknown[] })?.rows;
  return Array.isArray(r) ? (r as Array<Record<string, unknown>>) : [];
}
const num = (v: unknown): number => Number(v) || 0;

/**
 * Everything in one round trip. Five small aggregates against indexed columns;
 * splitting them into five queries would be five times the latency for no
 * benefit, since the page needs all of them or none.
 *
 * All timestamps are compared in IST, because a task due "today" means today
 * where the team actually is.
 */
export async function getRatingSignals(userId: string): Promise<Signal[]> {
  const db = getDb();

  const res = await db.execute(sql`
    select
      (select count(*)::int from tasks
        where assignee_id = ${userId}
          and status not in ('done'::task_status, 'cancelled'::task_status)
          and due_date is not null
          and due_date < (now() at time zone 'Asia/Kolkata')::date
      ) as overdue,

      (select count(*)::int from tasks
        where assignee_id = ${userId} and status = 'done'
          and completed_at is not null and due_date is not null
          and completed_at > now() - interval '30 days'
      ) as done30,

      (select count(*)::int from tasks
        where assignee_id = ${userId} and status = 'done'
          and completed_at is not null and due_date is not null
          and completed_at > now() - interval '30 days'
          and (completed_at at time zone 'Asia/Kolkata')::date <= due_date
      ) as ontime30,

      (select count(*)::int from task_comments c
        join tasks t on t.id = c.task_id
        where t.assignee_id = ${userId}
          and c.kind = 'review_revise'
          and c.created_at > now() - interval '90 days'
      ) as revisions,

      (select count(*)::int from task_comments c
        join tasks t on t.id = c.task_id
        where t.assignee_id = ${userId}
          and c.kind in ('review_revise', 'review_approve')
          and c.created_at > now() - interval '90 days'
      ) as reviews,

      (select count(*)::int from tasks
        where assignee_id = ${userId}
          and content_channel is not null
          and status <> 'cancelled'::task_status
          and publish_at is not null
          and publish_at <= now() + interval '7 days'
          and content_approved_at is null
      ) as unapproved,

      (select count(*)::int from tasks
        where assignee_id = ${userId}
          and content_channel is not null
          and status <> 'cancelled'::task_status
          and publish_at is not null
          and publish_at < now()
          and publish_state <> 'published'
      ) as missed
  `);

  const r = rowsOf(res)[0] ?? {};
  const overdue = num(r.overdue);
  const done30 = num(r.done30);
  const ontime30 = num(r.ontime30);
  const revisions = num(r.revisions);
  const reviews = num(r.reviews);
  const unapproved = num(r.unapproved);
  const missed = num(r.missed);

  const out: Signal[] = [];

  // Ordered so anything with something to DO comes first. A page that opens
  // with a rate you can't act on today is a page nobody reads twice.
  if (overdue > 0) {
    out.push({
      key: "overdue",
      value: String(overdue),
      label: overdue === 1 ? "task overdue" : "tasks overdue",
      detail:
        "Past their due date and still open. This is the most visible thing on your record, and the only way to clear it is to finish them or move the date with your manager.",
      tone: "attention",
      href: "/tasks",
      cta: "Open your tasks",
    });
  }

  if (missed > 0) {
    out.push({
      key: "missed",
      value: String(missed),
      label: missed === 1 ? "publish slot passed" : "publish slots passed",
      detail: "Content whose slot has gone by without anything going out. Either publish it, or take the date off so the calendar stops claiming it's coming.",
      tone: "attention",
      href: "/content",
      cta: "Open the calendar",
    });
  }

  if (unapproved > 0) {
    out.push({
      key: "unapproved",
      value: String(unapproved),
      label: "waiting on approval",
      detail: "Going out within a week and nobody has signed it off yet. Approval isn't yours to give, so the useful move is asking — early enough that it isn't a scramble.",
      tone: "attention",
      href: "/content",
      cta: "Open the calendar",
    });
  }

  if (done30 > 0) {
    const late = done30 - ontime30;
    out.push({
      key: "ontime",
      value: `${ontime30} of ${done30}`,
      label: "finished on time, last 30 days",
      detail:
        late === 0
          ? "Everything you closed this month landed on or before its due date."
          : `${late} went past the date. Reliability tends to matter more to a manager than volume — a smaller number of things that land when you said they would reads better than a lot of things that slip.`,
      tone: late > 0 ? "attention" : "steady",
      href: "/tasks",
      cta: "Open your tasks",
    });
  }

  if (reviews > 0) {
    out.push({
      key: "revisions",
      value: `${reviews - revisions} of ${reviews}`,
      label: "approved without revision, last 90 days",
      detail:
        revisions === 0
          ? "Everything that went to review was approved first time."
          : `${revisions} came back for changes. Worth reading those notes together — it's usually the same one or two things each time.`,
      tone: "steady",
    });
  }

  return out;
}


export interface RelatedTask {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  completedAt: Date | null;
  overdue: boolean;
}

/**
 * The actual work behind the numbers.
 *
 * A manager setting someone's standing should be looking at the work, not at
 * five aggregates. This is what turns the rating page from a dashboard into
 * something you can form a judgement from: overdue first, then what's open,
 * then what they've actually finished lately.
 *
 * The person's own page gets it too — being told "4 overdue" without being
 * told WHICH four is the kind of feedback that makes people feel watched
 * rather than helped.
 */
export async function getRelatedTasks(userId: string, limit = 14): Promise<RelatedTask[]> {
  const db = getDb();
  const res = await db.execute(sql`
    select id, title, status::text as status, due_date, completed_at,
           (status not in ('done'::task_status, 'cancelled'::task_status)
             and due_date is not null
             and due_date < (now() at time zone 'Asia/Kolkata')::date) as overdue
    from tasks
    where assignee_id = ${userId}
      and status <> 'cancelled'::task_status
      and (status not in ('done'::task_status)
           or completed_at > now() - interval '30 days')
    order by
      (status not in ('done'::task_status, 'cancelled'::task_status)
        and due_date is not null
        and due_date < (now() at time zone 'Asia/Kolkata')::date) desc,
      (status not in ('done'::task_status)) desc,
      due_date asc nulls last,
      completed_at desc nulls last
    limit ${limit}
  `);

  return rowsOf(res).map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ""),
    status: String(r.status ?? ""),
    dueDate: r.due_date == null ? null : String(r.due_date),
    completedAt: r.completed_at == null ? null : new Date(String(r.completed_at)),
    overdue: Boolean(r.overdue),
  }));
}
