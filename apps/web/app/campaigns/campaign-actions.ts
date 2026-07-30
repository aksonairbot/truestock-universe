// apps/web/app/campaigns/campaign-actions.ts
//
// Campaign mutations. Creating and shaping a campaign is a planning act, so
// it is limited to admins and managers; ANY member can attach their own task
// to a campaign, because that's just filing work under the push it belongs to.

"use server";

import { revalidatePath } from "next/cache";
import { getDb, campaigns, tasks, projects, eq, and, sql, isNull } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { isPrivileged, requireTaskAccess } from "@/lib/access";
import { isCampaignStatus, rupeesToPaise } from "@/lib/campaigns";
import { isChannel, istDateTimeToUtc } from "@/lib/content";
import { log } from "@/lib/log";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function readDates(formData: FormData): { startDate: string | null; endDate: string | null } {
  const startDate = ((formData.get("startDate") as string) ?? "").trim() || null;
  const endDate = ((formData.get("endDate") as string) ?? "").trim() || null;
  if (startDate && !DATE_RE.test(startDate)) throw new Error("Start date is not a real date.");
  if (endDate && !DATE_RE.test(endDate)) throw new Error("End date is not a real date.");
  // Mirrors the CHECK constraint, but with a sentence a person can act on.
  if (startDate && endDate && endDate < startDate) {
    throw new Error("The campaign ends before it starts — check the dates.");
  }
  return { startDate, endDate };
}

export async function createCampaign(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!isPrivileged(me)) throw new Error("Only admins and managers can create campaigns.");

  const name = ((formData.get("name") as string) ?? "").trim().slice(0, 200);
  if (!name) throw new Error("Give the campaign a name.");

  const objective = ((formData.get("objective") as string) ?? "").trim().slice(0, 2000) || null;
  const statusRaw = ((formData.get("status") as string) ?? "planning").trim();
  const status = isCampaignStatus(statusRaw) ? statusRaw : "planning";
  const { startDate, endDate } = readDates(formData);
  const budgetPaise = rupeesToPaise((formData.get("budget") as string) ?? "");

  const ownerRaw = ((formData.get("ownerId") as string) ?? "").trim();
  const ownerId = UUID_RE.test(ownerRaw) ? ownerRaw : me.id;

  const db = getDb();
  const [created] = await db
    .insert(campaigns)
    .values({ name, objective, status, startDate, endDate, budgetPaise, ownerId, createdById: me.id })
    .returning({ id: campaigns.id });

  if (!created) throw new Error("Campaign was not created.");
  log.info("campaign.created", { campaignId: created.id, actorId: me.id, status });

  revalidatePath("/campaigns");
}

export async function updateCampaign(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!isPrivileged(me)) throw new Error("Only admins and managers can edit campaigns.");

  const id = ((formData.get("campaignId") as string) ?? "").trim();
  if (!UUID_RE.test(id)) throw new Error("campaignId is required");

  const name = ((formData.get("name") as string) ?? "").trim().slice(0, 200);
  if (!name) throw new Error("Give the campaign a name.");

  const objective = ((formData.get("objective") as string) ?? "").trim().slice(0, 2000) || null;
  const statusRaw = ((formData.get("status") as string) ?? "planning").trim();
  const status = isCampaignStatus(statusRaw) ? statusRaw : "planning";
  const { startDate, endDate } = readDates(formData);
  const budgetPaise = rupeesToPaise((formData.get("budget") as string) ?? "");

  const ownerRaw = ((formData.get("ownerId") as string) ?? "").trim();
  const ownerId = UUID_RE.test(ownerRaw) ? ownerRaw : null;

  const db = getDb();
  await db
    .update(campaigns)
    .set({ name, objective, status, startDate, endDate, budgetPaise, ownerId, updatedAt: new Date() })
    .where(eq(campaigns.id, id));

  log.info("campaign.updated", { campaignId: id, actorId: me.id, status });
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id}`);
}

/**
 * Archive rather than delete. A finished campaign is the record of what the
 * team spent a quarter doing — deleting it would orphan that history, and the
 * tasks under it would lose their only link to why they existed.
 */
export async function archiveCampaign(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!isPrivileged(me)) throw new Error("Only admins and managers can archive campaigns.");

  const id = ((formData.get("campaignId") as string) ?? "").trim();
  if (!UUID_RE.test(id)) throw new Error("campaignId is required");

  const restore = formData.get("restore") === "true";
  const db = getDb();
  await db
    .update(campaigns)
    .set({ archivedAt: restore ? null : new Date(), updatedAt: new Date() })
    .where(eq(campaigns.id, id));

  log.info(restore ? "campaign.restored" : "campaign.archived", { campaignId: id, actorId: me.id });
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id}`);
}

/**
 * Attach a task to a campaign and set its line-item budget.
 *
 * Deliberately NOT privileged-only: filing your own work under the push it
 * belongs to is part of doing the work. The task access check is what keeps
 * this honest — you can only file a task you can already see.
 */
