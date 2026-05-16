import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb, orgSettings } from "@tu/db";
import { OrgSettingsForm } from "./org-settings-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Organisation Settings · SeekPeek",
  description: "Manage your workspace settings",
};

export default async function OrgSettingsPage() {
  const user = await getCurrentUser();
  if (user.role !== "admin") redirect("/settings");

  const db = getDb();
  let [row] = await db.select().from(orgSettings).limit(1);

  if (!row) {
    // Auto-seed if missing
    const [created] = await db
      .insert(orgSettings)
      .values({ companyName: "SeekPeek" })
      .returning();
    row = created!;
  }

  // Ensure workingDays is a proper number array (JSONB can be stringified)
  let workingDays: number[] = [1, 2, 3, 4, 5];
  if (Array.isArray(row.workingDays)) {
    workingDays = row.workingDays;
  } else if (typeof row.workingDays === "string") {
    try { workingDays = JSON.parse(row.workingDays); } catch {}
  }

  const settings = {
    id: row.id,
    companyName: row.companyName,
    logoUrl: row.logoUrl,
    domain: row.domain,
    timezone: row.timezone,
    workingHoursStart: row.workingHoursStart,
    workingHoursEnd: row.workingHoursEnd,
    workingDays,
    defaultRole: row.defaultRole,
    reviewCycleFrequency: row.reviewCycleFrequency,
    notifyOnTaskAssign: row.notifyOnTaskAssign,
    notifyOnReviewStart: row.notifyOnReviewStart,
    notifyOnDueSoon: row.notifyOnDueSoon,
  };

  return (
    <div className="page-content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Organisation Settings</h1>
          <p className="page-sub">Manage your workspace configuration</p>
        </div>
      </div>

      <OrgSettingsForm settings={settings} />
    </div>
  );
}
