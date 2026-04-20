"use server";

import { revalidatePath } from "next/cache";
import { getDb, payments, products, customers, eq } from "@tu/db";
import { mapAmountToProduct } from "@tu/razorpay";
import { log } from "@/lib/log";
import {
  parseCsv,
  syntheticPaymentId,
  type InsertSummary,
  type SelectableProductSlug,
  SELECTABLE_PRODUCT_SLUGS,
} from "./shared";

type SingleResult = { ok: true; paymentId: string } | { ok: false; error: string };

// --------------------------------------------------------------------------
// Single-payment entry
// --------------------------------------------------------------------------
export async function createManualPayment(formData: FormData): Promise<SingleResult> {
  const productSlug = (formData.get("productSlug") as string)?.trim() as SelectableProductSlug;
  const amountInr = Number(formData.get("amountInr"));
  const dateStr = (formData.get("date") as string)?.trim();
  const timeStr = ((formData.get("time") as string) ?? "00:00:00").trim();
  const description = ((formData.get("description") as string) ?? "").trim() || null;
  const customerEmail = ((formData.get("customerEmail") as string) ?? "").trim() || null;
  const customerPhone = ((formData.get("customerPhone") as string) ?? "").trim() || null;
  const planName = ((formData.get("planName") as string) ?? "").trim() || null;
  const razorpayPaymentId = ((formData.get("razorpayPaymentId") as string) ?? "").trim() || null;
  const method = ((formData.get("method") as string) ?? "").trim() || null;
  const enteredBy = ((formData.get("enteredBy") as string) ?? "").trim() || null;

  if (!SELECTABLE_PRODUCT_SLUGS.includes(productSlug)) {
    return { ok: false, error: "invalid product" };
  }
  if (!Number.isFinite(amountInr) || amountInr <= 0) {
    return { ok: false, error: "amount must be a positive number" };
  }
  const captured = new Date(`${dateStr}T${timeStr}+05:30`);
  if (Number.isNaN(captured.getTime())) {
    return { ok: false, error: "invalid date/time" };
  }

  const amountPaise = BigInt(Math.round(amountInr * 100));
  const db = getDb();

  // Resolve product (fallback to the explicitly selected product if mapper returns unknown)
  const match = await mapAmountToProduct(db, amountPaise, planName);
  let productId = match.productId;
  let mappedBy = match.matchedBy;

  if (!productId || match.matchedBy === "unknown") {
    // User explicitly chose a product — trust it even when no mapping matched
    const [p] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, productSlug))
      .limit(1);
    if (!p) return { ok: false, error: `product '${productSlug}' not found in DB — run seed` };
    productId = p.id;
    mappedBy = "plan_name"; // user-asserted
  }

  const pid = razorpayPaymentId ?? syntheticPaymentId({
    capturedAt: captured,
    amountPaise,
    customerEmail,
    customerPhone,
  });

  // Touch customer row (best-effort — email/phone-based)
  let customerId: string | null = null;
  if (customerEmail || customerPhone) {
    const [existing] = customerEmail
      ? await db.select({ id: customers.id }).from(customers).where(eq(customers.email, customerEmail)).limit(1)
      : customerPhone
        ? await db.select({ id: customers.id }).from(customers).where(eq(customers.phone, customerPhone)).limit(1)
        : [undefined];
    if (existing) {
      customerId = existing.id;
    } else {
      const [created] = await db
        .insert(customers)
        .values({ email: customerEmail, phone: customerPhone, primaryProductId: productId })
        .returning({ id: customers.id });
      customerId = created?.id ?? null;
    }
  }

  try {
    await db
      .insert(payments)
      .values({
        razorpayPaymentId: pid,
        customerId,
        productId,
        amountPaise,
        currency: "INR",
        status: "captured",
        method,
        capturedAt: captured,
        mappingConfidence: "1.00",
        source: "manual",
        enteredBy,
      })
      .onConflictDoNothing({ target: payments.razorpayPaymentId });

    log.info("payments.manual.created", {
      paymentId: pid,
      productSlug,
      amountPaise: amountPaise.toString(),
      mappedBy,
    });
    revalidatePath("/mis/revenue");
    revalidatePath("/admin/payments");
    return { ok: true, paymentId: pid };
  } catch (e) {
    log.error("payments.manual.create_failed", e, { pid });
    return { ok: false, error: e instanceof Error ? e.message : "insert failed" };
  }
}

