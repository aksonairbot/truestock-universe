// apps/web/app/rating/actions.ts
//
// Asking someone to work on something specific.
//
// This is what the original "do 5 tasks and B becomes A" turned into once the
// promise was taken out of it. The system invents no threshold; a manager
// names the actual work. "Availability and inter-team communication can be
// improved" stops being a line in a review and becomes two tasks with dates.
//
// IT STILL PROMISES NOTHING. Finishing these does not move anyone's standing —
// a person decides that, same as before. What it does is turn "be better" into
// something you can do on Tuesday, which is the whole difference between
// feedback and a verdict.

"use server";

import { revalidatePath } from "next/cache";
import { getDb, tasks, users, projects, eq, sql } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { canSetStandingOf } from "@/lib/standing";
import { notifyAssigned } from "@/lib/notify";
import { log } from "@/lib/log";
import { ok, fail, type ActionResult } from "@/lib/action-result";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/**
 * Ninety days. Ordinary tasks are capped at two weeks because they're
 * this-sprint work; "get better at cross-team communication" is not, and
 * forcing it into a fortnight would either make it a lie or make it trivial.
 */
const MAX_HORIZON_DAYS = 90;

function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function istPlusDays(n: number): string {
  const d = new Date(`${istToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function addImprovementTask(formData: FormData): Promise<ActionResult> {
  const memberId = ((formData.get("memberId") as string) ?? "").trim();
  const title = ((formData.get("title") as string) ?? "").trim();
  const dueDate = ((formData.get("dueDate") as string) ?? "").trim();
  const projectId = ((formData.get("projectId") as string) ?? "").trim();

  if (!memberId) return fail("This form lost track of who it's for. Reload the page.");
  if (!title) return fail("Say what they should work on.");
  if (title.length > 200) return fail(`That's ${title.length} characters; 200 is the most.`);

  const me = await getCurrentUser();
  const db = getDb();

  const [subject] = await db
    .select({
      id: users.id, name: users.name, role: users.role,
      departmentId: users.departmentId, managerId: users.managerId,
    })
    .from(users)
    .where(eq(users.id, memberId))
    .limit(1);
  if (!subject) return fail("That person no longer exists. Reload the page.");

  // Same gate as setting a standing, and deliberately so: asking someone to
  // work on something is the same relationship as rating them. It also means
  // nobody can set themselves improvement work to look busy.
  if (me.id === subject.id) {
    return fail("You can't set your own improvement tasks — that's a conversation with your manager.");
  }
  if (!canSetStandingOf(me, subject)) {
    return fail("You can only do this for people you manage.");
  }

  if (!dueDate || !DATE_RE.test(dueDate)) return fail("Pick a date for this to be done by.");
  const today = istToday();
  if (dueDate < today) return fail("That date has already passed.");
  if (dueDate > istPlusDays(MAX_HORIZON_DAYS)) {
    return fail(`Keep it within ${MAX_HORIZON_DAYS} days — beyond that it stops being something anyone acts on.`);
  }

  // A task needs a project. Rather than make the manager choose one every
  // time, fall back to whatever the person already works in most.
  let useProject = projectId;
  if (!useProject) {
    const [guess] = await db
      .select({ id: tasks.projectId })
      .from(tasks)
      .where(eq(tasks.assigneeId, memberId))
      .orderBy(sql`${tasks.createdAt} desc`)
      .limit(1);
    useProject = guess?.id ?? "";
  }
  if (!useProject) {
    const [any] = await db.select({ id: projects.id }).from(projects).limit(1);
    useProject = any?.id ?? "";
  }
  if (!useProject) return fail("There are no projects yet, and a task has to live in one.");

  try {
    const [created] = await db
      .insert(tasks)
      .values({
        projectId: useProject,
        title,
        status: "todo",
        priority: "med",
        dueDate,
        assigneeId: memberId,
        improvementFor: memberId,
        createdById: me.id,
      })
      .returning({ id: tasks.id });

    if (!created) return fail("The task wasn't saved. Try again.");

    log.info("improvement.added", { memberId, taskId: created.id, by: me.id });

    // They find out the way they find out about any other work assigned to
    // them. A separate "your manager wants you to improve" notification would
    // land very differently, and not better.
    void notifyAssigned({
      assigneeId: memberId,
      actorId: me.id,
      taskId: created.id,
      taskTitle: title,
    }).catch((e) => log.error("improvement.notify_failed", { error: (e as Error).message }));
  } catch (e) {
    log.error("improvement.add_failed", { memberId, error: (e as Error).message });
    return fail("The database rejected that. The details are in the server log.");
  }

  revalidatePath("/rating");
  revalidatePath("/tasks");
  return ok;
}

/** Withdraw an ask. The task itself survives — only the growth link is cut. */
export async function unlinkImprovementTask(formData: FormData): Promise<ActionResult> {
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  if (!taskId) return fail("This form lost track of which task. Reload the page.");

  const me = await getCurrentUser();
  const db = getDb();

  const [row] = await db
    .select({ id: tasks.id, improvementFor: tasks.improvementFor })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row?.improvementFor) return ok; // already unlinked — nothing to say

  const [subject] = await db
    .select({
      id: users.id, role: users.role,
      departmentId: users.departmentId, managerId: users.managerId,
    })
    .from(users)
    .where(eq(users.id, row.improvementFor))
    .limit(1);
  if (!subject || !canSetStandingOf(me, subject)) {
    return fail("You can only do this for people you manage.");
  }

  await db.update(tasks).set({ improvementFor: null }).where(eq(tasks.id, taskId));
  log.info("improvement.unlinked", { taskId, by: me.id });
  revalidatePath("/rating");
  return ok;
}
