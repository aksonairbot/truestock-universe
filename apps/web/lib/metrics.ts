/**
 * Server-side metric queries for the MIS Revenue dashboard.
 *
 * All amounts are in paise (bigint) at the storage layer. Convert to display
 * units only at the edge (see lib/format.ts).
 */
import {
  getDb,
  payments,
  products,
  subscriptions,
  sql,
  eq,
  and,
  gte,
  lt,
  desc,
} from "@tu/db";

export type RevenueTotals = {
  netPaise: bigint;
  grossPaise: bigint;
  refundsPaise: bigint;
  paymentCount: number;
};

export async function revenueBetween(from: Date, to: Date): Promise<RevenueTotals> {
  const db = getDb();
  const [row] = await db
    .select({
      gross: sql<string>`coalesce(sum(${payments.amountPaise}), 0)::text`,
      refunds: sql<string>`coalesce(sum(${payments.amountRefundedPaise}), 0)::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.status, "captured"),
        gte(payments.capturedAt, from),
        lt(payments.capturedAt, to),
      ),
    );

  const grossPaise = BigInt(row?.gross ?? "0");
  const refundsPaise = BigInt(row?.refunds ?? "0");
  return {
    netPaise: grossPaise - refundsPaise,
    grossPaise,
    refundsPaise,
    paymentCount: row?.count ?? 0,
  };
}

export type ByProductRow = {
  productId: string | null;
  productSlug: string;
  productName: string;
  productColor: string | null;
  netPaise: bigint;
  paymentCount: number;
  activeSubs: number;
};

export async function revenueByProductBetween(from: Date, to: Date): Promise<ByProductRow[]> {
  const db = getDb();

  // Revenue + payment count by product
  const revRows = await db
    .select({
      productId: products.id,
      productSlug: products.slug,
      productName: products.name,
      productColor: products.color,
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
        gte(payments.capturedAt, from),
        lt(payments.capturedAt, to),
      ),
    )
    .groupBy(products.id, products.slug, products.name, products.color);

  // Active subs per product
  const subRows = await db
    .select({
      productId: subscriptions.productId,
      count: sql<number>`count(*)::int`,
    })
    .from(subscriptions)
    .where(eq(subscriptions.status, "active"))
    .groupBy(subscriptions.productId);

  const subCount = new Map<string, number>();
  for (const r of subRows) {
    if (r.productId) subCount.set(r.productId, r.count);
  }

  return revRows
    .map<ByProductRow>((r) => {
      const grossPaise = BigInt(r.gross);
      const refundsPaise = BigInt(r.refunds);
      return {
        productId: r.productId,
        productSlug: r.productSlug,
        productName: r.productName,
        productColor: r.productColor,
        netPaise: grossPaise - refundsPaise,
        paymentCount: r.count,
        activeSubs: subCount.get(r.productId) ?? 0,
      };
    })
    .sort((a, b) => Number(b.netPaise - a.netPaise));
}

export type DailyRevenuePoint = { date: string; productSlug: string; netPaise: bigint };

export async function dailyRevenueByProduct(
  from: Date,
  to: Date,
): Promise<DailyRevenuePoint[]> {
  const db = getDb();
  const rows = await db
    .select({
      date: sql<string>`to_char(${payments.capturedAt}::date, 'YYYY-MM-DD')`,
      productSlug: products.slug,
      gross: sql<string>`coalesce(sum(${payments.amountPaise}), 0)::text`,
      refunds: sql<string>`coalesce(sum(${payments.amountRefundedPaise}), 0)::text`,
    })
    .from(payments)
    .innerJoin(products, eq(products.id, payments.productId))
    .where(
      and(
        eq(payments.status, "captured"),
        gte(payments.capturedAt, from),
        lt(payments.capturedAt, to),
      ),
    )
    .groupBy(sql`${payments.capturedAt}::date`, products.slug)
    .orderBy(sql`${payments.capturedAt}::date`);

  return rows.map((r) => ({
    date: r.date,
    productSlug: r.productSlug,
    netPaise: BigInt(r.gross) - BigInt(r.refunds),
  }));
}

export type RecentPayment = {
  id: string;
  razorpayPaymentId: string;
  capturedAt: Date | null;
  amountPaise: bigint;
  currency: string;
  method: string | null;
  productSlug: string | null;
  productName: string | null;
  customerEmail: string | null;
  mappingConfidence: string | null;
  source: string;
};

export async function recentPayments(limit = 25): Promise<RecentPayment[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: payments.id,
      razorpayPaymentId: payments.razorpayPaymentId,
      capturedAt: payments.capturedAt,
      amountPaise: payments.amountPaise,
      currency: payments.currency,
      method: payments.method,
      mappingConfidence: payments.mappingConfidence,
      source: payments.source,
      productSlug: products.slug,
      productName: products.name,
      customerEmail: sql<string | null>`(select c.email from customers c where c.id = ${payments.customerId})`,
    })
    .from(payments)
    .leftJoin(products, eq(products.id, payments.productId))
    .where(eq(payments.status, "captured"))
    .orderBy(desc(payments.capturedAt))
    .limit(limit);

  return rows as RecentPayment[];
}

export type SourceBreakdown = {
  source: string;
  paymentCount: number;
  netPaise: bigint;
};

/** Counts + sums per source for the window — used by the dashboard banner */
export async function paymentSourceBreakdown(from: Date, to: Date): Promise<SourceBreakdown[]> {
  const db = getDb();
  const rows = await db
    .select({
      source: payments.source,
      count: sql<number>`count(*)::int`,
      gross: sql<string>`coalesce(sum(${payments.amountPaise}), 0)::text`,
      refunds: sql<string>`coalesce(sum(${payments.amountRefundedPaise}), 0)::text`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.status, "captured"),
        gte(payments.capturedAt, from),
        lt(payments.capturedAt, to),
      ),
    )
    .groupBy(payments.source);

  return rows.map((r) => ({
    source: r.source,
    paymentCount: r.count,
    netPaise: BigInt(r.gross) - BigInt(r.refunds),
  }));
}

/** Sum of plan amounts of active subs — naive MRR (doesn't normalise for interval). */
export async function approximateMrrPaise(): Promise<bigint> {
  const db = getDb();
  // Normalize plan amounts to a monthly equivalent.
  // Drizzle's sql tag lets us mix expressions cleanly.
  const [row] = await db
    .select({
      mrr: sql<string>`
        coalesce(sum(
          case ${subscriptions.interval}
            when 'monthly'     then ${subscriptions.planAmountPaise}
            when 'quarterly'   then ${subscriptions.planAmountPaise} / 3
            when 'half_yearly' then ${subscriptions.planAmountPaise} / 6
            when 'yearly'      then ${subscriptions.planAmountPaise} / 12
            else 0
          end
        ), 0)::text
      `,
    })
    .from(subscriptions)
    .where(eq(subscriptions.status, "active"));

  return BigInt(row?.mrr ?? "0");
}

/** Count of unmapped (unknown bucket) captured payments in the window. */
export async function unmappedPaymentCount(from: Date, to: Date): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(payments)
    .leftJoin(products, eq(products.id, payments.productId))
    .where(
      and(
        eq(payments.status, "captured"),
        gte(payments.capturedAt, from),
        lt(payments.capturedAt, to),
        sql`(${products.slug} = 'unknown' or ${payments.productId} is null)`,
      ),
    );
  return row?.count ?? 0;
}
