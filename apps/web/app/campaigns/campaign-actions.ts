// apps/web/app/campaigns/campaign-actions.ts
//
// Campaign mutations. Creating and shaping a campaign is a planning act, so
// it is limited to admins and managers; ANY member can attach their own task
// to a campaign, because that's just filing work under the push it belongs to.

"use server";

import { revalidatePath } from "next/cache";
import { getDb, campaigns, tasks, eq } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { isPrivileged, requireTaskAccess } from "@/lib/access";
import { isCampaignStatus, rupeesToPaise } from "@/lib/campaigns";
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
