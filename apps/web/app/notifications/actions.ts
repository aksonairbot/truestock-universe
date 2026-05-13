// apps/web/app/notifications/actions.ts

"use server";

import { revalidatePath } from "next/cache";
import { getDb, notifications, eq, and, sql, inArray } from "@tu/db";
import { getCurrentUserId } from "@/lib/auth";

export async function markRead(formData: FormData): Promise<void> {
  const idsRaw = (formData.get("ids") as string) ?? "";
  const taskId = (formData.get("taskId") as string) ?? "";
  const ids = idsRaw.split(",").filter((s) => /^[0-9a-f-]{36}$/.test(s.trim())).map((s) => s.trim());
  if (ids.length === 0) return;
  const me = await getCurrentUserId();
  const db = getDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, me),
        sql`${notifications.readAt} is null`,
        inArray(notifications.id, ids),
      ),
    );
  revalidatePath("/notifications");
  if (taskId) revalidatePath(`/tasks/${taskId}`);
}

export async function markAllRead(): Promise<void> {
  const me = await getCurrentUserId();
  const db = getDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, me), sql`${notifications.readAt} is null`));
  revalidatePath("/notifications");
}
