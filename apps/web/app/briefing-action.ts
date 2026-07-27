// apps/web/app/briefing-action.ts
//
// Thin auth wrapper around lib/briefing.ts. The generation core moved to the
// lib so the 9 AM cron can pre-warm briefings for all users — exports from
// this "use server" file are public endpoints, so only the current-user
// wrappers live here.
//
// Cached per (user, date, kind). Refresh = regenerate + overwrite.

"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { generateBriefing, type BriefingKind as Kind, type BriefingResult as Result } from "@/lib/briefing";

export type BriefingKind = Kind;
export type BriefingResult = Result;

export async function getOrGenerateBriefing(kind: BriefingKind, opts?: { force?: boolean }): Promise<BriefingResult> {
  const me = await getCurrentUser();
  return generateBriefing(me.id, me.name, kind, { skipIfExists: !opts?.force });
}

/** Bound to the "Refresh" button form on the briefing card. */
export async function refreshBriefing(formData: FormData): Promise<void> {
  const kindRaw = (formData.get("kind") as string) ?? "morning";
  const kind: BriefingKind = kindRaw === "eod" ? "eod" : "morning";
  await getOrGenerateBriefing(kind, { force: true });
  revalidatePath("/");
}