export async function setTaskCampaign(formData: FormData): Promise<void> {
  const taskId = ((formData.get("taskId") as string) ?? "").trim();
  if (!taskId) throw new Error("taskId is required");

  const me = await getCurrentUser();
  await requireTaskAccess(taskId, me);

  const campaignRaw = ((formData.get("campaignId") as string) ?? "").trim();
  let campaignId: string | null = null;
  if (campaignRaw) {
    if (!UUID_RE.test(campaignRaw)) throw new Error("That campaign id is not valid.");
    const db0 = getDb();
    const [exists] = await db0
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(eq(campaigns.id, campaignRaw))
      .limit(1);
    if (!exists) throw new Error("That campaign no longer exists.");
    campaignId = campaignRaw;
  }

  const budgetPaise = rupeesToPaise((formData.get("budget") as string) ?? "");

  const db = getDb();
  await db
    .update(tasks)
    .set({ campaignId, budgetPaise, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  log.info("task.campaign_set", { taskId, campaignId, actorId: me.id });
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  revalidatePath("/campaigns");
  if (campaignId) revalidatePath(`/campaigns/${campaignId}`);
}


// ---------------------------------------------------------------------------
// planCadence — the media planner's power tool.
//
// "Three reels a week for six weeks" is how content actually gets planned, and
// creating eighteen near-identical tasks by hand is the reason people go back
// to spreadsheets. This generates the whole run in one pass: pick a channel,
// the weekdays, a time, and a window, and every slot appears on the calendar
// as an idea.
//
// Every generated item starts at stage "idea" and unapproved — a cadence
// creates PLACEHOLDERS, not approved content. The approval gate still stands
// between these and anything going out.
// ---------------------------------------------------------------------------

/** Hard ceiling per run. A typo in the date range shouldn't create 400 tasks. */
const MAX_CADENCE_ITEMS = 60;

/** ISO date + n days, using UTC noon so DST/offsets can't shift the day. */
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** 0 = Sunday … 6 = Saturday, matching the form's checkbox values. */
function dowOf(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}
function shortLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export async function planCadence(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  // Planning a cadence creates work for other people — same bar as creating
  // the campaign itself.
  if (!isPrivileged(me)) throw new Error("Only admins and managers can plan a cadence.");

  const campaignId = ((formData.get("campaignId") as string) ?? "").trim();
  if (!UUID_RE.test(campaignId)) throw new Error("campaignId is required");

  const channel = ((formData.get("channel") as string) ?? "").trim();
  if (!isChannel(channel)) throw new Error("Pick a channel for the cadence.");

  const startDate = ((formData.get("startDate") as string) ?? "").trim();
  const endDate = ((formData.get("endDate") as string) ?? "").trim();
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    throw new Error("Give the cadence a start and end date.");
  }
  if (endDate < startDate) throw new Error("The cadence ends before it starts — check the dates.");

  const days = formData
    .getAll("days")
    .map((d) => Number(d))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  if (days.length === 0) throw new Error("Pick at least one day of the week.");
  const daySet = new Set(days);

  const time = ((formData.get("time") as string) ?? "10:00").trim();
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error("Publish time is not valid.");

  const prefix = ((formData.get("titlePrefix") as string) ?? "").trim().slice(0, 120);
  if (!prefix) throw new Error("Give the items a title, e.g. \"Reel\" or \"Market recap\".");

  const projectSlug = ((formData.get("projectSlug") as string) ?? "").trim();
  if (!projectSlug) throw new Error("Pick a project — every task belongs to one.");

  const assigneeRaw = ((formData.get("assigneeId") as string) ?? "").trim();
  const assigneeId = UUID_RE.test(assigneeRaw) ? assigneeRaw : me.id;

  const budgetPaise = rupeesToPaise((formData.get("budget") as string) ?? "");

  const db = getDb();

  const [campaign] = await db
    .select({ id: campaigns.id, name: campaigns.name })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  if (!campaign) throw new Error("That campaign no longer exists.");

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.slug, projectSlug), isNull(projects.archivedAt)))
    .limit(1);
  if (!project) throw new Error("That project was not found.");

  // Already-planned slots for this campaign+channel. Re-running a cadence is
  // a normal thing to do (extending a run by two weeks), so colliding slots
  // are SKIPPED rather than duplicated.
  const existing = await db
    .select({ publishAt: tasks.publishAt })
    .from(tasks)
    .where(and(eq(tasks.campaignId, campaignId), eq(tasks.contentChannel, channel), sql`${tasks.publishAt} is not null`));
  const taken = new Set(
    existing
      .map((e) => (e.publishAt instanceof Date ? e.publishAt : new Date(e.publishAt!)))
      .map((d) => d.toISOString()),
  );

  const rows: Array<typeof tasks.$inferInsert> = [];
  let skipped = 0;

  for (let iso = startDate; iso <= endDate; iso = addDays(iso, 1)) {
    if (!daySet.has(dowOf(iso))) continue;

    const publishAt = istDateTimeToUtc(iso, time);
    if (Number.isNaN(publishAt.getTime())) continue;
    if (taken.has(publishAt.toISOString())) {
      skipped++;
      continue;
    }

    rows.push({
      projectId: project.id,
      title: `${prefix} — ${shortLabel(iso)}`,
      status: "todo",
      priority: "med",
      // The due date IS the publish day: that's when the work has to be
      // finished. This deliberately bypasses the create-form's 2-week cap,
      // which exists to keep ad-hoc tasks realistic and does not apply to
      // content planned a quarter out.
      dueDate: iso,
      assigneeId,
      contentChannel: channel,
      contentStage: "idea",
      publishAt,
      campaignId,
      budgetPaise,
      createdById: me.id,
    });

    if (rows.length > MAX_CADENCE_ITEMS) {
      throw new Error(
        `That range would create more than ${MAX_CADENCE_ITEMS} items. Shorten the window or pick fewer days.`,
      );
    }
  }

  if (rows.length === 0) {
    throw new Error(
      skipped > 0
        ? "Every slot in that range is already planned."
        : "No dates in that range fall on the days you picked.",
    );
  }

  await db.insert(tasks).values(rows);

  log.info("campaign.cadence_planned", {
    campaignId,
    channel,
    created: rows.length,
    skipped,
    actorId: me.id,
  });

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
  revalidatePath("/content");
  revalidatePath("/tasks");
}