// --------------------------------------------------------------------------
// CSV bulk import
// --------------------------------------------------------------------------
export async function importCsvPayments(formData: FormData): Promise<InsertSummary> {
  const csv = (formData.get("csv") as string) ?? "";
  const defaultProductSlug = ((formData.get("defaultProduct") as string) ?? "").trim() as SelectableProductSlug;
  const enteredBy = ((formData.get("enteredBy") as string) ?? "").trim() || null;

  const { rows, headerErrors } = parseCsv(csv, {
    defaultProduct: SELECTABLE_PRODUCT_SLUGS.includes(defaultProductSlug) ? defaultProductSlug : undefined,
  });

  const result: InsertSummary = {
    ok: true,
    inserted: 0,
    skipped: 0,
    unmapped: 0,
    errors: [...headerErrors],
  };

  if (rows.length === 0) {
    result.ok = false;
    if (result.errors.length === 0) result.errors.push("no data rows parsed");
    return result;
  }

  const db = getDb();

  // Preload product id lookup
  const prodRows = await db.select({ id: products.id, slug: products.slug }).from(products);
  const slugToId = new Map(prodRows.map((r) => [r.slug as string, r.id]));

  for (const row of rows) {
    if (row.errors.length > 0) {
      result.skipped++;
      result.errors.push(...row.errors);
      continue;
    }
    if (!row.amountPaise || !row.capturedAt || !row.productSlug) {
      result.skipped++;
      continue;
    }

    const explicitProductId = slugToId.get(row.productSlug);
    if (!explicitProductId) {
      result.skipped++;
      result.errors.push(`row ${row.rowNumber}: product '${row.productSlug}' not found — run seed first`);
      continue;
    }

    const match = await mapAmountToProduct(db, row.amountPaise, row.planName);
    const productId =
      match.matchedBy === "unknown" || !match.productId ? explicitProductId : match.productId;
    if (match.matchedBy === "unknown") result.unmapped++;

    // Resolve customer if email or phone given
    let customerId: string | null = null;
    if (row.customerEmail || row.customerPhone) {
      const [existing] = row.customerEmail
        ? await db.select({ id: customers.id }).from(customers).where(eq(customers.email, row.customerEmail)).limit(1)
        : row.customerPhone
          ? await db.select({ id: customers.id }).from(customers).where(eq(customers.phone, row.customerPhone)).limit(1)
          : [undefined];
      if (existing) {
        customerId = existing.id;
      } else {
        const [created] = await db
          .insert(customers)
          .values({
            email: row.customerEmail,
            phone: row.customerPhone,
            primaryProductId: productId,
          })
          .returning({ id: customers.id });
        customerId = created?.id ?? null;
      }
    }

    const pid = row.razorpayPaymentId ?? syntheticPaymentId(row);
    try {
      const inserted = await db
        .insert(payments)
        .values({
          razorpayPaymentId: pid,
          customerId,
          productId,
          amountPaise: row.amountPaise,
          currency: "INR",
          status: "captured",
          capturedAt: row.capturedAt,
          mappingConfidence: match.confidence.toFixed(2),
          source: "csv_import",
          enteredBy,
        })
        .onConflictDoNothing({ target: payments.razorpayPaymentId })
        .returning({ id: payments.id });

      if (inserted.length > 0) {
        result.inserted++;
      } else {
        result.skipped++;
      }
    } catch (e) {
      result.skipped++;
      result.errors.push(
        `row ${row.rowNumber}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  log.info("payments.csv.imported", {
    inserted: result.inserted,
    skipped: result.skipped,
    unmapped: result.unmapped,
    defaultProduct: defaultProductSlug,
  });
  revalidatePath("/mis/revenue");
  revalidatePath("/admin/payments");
  return result;
}
