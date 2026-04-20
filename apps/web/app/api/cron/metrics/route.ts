import { NextResponse, type NextRequest } from "next/server";
import {
  getDb,
  metricsDaily,
  payments,
  products,
  subscriptions,
  sql,
  eq,
  and,
  gte,
  lt,
} from "@tu/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Roll up payments + subscriptions into metrics_daily for a date window.
 *
 * POST /api/cron/metrics?date=2026-04-19   (defaults to yesterday IST)
 * Authorization: Bearer <INTERNAL_API_SECRET>
 *
 * Writes per-product and overall (product_id = null) rows for:
 *   revenue_net_paise, revenue_gross_paise, refunds_paise,
 *   payments_count, active_subs
 *
 * Run nightly (e.g. 02:30 IST) via the DO App Platform cron.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.INTERNAL_API_SECRET ?? ""}`;
  if (!process.env.INTERNAL_API_SECRET || auth !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const day = dateParam ? new Date(dateParam) : yesterdayIst();
  const dayStart = startOfDayUtc(day);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const db = getDb();

  // Per-product revenue + count
  const perProduct = await db
    .select({
      productId: products.id,
      productSlug: products.slug,
      gross: sql<string>`coalesce(sum(${payments.amountPaise}), 0)::text`,
      refunds: sql<string>`coalesce(sum(${payments.amountRefundedPaise}), 0)::text`,
      count: sql<number>`count(${payments.id})::int`,
    })
    .from(products)
    .leftJoin(
      payments,
      and(
        eq(payments.productId, products.id),
        eq(payments.status, "captured"),
        gte(payments.capturedAt, dayStart),
        lt(payments.capturedAt, dayEnd),
      ),
    )
    .groupBy(products.id, products.slug);

  // Active subs per product
  const activeSubs = await db
    .select({
      productId: subscriptions.productId,
      count: sql<number>`count(*)::int`,
    })
    .from(subscriptions)
    .where(eq(subscriptions.status, "active"))
    .groupBy(subscriptions.productId);

  const subMap = new Map<string | null, number>();
  for (const r of activeSubs) subMap.set(r.productId, r.count);

  const dateStr = dayStart.toISOString().slice(0, 10);
  const rows: Array<typeof metricsDaily.$inferInsert> = [];

  let overallGross = 0n;
  let overallRefunds = 0n;
  let overallCount = 0;
  let overallActive = 0;

  for (const r of perProduct) {
    const gross = BigInt(r.gross);
    const refunds = BigInt(r.refunds);
    overallGross += gross;
    overallRefunds += refunds;
    overallCount += r.count;
    const subs = subMap.get(r.productId) ?? 0;
    overallActive += subs;

    rows.push(
      mk(dateStr, r.productId, "revenue_gross_paise", gross),
      mk(dateStr, r.productId, "refunds_paise", refunds),
      mk(dateStr, r.productId, "revenue_net_paise", gross - refunds),
      mkN(dateStr, r.productId, "payments_count", r.count),
      mkN(dateStr, r.productId, "active_subs", subs),
    );
  }

  // Overall (product_id = null)
  rows.push(
    mk(dateStr, null, "revenue_gross_paise", overallGross),
    mk(dateStr, null, "refunds_paise", overallRefunds),
    mk(dateStr, null, "revenue_net_paise", overallGross - overallRefunds),
    mkN(dateStr, null, "payments_count", overallCount),
    mkN(dateStr, null, "active_subs", overallActive),
  );

  // Upsert (PK is composite: date, product_id, metric)
  for (const row of rows) {
    await db
      .insert(metricsDaily)
      .values(row)
      .onConflictDoUpdate({
        target: [metricsDaily.date, metricsDaily.productId, metricsDaily.metric],
        set: {
          valueBigint: row.valueBigint,
          valueNumeric: row.valueNumeric,
          computedAt: new Date(),
        },
      });
  }

  return NextResponse.json({
    ok: true,
    date: dateStr,
    rowsWritten: rows.length,
    perProductBuckets: perProduct.length,
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}

// ---- helpers ----

function mk(
  date: string,
  productId: string | null,
  metric: string,
  value: bigint,
): typeof metricsDaily.$inferInsert {
  return { date, productId, metric, valueBigint: value };
}
function mkN(
  date: string,
  productId: string | null,
  metric: string,
  value: number,
): typeof metricsDaily.$inferInsert {
  return { date, productId, metric, valueNumeric: value.toFixed(2) };
}

function yesterdayIst(): Date {
  // IST = UTC+05:30. We want the IST calendar day that ended <24h ago.
  const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  nowIst.setUTCHours(0, 0, 0, 0);
  return new Date(nowIst.getTime() - 24 * 60 * 60 * 1000 - 5.5 * 60 * 60 * 1000);
}

function startOfDayUtc(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
