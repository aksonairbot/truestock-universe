"use server";

import { revalidatePath } from "next/cache";
import { getDb, orgSettings, eq } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { log } from "@/lib/log";

export async function updateOrgSettings(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (me.role !== "admin") throw new Error("Only admins can update org settings");

  const settingsId = ((formData.get("settingsId") as string) ?? "").trim();
  if (!settingsId) throw new Error("settingsId is required");

  const companyName = ((formData.get("companyName") as string) ?? "").trim();
  const domain = ((formData.get("domain") as string) ?? "").trim() || null;
  const timezone = ((formData.get("timezone") as string) ?? "Asia/Kolkata").trim();
  const workingHoursStart = ((formData.get("workingHoursStart") as string) ?? "09:00").trim();
  const workingHoursEnd = ((formData.get("workingHoursEnd") as string) ?? "18:00").trim();
  const defaultRole = ((formData.get("defaultRole") as string) ?? "member").trim();
  const reviewCycleFrequency = ((formData.get("reviewCycleFrequency") as string) ?? "quarterly").trim();
  const notifyOnTaskAssign = formData.get("notifyOnTaskAssign") === "on";
  const notifyOnReviewStart = formData.get("notifyOnReviewStart") === "on";
  const notifyOnDueSoon = formData.get("notifyOnDueSoon") === "on";

  // Parse working days checkboxes
  const workingDays: number[] = [];
  for (let i = 0; i <= 6; i++) {
    if (formData.get(`workingDay_${i}`) === "on") workingDays.push(i);
  }
  if (workingDays.length === 0) workingDays.push(1, 2, 3, 4, 5); // fallback to Mon-Fri

  if (!companyName) throw new Error("Company name is required");

  const db = getDb();
  await db
    .update(orgSettings)
    .set({
      companyName,
      domain,
      timezone,
      workingHoursStart,
      workingHoursEnd,
      workingDays,
      defaultRole,
      reviewCycleFrequency,
      notifyOnTaskAssign,
      notifyOnReviewStart,
      notifyOnDueSoon,
      updatedAt: new Date(),
    })
    .where(eq(orgSettings.id, settingsId));

  log.info("org_settings.updated", { by: me.email });
  revalidatePath("/settings");
  revalidatePath("/settings/organisation");
}
