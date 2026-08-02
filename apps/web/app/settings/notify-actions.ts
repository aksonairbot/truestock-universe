// apps/web/app/settings/notify-actions.ts
//
// The personal off switch for messages outside the app. Deliberately needs
// no admin: it is their own inbox, so turning it off is theirs to decide and
// should never involve asking anyone.

"use server";

import { revalidatePath } from "next/cache";
import { getDb, users, eq } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { log } from "@/lib/log";

export async function setOutboundPreference(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  const on = formData.get("enabled") === "true";

  const db = getDb();
  await db.update(users).set({ notifyOutbound: on }).where(eq(users.id, me.id));

  log.info("settings.outbound_pref", { userId: me.id, on });
  revalidatePath("/settings");
}
