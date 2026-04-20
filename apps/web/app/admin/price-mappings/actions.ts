"use server";

import { revalidatePath } from "next/cache";
import { getDb, productPriceMappings, eq } from "@tu/db";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function createMapping(formData: FormData): Promise<ActionResult> {
  const productId = (formData.get("productId") as string)?.trim();
  const amountInr = Number(formData.get("amountInr"));
  const interval = formData.get("interval") as
    | "monthly"
    | "quarterly"
    | "half_yearly"
    | "yearly"
    | "one_off";
  const tolerancePaise = Number(formData.get("tolerancePaise") ?? 100);
  const planNameMatch =
    ((formData.get("planNameMatch") as string) ?? "").trim() || null;
  const notes = ((formData.get("notes") as string) ?? "").trim() || null;

  if (!productId) return { ok: false, error: "product is required" };
  if (!Number.isFinite(amountInr) || amountInr <= 0) {
    return { ok: false, error: "amount must be a positive number (in INR)" };
  }
  if (!["monthly", "quarterly", "half_yearly", "yearly", "one_off"].includes(interval)) {
    return { ok: false, error: "invalid interval" };
  }

  const db = getDb();
  await db.insert(productPriceMappings).values({
    productId,
    planNameMatch,
    amountPaise: BigInt(Math.round(amountInr * 100)),
    interval,
    tolerancePaise,
    notes,
  });

  revalidatePath("/admin/price-mappings");
  return { ok: true };
}

export async function setMappingActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "id is required" };
  const db = getDb();
  await db
    .update(productPriceMappings)
    .set({ isActive })
    .where(eq(productPriceMappings.id, id));

  revalidatePath("/admin/price-mappings");
  return { ok: true };
}
